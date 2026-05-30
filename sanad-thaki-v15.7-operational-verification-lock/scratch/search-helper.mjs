import fs from 'node:fs';

const filePath = 'apps/api/src/server.js';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

for (let i = 34; i < 55; i++) {
  if (lines[i] !== undefined) {
    console.log(`${i + 1}: ${lines[i]}`);
  }
}
