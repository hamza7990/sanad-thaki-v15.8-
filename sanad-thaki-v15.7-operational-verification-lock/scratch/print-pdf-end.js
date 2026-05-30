const fs = require('fs');
const buf = fs.readFileSync('scratch/test.pdf');
console.log(buf.toString('utf8', buf.length - 200));
