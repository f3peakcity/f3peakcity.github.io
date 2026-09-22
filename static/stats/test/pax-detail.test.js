// Node.js unit tests for pax-detail.js's per-AO aggregation for one PAX.
// Run with: node static/stats/test/pax-detail.test.js

const assert = require('assert');

global.f3IsRealAo = require('../assets/js/data.js').f3IsRealAo;
const { paxDetailBuildPerAo } = require('../assets/js/pax-detail.js');

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
const byAo = (rows, ao) => rows.find(r => r['AO'] === ao);

console.log('\npaxDetailBuildPerAo — every real AO gets a card');

test('an AO this PAX never attended still appears, with zero posts', () => {
  const rows = [
    row('2026-08-01', 'Jockey', 'Half Dome'),
    row('2026-08-01', 'Rooney', 'Dante\'s Peak'),
  ];
  const out = paxDetailBuildPerAo(rows, 'Jockey');
  const dantesPeak = byAo(out, "Dante's Peak");
  assert.ok(dantesPeak, "Dante's Peak should have a card even with 0 posts");
  assert.strictEqual(dantesPeak['Posts'], 0);
});

test('display-excluded sites never get a card, not even a zero-post one', () => {
  const rows = [row('2026-08-01', 'Rooney', 'Convergence')];
  const out = paxDetailBuildPerAo(rows, 'Jockey');
  assert.strictEqual(byAo(out, 'Convergence'), undefined);
});

console.log('\npaxDetailBuildPerAo — per-AO totals for this PAX only');

test('posts and Qs are counted for the named PAX, not other PAX', () => {
  const rows = [
    row('2026-08-01', 'Jockey', 'Half Dome'),
    row('2026-08-08', 'Jockey', 'Half Dome', 'Q'),
    row('2026-08-01', 'Rooney', 'Half Dome'),
  ];
  const hd = byAo(paxDetailBuildPerAo(rows, 'Jockey'), 'Half Dome');
  assert.strictEqual(hd['Posts'], 2);
  assert.strictEqual(hd['Qs'], 1);
});

test('Last Post and Last Q track the most recent date', () => {
  const rows = [
    row('2026-08-01', 'Jockey', 'Half Dome', 'Q'),
    row('2026-08-15', 'Jockey', 'Half Dome'),
  ];
  const hd = byAo(paxDetailBuildPerAo(rows, 'Jockey'), 'Half Dome');
  assert.strictEqual(hd['Last Post'], '2026-08-15');
  assert.strictEqual(hd['Last Q'], '2026-08-01');
});

console.log('\npaxDetailBuildPerAo — deliberate inclusion of downrange/Shieldlock');

test('#downrange posts count toward this PAX\'s own detail page (unlike ao.js/pax.js)', () => {
  const rows = [row('2026-08-01', 'Jockey', '#downrange')];
  const out = paxDetailBuildPerAo(rows, 'Jockey');
  const dr = byAo(out, '#downrange');
  assert.ok(dr, '#downrange should have its own card here');
  assert.strictEqual(dr['Posts'], 1);
});

console.log('\npaxDetailBuildPerAo — card order');

test('AOs sort by posts descending, then alphabetically', () => {
  const rows = [
    row('2026-08-01', 'Jockey', 'Zeta'),
    row('2026-08-01', 'Jockey', 'Alpha'),
    row('2026-08-02', 'Jockey', 'Alpha'),
  ];
  const out = paxDetailBuildPerAo(rows, 'Jockey');
  assert.deepStrictEqual(out.map(r => r['AO']), ['Alpha', 'Zeta']);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
