// Node.js unit tests for data.js pure functions
// Run with: node static/stats/test/data.test.js

const assert = require('assert');
const { f3ParseCSVLine, f3ParseCSV, f3FilterByDateRange, f3Esc, f3CountsTowardAttendance, f3IsRealAo, f3PcRegularMap, f3CanonicalSite } = require('../assets/js/data.js');

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

test('filters M/D/YYYY dates from Google Sheets format', () => {
  const rows = [{ Date: '1/15/2025' }, { Date: '6/1/2025' }, { Date: '12/31/2025' }];
  const result = f3FilterByDateRange(rows, 'Date', '2025-03-01', '2025-09-01');
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0]['Date'], '6/1/2025');
});

// --- f3Esc ---
console.log('\nf3Esc');

test('escapes HTML special characters', () => {
  assert.strictEqual(f3Esc('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
});

test('escapes double quotes', () => {
  assert.strictEqual(f3Esc('"hello"'), '&quot;hello&quot;');
});

test('escapes ampersands', () => {
  assert.strictEqual(f3Esc('A&B'), 'A&amp;B');
});

test('handles null/undefined gracefully', () => {
  assert.strictEqual(f3Esc(null), '');
  assert.strictEqual(f3Esc(undefined), '');
});

console.log('\nf3CountsTowardAttendance');

test('a normal AO counts toward attendance', () => {
  assert.strictEqual(f3CountsTowardAttendance('Half Dome'), true);
});

test('#downrange does not count toward attendance', () => {
  assert.strictEqual(f3CountsTowardAttendance('#downrange'), false);
});

test('Shield Lock does not count toward attendance', () => {
  assert.strictEqual(f3CountsTowardAttendance('Shield Lock'), false);
});

test('a junk-AO display name still counts toward attendance (different concept)', () => {
  assert.strictEqual(f3CountsTowardAttendance('Convergence'), true);
});

console.log('\nf3IsRealAo — defaults (ao.js / pax.js Popular-AO chart behavior)');

test('a normal AO is real', () => {
  assert.strictEqual(f3IsRealAo('Half Dome'), true);
});

test('#downrange is excluded by default', () => {
  assert.strictEqual(f3IsRealAo('#downrange'), false);
});

test('Shieldlock is excluded by default', () => {
  assert.strictEqual(f3IsRealAo('Shieldlock'), false);
});

test('a junk-AO display name is excluded by default', () => {
  assert.strictEqual(f3IsRealAo('Convergence'), false);
});

test('matching ignores case and surrounding whitespace', () => {
  assert.strictEqual(f3IsRealAo('  CONVERGENCE  '), false);
  assert.strictEqual(f3IsRealAo('#DOWNRANGE'), false);
});

console.log('\nf3IsRealAo — pax-detail.js carve-out (includeDownrange + includeShieldlock)');

test('#downrange gets its own card when includeDownrange is set', () => {
  assert.strictEqual(f3IsRealAo('#downrange', { includeDownrange: true, includeShieldlock: true }), true);
});

test('Shieldlock gets its own card when includeShieldlock is set', () => {
  assert.strictEqual(f3IsRealAo('Shieldlock', { includeDownrange: true, includeShieldlock: true }), true);
});

test('junk-AO display names are still excluded even with both options set', () => {
  assert.strictEqual(f3IsRealAo('Convergence', { includeDownrange: true, includeShieldlock: true }), false);
});

console.log('\nf3PcRegularMap — the shared PC Regular rule');

const row = (date, name, site) => ({ Date: date, Name: name, Site: site || 'Half Dome' });
const NOW = new Date('2026-08-15T12:00:00');

test('26+ posts in the trailing 26 weeks is PC Regular', () => {
  const rows = [];
  for (let i = 0; i < 26; i++) rows.push(row('2026-08-01', 'Jockey'));
  assert.strictEqual(f3PcRegularMap(rows, NOW)['Jockey'], true);
});

test('3+ posts in the trailing 3 weeks is PC Regular even under 26 total', () => {
  const rows = [
    row('2026-08-05', 'Rooney'),
    row('2026-08-08', 'Rooney'),
    row('2026-08-11', 'Rooney'),
  ];
  assert.strictEqual(f3PcRegularMap(rows, NOW)['Rooney'], true);
});

test('below both thresholds is not PC Regular', () => {
  const rows = [row('2026-08-01', 'Sooey')];
  assert.strictEqual(f3PcRegularMap(rows, NOW)['Sooey'], false);
});

test('exactly 26 in the 26-week window is the inclusive boundary', () => {
  // Dated outside the 3-week window so only the 26-week count is in play.
  const rows = [];
  for (let i = 0; i < 25; i++) rows.push(row('2026-06-01', 'Iceman'));
  assert.strictEqual(f3PcRegularMap(rows, NOW)['Iceman'], false);
  rows.push(row('2026-06-01', 'Iceman'));
  assert.strictEqual(f3PcRegularMap(rows, NOW)['Iceman'], true);
});

test('#downrange does not count toward either window', () => {
  const rows = [
    row('2026-08-05', 'Cataracts', '#downrange'),
    row('2026-08-08', 'Cataracts', '#downrange'),
    row('2026-08-11', 'Cataracts', '#downrange'),
  ];
  assert.ok(!f3PcRegularMap(rows, NOW)['Cataracts']);
});

console.log('\nf3CanonicalSite — WWCM merged into NeighborUp');

test('WWCM historical posts attribute to NeighborUp', () => {
  assert.strictEqual(f3CanonicalSite('WWCM'), 'NeighborUp');
});

test('matching ignores case and surrounding whitespace', () => {
  assert.strictEqual(f3CanonicalSite('  wwcm  '), 'NeighborUp');
  assert.strictEqual(f3CanonicalSite('Wwcm'), 'NeighborUp');
});

test('NeighborUp posts pass through unchanged', () => {
  assert.strictEqual(f3CanonicalSite('NeighborUp'), 'NeighborUp');
});

test('an unrelated site passes through unchanged', () => {
  assert.strictEqual(f3CanonicalSite('Half Dome'), 'Half Dome');
});

test('handles null/empty gracefully', () => {
  assert.strictEqual(f3CanonicalSite(''), '');
  assert.strictEqual(f3CanonicalSite(null), '');
});

// --- Summary ---
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
