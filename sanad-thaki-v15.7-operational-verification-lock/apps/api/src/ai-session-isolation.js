const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { randomUUID } = require("crypto");

function safeRequire(packageName) {
  try { return require(packageName); }
  catch (err) { return null; }
}

async function withTenantAiSession(companyId, callback) {
  const cleanTenant = String(companyId || "tenant").replace(/[^a-zA-Z0-9_-]/g, "");
  const sessionId = `tenant-ai-${cleanTenant}-${randomUUID()}`;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), sessionId));
  const session = {
    id: sessionId,
    companyId,
    tempDir,
    files: [],
    metadata: Object.freeze({ tenantScope: companyId, createdAt: new Date().toISOString() }),
    async writeTempFile(name, buffer) {
      const safeName = String(name || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = path.join(tempDir, `${Date.now()}-${randomUUID()}-${safeName}`);
      await fs.writeFile(filePath, buffer);
      this.files.push(filePath);
      return filePath;
    }
  };
  try {
    return await callback(session);
  } finally {
    // Best-effort zeroization and cleanup: overwrite files before deleting when possible.
    for (const filePath of session.files || []) {
      try {
        const stat = await fs.stat(filePath);
        if (stat.isFile() && stat.size > 0 && stat.size <= 20 * 1024 * 1024) {
          await fs.writeFile(filePath, Buffer.alloc(stat.size, 0));
        }
      } catch (_) {}
    }
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function requireSharp() {
  const sharp = safeRequire("sharp");
  if (!sharp) throw new Error("Missing dependency: sharp. Install API dependencies before enabling production OCR preprocessing.");
  return sharp;
}

function requireOpenCv() {
  const cv = safeRequire("@techstark/opencv-js") || safeRequire("opencv.js");
  if (!cv) throw new Error("Missing dependency: @techstark/opencv-js. Install API dependencies before enabling production OCR preprocessing.");
  return cv;
}

function normalizeDeskewAngle(rectAngle) {
  let angle = Number(rectAngle || 0);
  // OpenCV minAreaRect returns values commonly in [-90, 0). Convert to smallest practical correction.
  if (angle < -45) angle = 90 + angle;
  if (angle > 45) angle = angle - 90;
  if (!Number.isFinite(angle) || Math.abs(angle) < 0.25) return 0;
  return angle;
}

function matFromRawRgba(cv, raw, width, height) {
  const mat = new cv.Mat(height, width, cv.CV_8UC4);
  mat.data.set(raw);
  return mat;
}

async function preprocessInvoiceImage({ buffer, mimeType, session }) {
  if (!String(mimeType || "").startsWith("image/")) {
    return { buffer, mimeType, skipped: true, reason: "non-image-file" };
  }

  const sharp = requireSharp();
  const cv = requireOpenCv();

  // Load and check metadata for upscaling
  let sharpPipeline = sharp(buffer).rotate();
  const meta = await sharpPipeline.metadata();
  const originalWidth = meta.width || 0;
  const originalHeight = meta.height || 0;

  // 1. Auto-upscale low-quality images to at least 2048px on the longest edge
  let didUpscale = false;
  if (originalWidth > 0 && originalHeight > 0 && (originalWidth < 2048 && originalHeight < 2048)) {
    const scaleFactor = Math.max(2048 / originalWidth, 2048 / originalHeight);
    const newWidth = Math.round(originalWidth * scaleFactor);
    const newHeight = Math.round(originalHeight * scaleFactor);
    sharpPipeline = sharpPipeline.resize(newWidth, newHeight, { kernel: "lanczos3" });
    didUpscale = true;
  }

  // 2. Contrast enhancement (.normalize()) and Sharpening (.sharpen())
  sharpPipeline = sharpPipeline.normalize().sharpen({ sigma: 1.2 });

  const decoded = await sharpPipeline
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = decoded.info;
  const src = matFromRawRgba(cv, decoded.data, width, height);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const threshold = new cv.Mat();
  const inverted = new cv.Mat();
  const nonZero = new cv.Mat();
  let cropped = null;
  let rotated = null;
  let outputMat = null;
  let useCropped = false;

  try {
    // 3. Grayscale conversion
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

    // 4. Noise reduction via Gaussian Blur
    cv.GaussianBlur(gray, blurred, new cv.Size(3, 3), 0, 0, cv.BORDER_DEFAULT);

    // 5. Adaptive Thresholding to resolve poor lighting and shadows
    cv.adaptiveThreshold(
      blurred,
      threshold,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY,
      31,
      11
    );

    // 6. Auto-detect invoice boundaries & Auto-crop
    cv.bitwise_not(threshold, inverted);
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(inverted, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let largestRect = null;
    let maxArea = 0;
    for (let i = 0; i < contours.size(); ++i) {
      let cnt = contours.get(i);
      let area = cv.contourArea(cnt);
      if (area > maxArea) {
        maxArea = area;
        largestRect = cv.boundingRect(cnt);
      }
      cnt.delete();
    }
    contours.delete();
    hierarchy.delete();

    // If largest area covers at least 15% of the overall canvas, crop to it with padding
    if (largestRect && maxArea > (width * height * 0.15)) {
      const pad = 20;
      let x = Math.max(0, largestRect.x - pad);
      let y = Math.max(0, largestRect.y - pad);
      let w = Math.min(width - x, largestRect.width + 2 * pad);
      let h = Math.min(height - y, largestRect.height + 2 * pad);
      
      if (w > 100 && h > 100) {
        let rect = new cv.Rect(x, y, w, h);
        cropped = threshold.roi(rect);
        useCropped = true;
      }
    }

    const finalThreshold = useCropped ? cropped : threshold;

    // 7. Deskew (Rotation correction)
    cv.bitwise_not(finalThreshold, inverted);
    cv.findNonZero(inverted, nonZero);
    let angle = 0;
    if (nonZero.rows > 20) {
      const rect = cv.minAreaRect(nonZero);
      angle = normalizeDeskewAngle(rect.angle);
    }

    if (angle !== 0) {
      const center = new cv.Point(finalThreshold.cols / 2, finalThreshold.rows / 2);
      const matrix = cv.getRotationMatrix2D(center, angle, 1.0);
      rotated = new cv.Mat();
      cv.warpAffine(
        finalThreshold,
        rotated,
        matrix,
        new cv.Size(finalThreshold.cols, finalThreshold.rows),
        cv.INTER_LINEAR,
        cv.BORDER_CONSTANT,
        new cv.Scalar(255, 255, 255, 255)
      );
      matrix.delete();
      outputMat = rotated;
    } else {
      outputMat = finalThreshold;
    }

    const pngBuffer = await sharp(Buffer.from(outputMat.data), {
      raw: { width: outputMat.cols, height: outputMat.rows, channels: 1 }
    }).png().toBuffer();

    if (session?.writeTempFile) await session.writeTempFile("preprocessed-invoice.png", pngBuffer);

    // Build steps array dynamically to reflect what was done
    const steps = ["grayscale", "noise-reduction-blur", "contrast-enhancement", "sharpening", "adaptive-thresholding"];
    if (didUpscale) steps.unshift("bicubic-upscaling");
    if (useCropped) steps.push("auto-boundary-crop");
    if (angle !== 0) steps.push("deskewing-rotation-correction");

    return {
      buffer: pngBuffer,
      mimeType: "image/png",
      skipped: false,
      width: outputMat.cols,
      height: outputMat.rows,
      deskewAngle: angle,
      steps
    };
  } finally {
    src.delete(); gray.delete(); blurred.delete(); threshold.delete(); inverted.delete(); nonZero.delete();
    if (cropped) cropped.delete();
    if (rotated) rotated.delete();
  }
}

async function runGoogleDocumentAi({ buffer, mimeType, session }) {
  const processorName = process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_NAME;
  if (!processorName) return { enabled: false, reason: "GOOGLE_DOCUMENT_AI_PROCESSOR_NAME is not configured" };

  const documentai = safeRequire("@google-cloud/documentai");
  if (!documentai) throw new Error("Missing dependency: @google-cloud/documentai. Install API dependencies before enabling Google Document AI.");

  const { DocumentProcessorServiceClient } = documentai.v1 || documentai;
  const client = new DocumentProcessorServiceClient({
    apiEndpoint: process.env.GOOGLE_DOCUMENT_AI_API_ENDPOINT || undefined
  });

  const [result] = await client.processDocument({
    name: processorName,
    rawDocument: {
      content: Buffer.from(buffer).toString("base64"),
      mimeType
    }
  });

  const document = result.document || {};
  if (session?.writeTempFile) {
    await session.writeTempFile("document-ai-response.json", Buffer.from(JSON.stringify({ textLength: (document.text || "").length, pages: document.pages?.length || 0 })));
  }

  return {
    enabled: true,
    text: document.text || "",
    entities: extractDocumentAiEntities(document),
    lineItems: extractDocumentAiLineItems(document),
    rawConfidence: averageDocumentConfidence(document)
  };
}

function averageDocumentConfidence(document) {
  const values = [];
  for (const entity of document.entities || []) if (Number.isFinite(entity.confidence)) values.push(entity.confidence);
  for (const page of document.pages || []) {
    for (const table of page.tables || []) {
      for (const row of [...(table.headerRows || []), ...(table.bodyRows || [])]) {
        for (const cell of row.cells || []) if (Number.isFinite(cell.layout?.confidence)) values.push(cell.layout.confidence);
      }
    }
  }
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function textFromLayout(fullText, layout) {
  const segments = layout?.textAnchor?.textSegments || [];
  return segments.map(seg => {
    const start = Number(seg.startIndex || 0);
    const end = Number(seg.endIndex || 0);
    return fullText.slice(start, end);
  }).join(" ").replace(/\s+/g, " ").trim();
}

function extractDocumentAiEntities(document) {
  const entities = {};
  for (const entity of document.entities || []) {
    const key = String(entity.type || "").trim();
    if (!key) continue;
    entities[key] = {
      mentionText: entity.mentionText || entity.normalizedValue?.text || "",
      confidence: entity.confidence ?? null
    };
  }
  return entities;
}

function extractDocumentAiLineItems(document) {
  const fullText = document.text || "";
  const lineItems = [];
  for (const page of document.pages || []) {
    for (const table of page.tables || []) {
      const rows = table.bodyRows || [];
      for (const row of rows) {
        const cells = (row.cells || []).map(cell => textFromLayout(fullText, cell.layout));
        if (!cells.some(Boolean)) continue;
        lineItems.push({
          name: cells[0] || "",
          quantity: cells[1] || "",
          unitPrice: cells[2] || "",
          total: cells[3] || "",
          rawCells: cells
        });
      }
    }
  }
  return lineItems;
}

function prepareOpenCvPreprocessPlan() {
  return {
    engine: "opencv-js-production",
    steps: ["grayscale", "gaussian-blur", "adaptive-thresholding", "deskewing"],
    note: "Real preprocessing runs inside a tenant-scoped temp session and is deleted after processing."
  };
}

module.exports = {
  withTenantAiSession,
  preprocessInvoiceImage,
  runGoogleDocumentAi,
  prepareOpenCvPreprocessPlan
};
