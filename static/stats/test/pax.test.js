// Node.js unit tests for pax.js's row-building aggregation.
// Run with: node static/stats/test/pax.test.js

const assert = require('assert');

const dataUtils = require('../assets/js/data.js');
global.f3ParseLocalDate = dataUtils.f3ParseLocalDate;
global.f3CountsTowardAttendance = dataUtils.f3CountsTowardAttendance;
global.f3IsRealAo = dataUtils.f3IsRealAo;
global.F3_PC_REGULAR_WEEKS = 26;
global.F3_MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
global.f3PcRegularMap = dataUtils.f3PcRegularMap;

const { paxBuildRows, paxRegularTrend, paxCotters, PAX_COTTER_QUIET_DAYS, PAX_COTTER_MAX_DAYS } = require('../assets/js/pax.js');

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

console.log('\nPotential Cotters');

const COTTER_NOW = new Date(2026, 9, 8);   // Oct 8, 2026
// n posts, one every 3 days, the last one on `lastIso`, at `site`.
function streak(name, lastIso, n, site = 'Das Boot') {
  const last = new Date(lastIso + 'T00:00:00');
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(last); d.setDate(last.getDate() - 3 * (n - 1 - i));
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { Date: iso, Name: name, Site: site, Role: 'P' };
  });
}

test('regulars quiet 21+ days are listed; too few posts, too recent or too long gone are not', () => {
  const rows = [
    ...streak('Quiet', '2026-09-01', 8),                       // 37 days away, 8 posts: in
    ...streak('Thin', '2026-09-01', 7),                        // only 7 posts: out
    ...streak('Edge', '2026-09-17', 8),                        // exactly 21 days: in
    ...streak('Recent', '2026-09-20', 12),                     // 18 days: out
    ...streak('LongGone', '2026-03-01', 20),                   // 221 days: out
  ];
  const got = paxCotters(rows, COTTER_NOW).map(c => [c.name, c.daysAway]);
  assert.deepStrictEqual(got, [['Edge', PAX_COTTER_QUIET_DAYS], ['Quiet', 37]], 'most recently gone first');
  assert.ok(PAX_COTTER_MAX_DAYS >= 180 && PAX_COTTER_MAX_DAYS <= 184, 'about 6 months');
});

test('a post anywhere, #downrange included, resets the clock', () => {
  const rows = [...streak('Traveler', '2026-08-20', 10), { Date: '2026-10-01', Name: 'Traveler', Site: '#downrange', Role: 'P' }];
  assert.deepStrictEqual(paxCotters(rows, COTTER_NOW), []);
});

test('last AO is where he last posted; home AO is where he posted most', () => {
  const rows = [...streak('Wanderer', '2026-08-30', 9, 'Tortoises'), { Date: '2026-09-02', Name: 'Wanderer', Site: 'Das Boot', Role: 'P' }];
  const [c] = paxCotters(rows, COTTER_NOW);
  assert.deepStrictEqual([c.lastDate, c.lastAo, c.homeAo, c.daysAway], ['2026-09-02', 'Das Boot', 'Tortoises', 36]);
});

test('regular means Peak City posts: #downrange-only men are not on the list', () => {
  const rows = [...streak('Out Of Region', '2026-09-01', 12, '#downrange'), ...streak('Ours', '2026-09-01', 8)];
  assert.deepStrictEqual(paxCotters(rows, COTTER_NOW).map(c => c.name), ['Ours']);
});

test('the exclusion list keeps a man off, case-insensitively', () => {
  const rows = [...streak('Moved Away', '2026-09-01', 10), ...streak('Still Here', '2026-09-01', 10)];
  assert.deepStrictEqual(paxCotters(rows, COTTER_NOW, { 'moved away': 'moved to Charlotte' }).map(c => c.name), ['Still Here']);
});


console.log('\npaxRegularTrend — PC Regulars as of each month end');
const ys = (name, n, from, site) => Array.from({ length: n }, (_, i) =>
  row(new Date(Date.parse(from + 'T12:00:00Z') + i * 86400000).toISOString().slice(0, 10), name, site || 'Half Dome'));
// Data starts 2025-01-01 (a filler man), so every 2026 window is complete.
const base = row('2025-01-01', 'Filler', 'Half Dome');
test('evaluates as of the month end and ignores later posts', () => {
  const rows = [base, ...ys('A', 3, '2026-02-10'), ...ys('B', 3, '2026-04-10')];
  const t = paxRegularTrend(rows, 2026, new Date('2026-06-15T12:00:00'));
  assert.deepStrictEqual(t.map(x => x.count), [0, 1, 0, 1, 0, 0]); // 3-in-3-weeks lapses after 3 weeks
});
test('rate, added and lost compare with the previous month; January seeds from December', () => {
  const rows = [base, ...ys('A', 3, '2025-12-20'), ...ys('B', 3, '2026-01-20')];
  const t = paxRegularTrend(rows, 2026, new Date('2026-03-15T12:00:00'));
  assert.deepStrictEqual([t[0].count, t[0].rate, t[0].added, t[0].lost], [1, 0, 1, 1]);
  assert.deepStrictEqual([t[1].count, t[1].rate, t[1].lost], [0, 0, 1]);
});
test('flags months whose 26-week window starts before the first record', () => {
  const rows = [row('2026-01-05', 'A'), ...ys('A', 3, '2026-06-01')];
  const t = paxRegularTrend(rows, 2026, new Date('2026-08-15T12:00:00'));
  assert.deepStrictEqual(t.map(x => x.partial), [true, true, true, true, true, true, false, false]);
});
test('current month runs through now; future months are omitted', () => {
  const t = paxRegularTrend([base], 2026, new Date('2026-03-15T12:00:00'));
  assert.strictEqual(t.length, 3);
  assert.deepStrictEqual(t.map(x => x.inProgress), [false, false, true]);
});
test('a different year works with no code change (Jan 2027 reaches into 2026)', () => {
  const rows = [base, ...ys('A', 26, '2026-08-10')];
  const t = paxRegularTrend(rows, 2027, new Date('2027-01-20T12:00:00'));
  assert.strictEqual(t[0].count, 1);
  assert.strictEqual(t[0].partial, false);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
