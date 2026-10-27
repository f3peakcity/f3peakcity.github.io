// Node.js unit tests for pax-detail.js's per-AO aggregation for one PAX.
// Run with: node static/stats/test/pax-detail.test.js

const assert = require('assert');

Object.assign(global, require('../assets/js/data.js'), { F3_MS_PER_WEEK: 604800000 });
Object.assign(global, require('../assets/js/leaderboard.js'));
const { paxDetailBuildPerAo, paxDetailQBalance, paxDetailCalendarMonth, paxDetailSource } = require('../assets/js/pax-detail.js');

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

// --- #112 calendar (paxDetailCalendarMonth) ---
console.log('\npaxDetailCalendarMonth');
const src = (date, name, site, role, sourceFile) => ({ ...row(date, name, site, role), SourceFile: sourceFile });
const day = (cal, date) => cal.days.find(d => d.date === date);

test('a day earns one post; extra rows are listed but not counted', () => {
  const cal = paxDetailCalendarMonth([
    src('2026-10-06', 'Bolt', '#downrange', 'P', 'BigQuery:analytics.attendance_info'), // Tue
    src('2026-10-06', 'Bolt', 'Full Metal Jacket', 'Q', 'Attendance!C'),
  ], 'Bolt', '2026', 9);
  const d = day(cal, '2026-10-06');
  assert.strictEqual(d.credit, 1);
  assert.strictEqual(d.q, true);
  assert.deepStrictEqual(d.rows.map(r => [r.site, r.counted, r.source]),
    [['Full Metal Jacket', true, 'Slack'], ['#downrange', false, 'BigQuery']]); // Q row shown as the credited one
  assert.match(d.rows[1].why, /One post per day/);
  assert.strictEqual(cal.days.length, 31);
  assert.strictEqual(cal.label, 'OCT 2026');
});

test('Saturday NeighborUp is a second post; a repeat of it is not', () => {
  const cal = paxDetailCalendarMonth([
    row('2026-10-03', 'Bolt', 'Off The Rails'), row('2026-10-03', 'Bolt', 'Raiders of the Locked Park'),
    row('2026-10-03', 'Bolt', 'NeighborUp'), row('2026-10-03', 'Bolt', 'NeighborUp'),
    row('2026-10-05', 'Bolt', 'NeighborUp'), row('2026-10-05', 'Bolt', 'Off The Rails'), // Monday: no double-down
  ], 'Bolt', '2026', 9);
  assert.strictEqual(day(cal, '2026-10-03').credit, 2);
  assert.deepStrictEqual(day(cal, '2026-10-03').rows.map(r => r.counted), [true, false, true, false]);
  assert.strictEqual(day(cal, '2026-10-05').credit, 1);
  assert.strictEqual(cal.posts, 3);
});

test('before LB_DAY_CREDIT_FROM every record counts', () => {
  const cal = paxDetailCalendarMonth([row('2026-07-07', 'Bolt', 'A'), row('2026-07-07', 'Bolt', 'A', 'Q')],
    'Bolt', '2026', 6);
  assert.strictEqual(day(cal, '2026-07-07').credit, 2);
  assert.ok(day(cal, '2026-07-07').rows.every(r => r.counted));
});

test('complete needs 12 posts and a Q', () => {
  const twelve = Array.from({ length: 12 }, (_, i) => row(`2026-09-${String(i + 1).padStart(2, '0')}`, 'Bolt', 'A'));
  assert.strictEqual(paxDetailCalendarMonth(twelve, 'Bolt', '2026', 8).complete, false);
  twelve[0].Role = 'Q';
  assert.strictEqual(paxDetailCalendarMonth(twelve, 'Bolt', '2026', 8).complete, true);
});

test('source labels', () => {
  assert.deepStrictEqual(['BigQuery:analytics.attendance_info', 'Attendance!C', '', 'Manual #112'].map(paxDetailSource),
    ['BigQuery', 'Slack', 'Manual', 'Manual #112']);
});

// Every PAX x month in the published raw.json: the calendar's tally must equal
// the leaderboard's own aggregation, and each day's counted rows its credit.
test('matches lbMonthlyPostCredit on data/raw.json for every PAX and month', () => {
  const fs = require('fs');
  const path = require('path');
  const file = path.join(__dirname, '../data/raw.json');
  if (!fs.existsSync(file)) return;
  const rows = f3RawRowsFromJson(JSON.parse(fs.readFileSync(file, 'utf8')), { year: '2026' });
  const lb = lbMonthlyPostCredit(rows);
  let checked = 0;
  Object.entries(lb).forEach(([name, agg]) => {
    MONTHS.forEach((m, i) => {
      const cal = paxDetailCalendarMonth(rows, name, '2026', i);
      assert.strictEqual(cal.posts, agg.posts[m] || 0, `${name} ${m} posts`);
      assert.strictEqual(cal.qs, agg.qs[m] || 0, `${name} ${m} qs`);
      cal.days.forEach(d => assert.strictEqual(d.rows.filter(r => r.counted).length, d.credit, `${name} ${d.date}`));
      checked++;
    });
  });
  assert.ok(checked > 1000, `only ${checked} PAX-months checked`);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
