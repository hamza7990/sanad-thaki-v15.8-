function parseMoney(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100) / 100;
  let text = String(value).trim();
  if (!text) return null;
  const negative = /^\(.*\)$/.test(text) || /^-/.test(text);
  text = text
    .replace(/ر\.?\s*س\.?/g, "")
    .replace(/\b(SAR|sar|ريال)\b/gi, "")
    .replace(/[()\s\u00A0\u200B\uFEFF]/g, "")
    .replace(/٫/g, ".")
    .replace(/[،,]/g, "")
    .replace(/[^0-9.\-]/g, "");
  if (!/\d/.test(text)) return null;
  const firstDot = text.indexOf(".");
  if (firstDot !== -1 && text.indexOf(".", firstDot + 1) !== -1) return null;
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  const amount = Math.abs(n);
  return Math.round((negative ? -amount : amount) * 100) / 100;
}
module.exports = { parseMoney };
