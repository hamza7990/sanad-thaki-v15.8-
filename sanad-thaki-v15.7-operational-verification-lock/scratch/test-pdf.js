const fs = require('fs');

function minimalPdfBuffer(title, lines) {
  const safeLines = [title, ...lines].map(v => String(v ?? "").replace(/[()\\]/g, " ").slice(0, 100));
  
  // Clean ASCII conversion to ensure Helvetica font doesn't display garbled text
  const cleanLines = safeLines.map(line => {
    // replace non-ASCII characters with safe equivalents or strip them
    return line.replace(/[^\x00-\x7F]/g, "?");
  });

  const content = cleanLines.map((line, idx) => `BT /F1 11 Tf 50 ${760 - idx * 18} Td (${line}) Tj ET`).join("\r\n");
  const stream = Buffer.from(content, "ascii");
  
  const objects = [
    Buffer.from("1 0 obj\r\n<< /Type /Catalog /Pages 2 0 R >>\r\nendobj\r\n", "ascii"),
    Buffer.from("2 0 obj\r\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\r\nendobj\r\n", "ascii"),
    Buffer.from("3 0 obj\r\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\r\nendobj\r\n", "ascii"),
    Buffer.from("4 0 obj\r\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\r\nendobj\r\n", "ascii"),
    Buffer.concat([
      Buffer.from(`5 0 obj\r\n<< /Length ${stream.length} >>\r\nstream\r\n`, "ascii"),
      stream,
      Buffer.from("\r\nendstream\r\nendobj\r\n", "ascii")
    ])
  ];

  const chunks = [Buffer.from("%PDF-1.4\r\n", "ascii")];
  const offsets = [0];
  
  let currentOffset = chunks[0].length;
  for (const obj of objects) {
    offsets.push(currentOffset);
    chunks.push(obj);
    currentOffset += obj.length;
  }
  
  const xrefOffset = currentOffset;
  
  // Build Xref section
  let xrefStr = `xref\r\n0 ${objects.length + 1}\r\n`;
  xrefStr += "0000000000 65535 f\r\n";
  for (let i = 1; i < offsets.length; i++) {
    xrefStr += String(offsets[i]).padStart(10, "0") + " 00000 n\r\n";
  }
  
  const trailerStr = `trailer\r\n<< /Size ${objects.length + 1} /Root 1 0 R >>\r\nstartxref\r\n${xrefOffset}\r\n%%EOF\r\n`;
  
  chunks.push(Buffer.from(xrefStr, "ascii"));
  chunks.push(Buffer.from(trailerStr, "ascii"));
  
  return Buffer.concat(chunks);
}

const title = "تقرير مالي سند ذكي (Sanad)";
const lines = [
  "إجمالي الفواتير: 12",
  "المبالغ المعلقة: 15000",
  "المبالغ المدفوعة: 5000",
  "معدل التحصيل: 25%"
];

const pdfBuffer = minimalPdfBuffer(title, lines);
fs.writeFileSync('scratch/test.pdf', pdfBuffer);
console.log("PDF written to scratch/test.pdf. Length:", pdfBuffer.length);
