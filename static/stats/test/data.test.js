// Node.js unit tests for data.js pure functions
// Run with: node static/stats/test/data.test.js

const assert = require('assert');
const { f3ParseCSVLine, f3ParseCSV, f3FilterByDateRange } = require('../assets/js/data.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
    failed++;
  }
}

// --- f3ParseCSVLine ---
console.log('\nf3ParseCSVLine');

test('splits simple CSV line', () => {
  assert.deepStrictEqual(f3ParseCSVLine('foo,bar,baz'), ['foo', 'bar', 'baz']);
});

test('handles quoted fields with commas', () => {
  assert.deepStrictEqual(f3ParseCSVLine('"Biner, Jr",Q,12'), ['Biner, Jr', 'Q', '12']);
});

test('handles escaped double quotes', () => {
  assert.deepStrictEqual(f3ParseCSVLine('"say ""hello""",test'), ['say "hello"', 'test']);
});

test('handles empty fields', () => {
  assert.deepStrictEqual(f3ParseCSVLine('foo,,baz'), ['foo', '', 'baz']);
});

test('strips Windows CR from last field', () => {
  assert.deepStrictEqual(f3ParseCSVLine('foo,bar\r'), ['foo', 'bar']);
});

// --- f3ParseCSV ---
console.log('\nf3ParseCSV');

test('parses CSV with header at row 0', () => {
  const csv = 'Name,Posts,Status\nBig Red,12,Active\nBiner,8,Active';
  const rows = f3ParseCSV(csv, 0);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0]['Name'], 'Big Red');
  assert.strictEqual(rows[0]['Posts'], '12');
  assert.strictEqual(rows[1]['Name'], 'Biner');
});

test('parses CSV with header at row 2 (skips metadata rows)', () => {
  const csv = 'meta1,meta2\n\nName,Posts\nBig Red,12\nBiner,8';
  const rows = f3ParseCSV(csv, 2);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0]['Name'], 'Big Red');
});

test('skips blank data rows', () => {
  const csv = 'Name,Posts\nBig Red,12\n\nBiner,8';
  const rows = f3ParseCSV(csv, 0);
  assert.strictEqual(rows.length, 2);
});

test('trims header whitespace', () => {
  const csv = 'Name , Posts \nBig Red,12';
  const rows = f3ParseCSV(csv, 0);
  assert.strictEqual(rows[0]['Name'], 'Big Red');
  assert.strictEqual(rows[0]['Posts'], '12');
});

// --- f3FilterByDateRange ---
console.log('\nf3FilterByDateRange');

test('returns all rows when no from/to given', () => {
  const rows = [{ Date: '2026-01-01' }, { Date: '2026-03-01' }];
  assert.strictEqual(f3FilterByDateRange(rows, 'Date', '', '').length, 2);
});

test('filters rows before from date', () => {
  const rows = [{ Date: '2025-12-01' }, { Date: '2026-02-01' }];
  const result = f3FilterByDateRange(rows, 'Date', '2026-01-01', '');
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0]['Date'], '2026-02-01');
});

test('filters rows after to date', () => {
  const rows = [{ Date: '2026-01-01' }, { Date: '2026-04-01' }];
  const result = f3FilterByDateRange(rows, 'Date', '', '2026-02-01');
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0]['Date'], '2026-01-01');
});

test('keeps rows with unparseable dates', () => {
  const rows = [{ Date: 'Never' }, { Date: '2026-01-01' }];
  const result = f3FilterByDateRange(rows, 'Date', '2025-01-01', '2026-12-31');
  assert.strictEqual(result.length, 2);
});

// --- Summary ---
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
