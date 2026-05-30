const fs = require('fs');

const buf = fs.readFileSync('scratch/test.pdf');
const pdfStr = buf.toString('binary'); // read as binary to avoid utf8 mapping issues

const objRegex = /(\d+)\s+(\d+)\s+obj/g;
let match;
console.log("Actual object offsets in file:");
while ((match = objRegex.exec(pdfStr)) !== null) {
  console.log(`Object ${match[1]} starts at offset ${match.index}`);
}

console.log("\nOffsets in xref table:");
const xrefIndex = pdfStr.indexOf('xref');
console.log("xref starts at offset:", xrefIndex);

const lines = pdfStr.slice(xrefIndex).split('\n');
console.log("xref lines:");
lines.slice(0, 10).forEach(l => console.log(JSON.stringify(l)));
