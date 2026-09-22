// Node.js unit tests for pax.js's row-building aggregation.
// Run with: node static/stats/test/pax.test.js

const assert = require('assert');

const dataUtils = require('../assets/js/data.js');
global.f3ParseLocalDate = dataUtils.f3ParseLocalDate;

const { paxBuildRows } = require('../assets/js/pax.js');

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
const byName = (rows, name) => rows.find(r => r['Site'] === name);

console.log('\npaxBuildRows — basic aggregation');

test('returns one row per distinct PAX name', () => {
  const rows = [
    row('2026-08-10', 'Jockey', 'Half Dome'),
    row('2026-08-11', 'Jockey', 'Half Dome', 'Q'),
    row('2026-08-11', 'Rooney', 'Half Dome'),
  ];
  const out = paxBuildRows(rows, NOW);
  assert.strictEqual(out.length, 2);
});

test('Total Post, Total Q and Q/P Ratio are computed per PAX', () => {
  const rows = [
    row('2026-08-08', 'Jockey', 'Half Dome'),
    row('2026-08-09', 'Jockey', 'Half Dome'),
    row('2026-08-10', 'Jockey', 'Half Dome'),
    row('2026-08-11', 'Jockey', 'Half Dome', 'Q'),
  ];
  const jockey = byName(paxBuildRows(rows, NOW), 'Jockey');
  assert.strictEqual(jockey['Total Post'], 4);
  assert.strictEqual(jockey['Total Q'], 1);
  assert.strictEqual(jockey['Q/P Ratio'], 0.25);
});

console.log('\npaxBuildRows — PC Regular threshold');

test('26+ posts in the trailing 26 weeks marks PC Regular true', () => {
  const rows = [];
  for (let i = 0; i < 26; i++) {
    rows.push(row('2026-08-01', 'Jockey', 'Half Dome'));
  }
  const jockey = byName(paxBuildRows(rows, NOW), 'Jockey');
  assert.strictEqual(jockey['PC Regular?'], 'TRUE');
});

test('3+ posts in the trailing 3 weeks marks PC Regular true even under 26 total', () => {
  const rows = [
    row('2026-08-05', 'Rooney', 'Half Dome'),
    row('2026-08-08', 'Rooney', 'Half Dome'),
    row('2026-08-11', 'Rooney', 'Half Dome'),
  ];
  const rooney = byName(paxBuildRows(rows, NOW), 'Rooney');
  assert.strictEqual(rooney['PC Regular?'], 'TRUE');
});

test('below both thresholds marks PC Regular false', () => {
  const rows = [row('2026-08-01', 'Sooey', 'Half Dome')];
  const sooey = byName(paxBuildRows(rows, NOW), 'Sooey');
  assert.strictEqual(sooey['PC Regular?'], 'FALSE');
});

console.log('\npaxBuildRows — excluded sites');

test('#downrange counts toward Total Post but not the PC Regular window', () => {
  const rows = [
    row('2026-08-05', 'Iceman', '#downrange'),
    row('2026-08-08', 'Iceman', '#downrange'),
    row('2026-08-11', 'Iceman', '#downrange'),
  ];
  const iceman = byName(paxBuildRows(rows, NOW), 'Iceman');
  assert.strictEqual(iceman['Total Post'], 3);
  assert.strictEqual(iceman['PC Regular?'], 'FALSE');
});

console.log('\npaxBuildRows — trajectory');

test('more recent activity than the 26-week average is Heating Up', () => {
  const rows = [];
  for (let i = 0; i < 4; i++) rows.push(row('2026-06-01', 'Hitchhiker', 'Half Dome'));
  rows.push(row('2026-08-05', 'Hitchhiker', 'Half Dome'));
  rows.push(row('2026-08-08', 'Hitchhiker', 'Half Dome'));
  const h = byName(paxBuildRows(rows, NOW), 'Hitchhiker');
  assert.strictEqual(h['Trajectory'], '🔥 Heating Up');
});

test('less recent activity than the 26-week average is Cooling Off', () => {
  const rows = [];
  for (let i = 0; i < 20; i++) rows.push(row('2026-03-01', 'Cataracts', 'Half Dome'));
  const c = byName(paxBuildRows(rows, NOW), 'Cataracts');
  assert.strictEqual(c['Trajectory'], '❄️ Cooling Off');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
