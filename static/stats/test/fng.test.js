// Node.js unit tests for fng.js's FNG lifecycle and row-building aggregation.
// Run with: node static/stats/test/fng.test.js

const assert = require('assert');

const dataUtils = require('../assets/js/data.js');
global.f3ParseLocalDate = dataUtils.f3ParseLocalDate;
global.f3IsFng = dataUtils.f3IsFng;
global.f3IsVisitingQ = dataUtils.f3IsVisitingQ;
global.f3CountsTowardAttendance = dataUtils.f3CountsTowardAttendance;

const { FNG_FADED_DAYS, fngLastSeenCell, fngStatus, fngBuildRows, fngFirstQSummary, fngDaysBuckets, fngJourneyStages, fngReturnBy, fngFollowUps } = require('../assets/js/fng.js');

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

console.log('\nfngDaysBuckets');

test('buckets days-to-2nd at 3/7/14/30 and counts no-return as None', () => {
  const b = fngDaysBuckets([0, 3, 4, 7, 8, 14, 15, 30, 31, ''].map(d => ({ 'Days to 2nd post': d })));
  assert.deepStrictEqual(b, { '0–3 d': 2, '4–7 d': 2, '8–14 d': 2, '15–30 d': 2, '31+ d': 1, 'None': 1 });
});

console.log('\nLast seen');

test('days since last seen is set only for FNGs who posted more than once', () => {
  const rows = fngBuildRows([
    row('2026-07-01', 'Twice', 'Das Boot', 'FNG'), row('2026-08-05', 'Twice', 'Das Boot'),
    row('2026-08-10', 'Twice', '#downrange'),                       // excluded site doesn't count as seen
    row('2026-08-01', 'Once', 'Das Boot', 'FNG'),
  ], NOW);
  assert.strictEqual(byName(rows, 'Twice')['Days since last seen'], 10, 'Aug 5 to Aug 15');
  assert.strictEqual(byName(rows, 'Once')['Days since last seen'], '');
});

test('Last seen cell: dash for one post, rust once fading', () => {
  assert.strictEqual(fngLastSeenCell(''), '—');
  assert.strictEqual(fngLastSeenCell(0), 'today');
  assert.strictEqual(fngLastSeenCell(FNG_FADED_DAYS - 1), `${FNG_FADED_DAYS - 1}d ago`);
  assert.ok(fngLastSeenCell(FNG_FADED_DAYS).includes('tone-alert'));
});

console.log('\nnot-an-FNG list');

test('a man on F3_NOT_FNG is not an FNG even with an FNG-tagged record', () => {
  const rows = fngBuildRows([row('2026-08-01', 'Bolton', 'Das Boot', 'FNG'), row('2026-08-01', 'Real New Guy', 'Das Boot', 'FNG')], NOW);
  assert.deepStrictEqual(rows.map(r => r['FNG Name']), ['Real New Guy']);
  assert.strictEqual(dataUtils.f3IsFng({ Name: ' BOLTON ', Role: 'FNG' }), false, 'match is trimmed and case-insensitive');
});

console.log('\nNew Guy Journey');

// NOW is 2026-08-15. Four FNGs with different journeys.
const journeyRows = fngBuildRows([
  row('2026-06-01', 'Quick', 'Half Dome', 'FNG'), row('2026-06-03', 'Quick', 'Half Dome'),
  row('2026-06-10', 'Quick', 'Half Dome'), row('2026-06-17', 'Quick', 'Half Dome'),
  row('2026-08-10', 'Quick', 'Das Boot', 'Q'),
  row('2026-06-01', 'Slow', 'Half Dome', 'FNG'), row('2026-06-25', 'Slow', 'Half Dome'),
  row('2026-06-01', 'Gone', 'Das Boot', 'FNG'),
  row('2026-08-12', 'Fresh', 'Das Boot', 'FNG'),
  row('2026-05-01', 'Early', 'Das Boot'), row('2026-06-01', 'Early', 'Das Boot', 'FNG'),
], NOW);

