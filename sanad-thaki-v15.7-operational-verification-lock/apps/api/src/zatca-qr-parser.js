function parseZatcaQrBase64(input) {
  const rawInput = String(input || "").trim();
  if (!rawInput) return null;

  let tlvBuffer;
  try {
    tlvBuffer = Buffer.from(rawInput, "base64");
    // Some scanners return decoded TLV bytes as latin1-like text; retry with raw if base64 is invalid-looking.
    if (!tlvBuffer.length || tlvBuffer.every(b => b === 0)) return null;
  } catch (_) {
    return null;
  }

  const fields = {};
  let offset = 0;
  while (offset + 2 <= tlvBuffer.length) {
    const tag = tlvBuffer[offset];
    const length = tlvBuffer[offset + 1];
    offset += 2;
    if (length < 0 || offset + length > tlvBuffer.length) break;
    const valueBuffer = tlvBuffer.subarray(offset, offset + length);
    offset += length;
    const value = valueBuffer.toString("utf8").trim();
    switch (tag) {
      case 1: fields.supplierName = value; break;
      case 2: fields.supplierTaxNumber = value.replace(/\D/g, ""); break;
      case 3: fields.invoiceDateTime = value; break;
      case 4: fields.totalAmount = parseDecimal(value); break;
      case 5: fields.vatAmount = parseDecimal(value); break;
      default:
        if (!fields.extraTags) fields.extraTags = {};
        fields.extraTags[String(tag)] = value;
    }
  }

  const required = [fields.supplierName, fields.supplierTaxNumber, fields.invoiceDateTime, fields.totalAmount, fields.vatAmount];
  if (required.filter(v => v !== undefined && v !== null && v !== "").length < 3) return null;
  return {
    ...fields,
    source: "zatca_qr_tlv",
    confidence: required.every(v => v !== undefined && v !== null && v !== "") ? 0.99 : 0.9
  };
}

function parseDecimal(value) {
  const normalized = String(value || "").replace(/[٠-٩]/g, ch => "٠١٢٣٤٥٦٧٨٩".indexOf(ch)).replace(/,/g, "");
  const n = Number(normalized.match(/\d+(?:\.\d{1,2})?/)?.[0]);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

async function extractQrPayloadFromImage({ buffer, mimeType }) {
  if (!String(mimeType || "").startsWith("image/")) return null;
  const sharp = optionalRequire("sharp");
  const jsQR = optionalRequire("jsqr");
  if (!sharp || !jsQR) throw new Error("Missing dependencies: sharp and jsqr are required for ZATCA QR decoding.");

  const decoded = await sharp(buffer).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const qr = jsQR(new Uint8ClampedArray(decoded.data), decoded.info.width, decoded.info.height, {
    inversionAttempts: "attemptBoth"
  });
  return qr?.data || null;
}

async function parseZatcaQrFromImage({ buffer, mimeType }) {
  const payload = await extractQrPayloadFromImage({ buffer, mimeType });
  if (!payload) return null;
  return parseZatcaQrBase64(payload);
}

function optionalRequire(name) {
  try { return require(name); } catch (_) { return null; }
}

module.exports = {
  parseZatcaQrBase64,
  parseZatcaQrFromImage
};
