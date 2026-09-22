// Node.js unit tests for fng.js's FNG lifecycle and row-building aggregation.
// Run with: node static/stats/test/fng.test.js

const assert = require('assert');

const dataUtils = require('../assets/js/data.js');
global.f3ParseLocalDate = dataUtils.f3ParseLocalDate;

const { fngStatus, fngBuildRows } = require('../assets/js/fng.js');

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

const row = (date, name, site, role) => ({ Date: date, Name: name, Site: site, Role: role || 'P' });
const NOW = new Date('2026-08-15T12:00:00');
const byName = (rows, name) => rows.find(r => r['FNG Name'] === name);

console.log('\nfngStatus — lifecycle branches');

test('10+ posts is Regular', () => {
  assert.strictEqual(fngStatus(10, new Date('2026-01-01'), NOW), '🛡️ Regular');
});

test('2-9 posts is Developing (Returned)', () => {
  assert.strictEqual(fngStatus(2, new Date('2026-08-01'), NOW), '🌱 Developing (Returned)');
});

test('1 post more than 14 days ago is Ghosted', () => {
  assert.strictEqual(fngStatus(1, new Date('2026-07-01'), NOW), '👻 Ghosted');
});

test('1 post within 14 days is Pending (Grace Period)', () => {
  assert.strictEqual(fngStatus(1, new Date('2026-08-10'), NOW), '⏳ Pending (Grace Period)');
});

test('0 posts is Checking Data...', () => {
  assert.strictEqual(fngStatus(0, new Date('2026-08-10'), NOW), 'Checking Data...');
});

console.log('\nfngBuildRows — who counts as an FNG');

test('a PAX with an FNG-tagged record produces a row', () => {
  const rows = [row('2026-08-01', 'Sooey', 'Half Dome', 'FNG')];
  const out = fngBuildRows(rows, NOW);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0]['FNG Name'], 'Sooey');
  assert.strictEqual(out[0]['Home AO'], 'Half Dome');
});

test('a PAX with no FNG-tagged record produces no row', () => {
  const rows = [row('2026-08-01', 'Rooney', 'Half Dome')];
  assert.strictEqual(fngBuildRows(rows, NOW).length, 0);
});

console.log('\nfngBuildRows — totals and second post');

test('Total Posts to date excludes #downrange', () => {
  const rows = [
    row('2026-08-01', 'Iceman', 'Half Dome', 'FNG'),
    row('2026-08-03', 'Iceman', '#downrange'),
  ];
  const iceman = byName(fngBuildRows(rows, NOW), 'Iceman');
  assert.strictEqual(iceman['Total Posts to date'], 1);
});

test('2nd Post and Days to 2nd post come from the second chronological record', () => {
  const rows = [
    row('2026-08-01', 'Hitchhiker', 'Half Dome', 'FNG'),
    row('2026-08-06', 'Hitchhiker', 'Half Dome'),
  ];
  const h = byName(fngBuildRows(rows, NOW), 'Hitchhiker');
  assert.strictEqual(h['2nd Post'], '8/6/2026');
  assert.strictEqual(h['Days to 2nd post'], 5);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