test('return days count only posts after the FNG post', () => {
  assert.strictEqual(byName(journeyRows, 'Quick')['_returnDays'], 2);
  assert.strictEqual(byName(journeyRows, 'Gone')['_returnDays'], null);
  assert.strictEqual(byName(journeyRows, 'Early')['_returnDays'], null, 'a record before the FNG tag is not a return');
});

test('journey stages only count FNGs old enough for the window', () => {
  const [d7, d30, est, d60, qd] = fngJourneyStages(journeyRows, NOW);
  assert.deepStrictEqual([d7.n, d7.of], [1, 4], 'Fresh (3 days old) is not yet counted');
  assert.deepStrictEqual([d30.n, d30.of], [2, 4]);
  assert.deepStrictEqual([est.n, est.of], [1, 4]);
  assert.deepStrictEqual([d60.n, d60.of], [1, 4]);
  assert.deepStrictEqual([qd.n, qd.of], [1, 5]);
});

test('30-day return groups by home AO', () => {
  const byAo = fngReturnBy(journeyRows, NOW, r => r['Home AO']);
  assert.deepStrictEqual(byAo['Half Dome'], { n: 2, of: 2 });
  assert.deepStrictEqual(byAo['Das Boot'], { n: 0, of: 2 });
});

test('follow-up lists: no return, faded, ready to Q', () => {
  const regular = ['2026-05-02', '2026-05-09', '2026-05-16', '2026-05-23', '2026-05-30', '2026-06-06',
    '2026-06-13', '2026-06-20', '2026-06-27'].map(d => row(d, 'Steady', 'Tortoises'));
  const f = fngFollowUps(fngBuildRows([
    row('2026-07-20', 'Missed', 'Das Boot', 'FNG'),              // 26 days, never back
    row('2026-08-12', 'Fresh', 'Das Boot', 'FNG'),               // too new to chase
    row('2026-06-01', 'Cold', 'Das Boot', 'FNG'),                // 75 days: past the window
    row('2026-06-01', 'Slow', 'Half Dome', 'FNG'), row('2026-06-25', 'Slow', 'Half Dome'),
    row('2026-04-25', 'Steady', 'Tortoises', 'FNG'), ...regular,
  ], NOW), NOW);
  assert.deepStrictEqual(f.noReturn.map(r => r['FNG Name']), ['Missed']);
  assert.deepStrictEqual(f.faded.map(r => r['FNG Name']), ['Slow']);
  assert.deepStrictEqual(f.readyToQ.map(r => r['FNG Name']), ['Steady']);
});

test('first Q: days and posts before; blank without a Q; excluded Qs skipped', () => {
  const rows = fngBuildRows([
    row('2026-05-01', 'A', 'Das Boot', 'FNG'), row('2026-05-08', 'A', 'Das Boot'), row('2026-05-15', 'A', 'Das Boot'),
    row('2026-05-20', 'A', '#downrange', 'Q'), row('2026-05-22', 'A', 'Das Boot', 'Q'),
    row('2026-06-01', 'B', 'Das Boot', 'FNG'), row('2026-09-23', 'B', 'Das Boot', 'Q'),   // takeover window
    row('2026-06-01', 'C', 'Das Boot', 'FNG'), row('2026-06-08', 'C', 'Das Boot', 'Q'),
    row('2026-07-01', 'D', 'Das Boot', 'FNG'), row('2026-07-08', 'D', 'Das Boot', 'Q'),
    row('2026-07-10', 'D', 'Das Boot', 'Q'),
  ], NOW);
  const a = byName(rows, 'A');
  assert.strictEqual(a['Days to first Q'], 21);
  assert.strictEqual(a['Posts before first Q'], 3);
  assert.strictEqual(byName(rows, 'B')['Days to first Q'], '');
  assert.strictEqual(byName(rows, 'B')['Posts before first Q'], '');
  const s = fngFirstQSummary(rows);
  assert.deepStrictEqual(s, { n: 3, of: 4, medianDays: 7, medianPosts: 1 });
  assert.strictEqual(fngFirstQSummary([]).medianDays, null);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
