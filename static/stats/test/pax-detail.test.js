// Node.js unit tests for pax-detail.js's per-AO aggregation for one PAX.
// Run with: node static/stats/test/pax-detail.test.js

const assert = require('assert');

Object.assign(global, require('../assets/js/data.js'), { F3_MS_PER_WEEK: 604800000 });
const { paxDetailBuildPerAo, paxDetailQBalance } = require('../assets/js/pax-detail.js');

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

console.log('\npaxDetailQBalance — weeks since Q and give/take');

const NOW = new Date(2026, 9, 9); // Oct 9 2026
const posts = (n, date, site) => Array.from({ length: n }, () => row(date, 'Jockey', site || 'Half Dome'));

test('never Q\'d: no date, off track once posting', () => {
  const b = paxDetailQBalance(posts(3, '2026-09-01'), 'Jockey', NOW);
  assert.strictEqual(b.lastQ, null);
  assert.strictEqual(b.weeksSinceQ, null);
  assert.strictEqual(b.onTrack, false);
});

test('weeks since last Q is whole weeks to the most recent Q', () => {
  const rows = [row('2026-06-01', 'Jockey', 'Half Dome', 'Q'), row('2026-09-18', 'Jockey', 'Half Dome', 'Q')];
  const b = paxDetailQBalance(rows, 'Jockey', NOW);
  assert.strictEqual(b.lastQ, '2026-09-18');
  assert.strictEqual(b.weeksSinceQ, 3);
});

test('1 Q in 12 posts is on track; 1 in 13 is due', () => {
  const q = row('2026-09-01', 'Jockey', 'Half Dome', 'Q');
  assert.strictEqual(paxDetailQBalance([q, ...posts(11, '2026-09-02')], 'Jockey', NOW).onTrack, true);
  assert.strictEqual(paxDetailQBalance([q, ...posts(12, '2026-09-02')], 'Jockey', NOW).onTrack, false);
});

test('only the trailing 26 weeks count toward the balance, but not toward last Q', () => {
  const rows = [row('2026-01-05', 'Jockey', 'Half Dome', 'Q'), ...posts(5, '2026-01-06'), ...posts(2, '2026-09-01')];
  const b = paxDetailQBalance(rows, 'Jockey', NOW);
  assert.strictEqual(b.posts, 2);
  assert.strictEqual(b.qs, 0);
  assert.strictEqual(b.lastQ, '2026-01-05');
});

test('#downrange and takeover Qs are ignored; others\' rows too', () => {
  const rows = [
    row('2026-09-10', 'Jockey', '#downrange', 'Q'),
    row('2026-09-23', 'Jockey', 'Half Dome', 'Q'), // SCary takeover window
    row('2026-09-24', 'Rooney', 'Half Dome', 'Q'),
    ...posts(1, '2026-09-01'),
  ];
  const b = paxDetailQBalance(rows, 'Jockey', NOW);
  assert.strictEqual(b.lastQ, null);
  assert.strictEqual(b.posts, 2); // takeover post is still a post
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
