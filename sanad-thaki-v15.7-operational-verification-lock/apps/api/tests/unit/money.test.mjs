import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parseMoney } = require('../../src/money.js');

test('parseMoney keeps decimal separator and strips currency text', () => {
  assert.equal(parseMoney('1234.56'), 1234.56);
  assert.equal(parseMoney('1,234.56'), 1234.56);
  assert.equal(parseMoney('500.00 SAR'), 500);
  assert.equal(parseMoney('ر.س 500.00'), 500);
});

test('parseMoney handles Arabic decimal and negatives', () => {
  assert.equal(parseMoney('٫50'), 0.5);
  assert.equal(parseMoney('(1,200.50)'), -1200.5);
});

test('parseMoney rejects non-numeric and malformed numbers', () => {
  assert.equal(parseMoney('abc'), null);
  assert.equal(parseMoney('1.2.3'), null);
});
