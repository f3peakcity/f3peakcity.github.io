// Node.js unit tests for ao.js pure helpers
// Run with: node static/stats/test/ao.test.js

const assert = require('assert');

// ao.js render helpers use the shared globals data.js installs in the browser.
global.f3Esc = require('../assets/js/data.js').f3Esc;
const {
  AO_PALETTE, aoBuildColorMap, aoIsRealSite, aoDayOfWeek, aoBucketByDate,
  aoWeekMonday, aoWeeklySeriesBySite, aoTrendPct, aoSparkPoints, aoIsoDate,
  aoDailyCutoff, AO_ALL_DAYS_WEEKS, AO_ONE_DAY_WEEKS,
  aoSparkBars, aoSparkSvg, aoTrendChip, aoDailySummary,
  aoTrendTone, aoBenchTone, aoEmpty, AO_BENCH_MIN_PAX,
  aoCorePax, AO_CORE_THRESHOLD,
} = require('../assets/js/ao.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}\n    ${e.message}`);
    failed++;
  }
}

// --- aoBuildColorMap ---
console.log('\naoBuildColorMap');

test('assigns palette colors in rank order', () => {
  const map = aoBuildColorMap(['Das Boot', "Dante's Peak", "Hell's Bells"]);
  assert.strictEqual(map['Das Boot'], AO_PALETTE[0]);
  assert.strictEqual(map["Dante's Peak"], AO_PALETTE[1]);
  assert.strictEqual(map["Hell's Bells"], AO_PALETTE[2]);
});

test('an AO keeps its color when a chart shows only a subset', () => {
  // The daily chart filtered to Mondays shows only Monday AOs, but each must
  // keep the color it has in the all-AO weekly chart.
  const map = aoBuildColorMap(['Das Boot', "Dante's Peak", "Hell's Bells"]);
  const mondayOnly = ["Hell's Bells"];
  assert.strictEqual(map[mondayOnly[0]], AO_PALETTE[2]);
});

test('wraps around when AOs outnumber the palette', () => {
  const many = Array.from({ length: AO_PALETTE.length + 2 }, (_, i) => `AO${i}`);
  const map = aoBuildColorMap(many);
  assert.strictEqual(map[`AO${AO_PALETTE.length}`], AO_PALETTE[0]);
  assert.strictEqual(map[`AO${AO_PALETTE.length + 1}`], AO_PALETTE[1]);
});

// --- aoIsRealSite ---
console.log('\naoIsRealSite');

test('keeps real AOs', () => {
  assert.strictEqual(aoIsRealSite('Das Boot'), true);
  assert.strictEqual(aoIsRealSite("Hell's Bells (Kettle Bells)"), true);
});

test('drops non-AO and downrange entries regardless of case', () => {
  assert.strictEqual(aoIsRealSite('#downrange'), false);
  assert.strictEqual(aoIsRealSite('Convergence'), false);
  assert.strictEqual(aoIsRealSite('CONVERGENCE'), false);
  assert.strictEqual(aoIsRealSite('  Ruck the Hall  '), false);
});

// --- aoDayOfWeek ---
console.log('\naoDayOfWeek');

test('names the weekday for an ISO date', () => {
  assert.strictEqual(aoDayOfWeek('2026-08-24'), 'Mon');
  assert.strictEqual(aoDayOfWeek('2026-08-22'), 'Sat');
  assert.strictEqual(aoDayOfWeek('2026-08-23'), 'Sun');
});

test('is not shifted by timezone', () => {
  // Parsed as local midnight; a UTC parse would roll this back to Sun in the US.
  assert.strictEqual(aoDayOfWeek('2026-03-02'), 'Mon');
});

// --- aoBucketByDate ---
console.log('\naoBucketByDate');

const SAMPLE = [
  { Date: '2026-08-03', Site: "Hell's Bells (Kettle Bells)" },  // Mon
  { Date: '2026-08-03', Site: "Hell's Bells (Kettle Bells)" },
  { Date: '2026-08-03', Site: 'Beaver Chase' },
  { Date: '2026-08-04', Site: 'Cougar Town' },                   // Tue
  { Date: '2026-08-10', Site: 'Beaver Chase' },                  // Mon
  { Date: '2026-08-10', Site: '#downrange' },
  { Date: '2026-01-05', Site: 'Beaver Chase' },                  // before cutoff
];
const OPTS = { cutoffStr: '2026-03-01', todayStr: '2026-08-24' };

test('stacks per-AO counts under each date', () => {
  const { byDate } = aoBucketByDate(SAMPLE, OPTS);
  assert.deepStrictEqual(byDate['2026-08-03'], {
    "Hell's Bells (Kettle Bells)": 2,
    'Beaver Chase': 1,
  });
});

test('returns dates in chronological order', () => {
  const { dates } = aoBucketByDate(SAMPLE, OPTS);
  assert.deepStrictEqual(dates, ['2026-08-03', '2026-08-04', '2026-08-10']);
});

test('drops rows before the cutoff', () => {
  const { dates } = aoBucketByDate(SAMPLE, OPTS);
  assert.ok(!dates.includes('2026-01-05'));
});

test('drops excluded sites', () => {
  const { byDate } = aoBucketByDate(SAMPLE, OPTS);
  assert.deepStrictEqual(byDate['2026-08-10'], { 'Beaver Chase': 1 });
});

test('filters to a single weekday', () => {
  const { dates } = aoBucketByDate(SAMPLE, { ...OPTS, dayOfWeek: 'Mon' });
  assert.deepStrictEqual(dates, ['2026-08-03', '2026-08-10']);
});

test('excludes today, whose sessions have not all reported yet', () => {
  // A partial current day renders as a collapse in attendance; drop it.
  const rows = SAMPLE.concat([{ Date: '2026-08-24', Site: 'Beaver Chase' }]);
  const { dates } = aoBucketByDate(rows, OPTS);
  assert.ok(!dates.includes('2026-08-24'), 'today should not appear');
});

test('totals each AO across the range for color ranking', () => {
  const { aoTotals } = aoBucketByDate(SAMPLE, OPTS);
  assert.deepStrictEqual(aoTotals, {
    "Hell's Bells (Kettle Bells)": 2,
    'Beaver Chase': 2,
    'Cougar Town': 1,
  });
});

test('AO totals ignore the weekday filter so colors stay stable', () => {
  const all = aoBucketByDate(SAMPLE, OPTS).aoTotals;
  const mon = aoBucketByDate(SAMPLE, { ...OPTS, dayOfWeek: 'Mon' }).aoTotals;
  assert.deepStrictEqual(mon, all);
});

// --- aoWeekMonday ---
console.log('\naoWeekMonday');

test('snaps a date back to its Monday', () => {
  assert.strictEqual(aoWeekMonday('2026-08-05'), '2026-08-03'); // Wed -> Mon
  assert.strictEqual(aoWeekMonday('2026-08-03'), '2026-08-03'); // Mon -> itself
});

test('treats Sunday as the end of its week, not the start', () => {
  assert.strictEqual(aoWeekMonday('2026-08-09'), '2026-08-03'); // Sun -> prior Mon
});

// --- aoWeeklySeriesBySite ---
console.log('\naoWeeklySeriesBySite');

const WEEKLY_ROWS = [
  { Date: '2026-08-03', Site: 'Beaver Chase' },
  { Date: '2026-08-03', Site: 'Beaver Chase' },
  { Date: '2026-08-05', Site: 'Lion\'s Den' },
  // 2026-08-10 week: Beaver Chase absent entirely
  { Date: '2026-08-12', Site: 'Lion\'s Den' },
  { Date: '2026-08-17', Site: 'Beaver Chase' },
];
const WOPTS = { cutoffStr: '2026-08-03', todayStr: '2026-08-24' };

test('emits one value per week on a shared week axis', () => {
  const { weeks, bySite } = aoWeeklySeriesBySite(WEEKLY_ROWS, WOPTS);
  assert.deepStrictEqual(weeks, ['2026-08-03', '2026-08-10', '2026-08-17']);
  assert.deepStrictEqual(bySite['Lion\'s Den'], [1, 1, 0]);
});

test('a week an AO missed reads as 0, not a gap', () => {
  // Without this the sparkline would connect across the gap and hide the dip.
  const { bySite } = aoWeeklySeriesBySite(WEEKLY_ROWS, WOPTS);
  assert.deepStrictEqual(bySite['Beaver Chase'], [2, 0, 1]);
});

// --- aoTrendPct ---
console.log('\naoTrendPct');

test('reports growth as a positive percent', () => {
  assert.strictEqual(aoTrendPct([10, 10, 15, 15]), 50);
});

test('reports decline as a negative percent', () => {
  assert.strictEqual(aoTrendPct([20, 20, 10, 10]), -50);
});

test('reports a flat series as 0', () => {
  assert.strictEqual(aoTrendPct([12, 12, 12, 12]), 0);
});

test('ignores the middle value on an odd-length series', () => {
  assert.strictEqual(aoTrendPct([10, 10, 999, 15, 15]), 50);
});

test('returns null when there is too little history to compare', () => {
  assert.strictEqual(aoTrendPct([5, 6, 7]), null);
  assert.strictEqual(aoTrendPct([]), null);
});

test('returns null rather than dividing by a zero baseline', () => {
  assert.strictEqual(aoTrendPct([0, 0, 4, 4]), null);
});

// --- aoSparkBars ---
console.log('\naoSparkBars');

test('emits one bar per week', () => {
  const bars = aoSparkBars([1, 2, 3], 90, 30);
  assert.strictEqual(bars.length, 3);
});

test('measures bars from a zero baseline, not the series low', () => {
  // A line chart scales min..max; bars must start at zero or a 9-vs-10 week
  // looks like the AO collapsed.
  const [a, b] = aoSparkBars([9, 10], 100, 30);
  assert.strictEqual(b.h, 30, 'tallest bar fills the box');
  assert.strictEqual(a.h, 27, '9/10 of full height');
});

test('gives the busiest week the full height', () => {
  const bars = aoSparkBars([2, 8, 4], 90, 30);
  assert.strictEqual(Math.max(...bars.map(x => x.h)), 30);
});

test('anchors every bar to the bottom of the box', () => {
  // SVG y grows downward, so y + h must land on the baseline for all bars.
  aoSparkBars([3, 7, 1], 90, 30).forEach(b => {
    assert.strictEqual(Math.round((b.y + b.h) * 100) / 100, 30);
  });
});

test('a week the AO did not run has no bar', () => {
  const bars = aoSparkBars([5, 0, 5], 90, 30);
  assert.strictEqual(bars[1].h, 0);
});

test('spaces bars evenly with a gap between them', () => {
  const bars = aoSparkBars([1, 1, 1], 90, 30);
  assert.ok(bars[0].w > 0);
  assert.ok(bars[1].x > bars[0].x + bars[0].w, 'expected a gap between bars');
  assert.ok(bars[2].x + bars[2].w <= 90.001, 'last bar must stay inside the box');
});

test('an all-zero series draws no bars rather than dividing by zero', () => {
  aoSparkBars([0, 0, 0], 90, 30).forEach(b => assert.strictEqual(b.h, 0));
});

test('returns nothing when there is no data', () => {
  assert.deepStrictEqual(aoSparkBars([], 90, 30), []);
});

// --- aoSparkSvg ---
console.log('\naoSparkSvg');

test('renders a rect per week and stretches to its container', () => {
  const svg = aoSparkSvg([3, 6, 9]);
  assert.strictEqual((svg.match(/<rect/g) || []).length, 3);
  assert.ok(svg.includes('preserveAspectRatio="none"'), 'must stretch to card width');
  assert.ok(svg.includes('viewBox'));
  assert.ok(!svg.includes('<polyline'), 'sparkline is bars now, not a line');
});

test('renders nothing when there is too little data to plot', () => {
  assert.strictEqual(aoSparkSvg([]), '');
  assert.strictEqual(aoSparkSvg([5]), '');
});

// --- aoTrendChip ---
console.log('\naoTrendChip');

test('a rising AO carries the healthy tone', () => {
  const c = aoTrendChip([4, 4, 4, 4, 8, 8, 8, 8]);
  assert.ok(c.includes('tone-good'), c);
  assert.ok(c.includes('100%'));
});

test('a falling AO carries the needs-attention tone', () => {
  const c = aoTrendChip([8, 8, 8, 8, 4, 4, 4, 4]);
  assert.ok(c.includes('tone-alert'), c);
  assert.ok(c.includes('50%'));
});

test('a small swing reads as steady, not as a trend', () => {
  assert.ok(aoTrendChip([10, 10, 10, 10, 10, 10, 10, 11]).includes('tone-watch'));
});

test('the chip tone always agrees with aoTrendTone', () => {
  // Two code paths must never disagree about what a number means.
  [[4,4,4,4,8,8,8,8], [8,8,8,8,4,4,4,4], [10,10,10,10,10,10,10,11]].forEach(vals => {
    assert.ok(aoTrendChip(vals).includes('tone-' + aoTrendTone(aoTrendPct(vals))));
  });
});

test('caps runaway percentages from AOs that launched mid-range', () => {
  const launched = [0, 0, 0, 1, 0, 0, 3, 0, 0, 0, 0, 0, 0,
                    0, 0, 5, 1, 11, 2, 10, 10, 1, 16, 4, 11, 3];
  const c = aoTrendChip(launched);
  assert.ok(c.includes('200%+'));
  assert.ok(!c.includes('1750'));
});

test('is empty when there is no comparable baseline', () => {
  assert.strictEqual(aoTrendChip([0, 0, 5, 5]), '');
  assert.strictEqual(aoTrendChip([]), '');
});

// --- aoDailySummary ---
console.log('\naoDailySummary');

const SUM_DATES = ['2026-08-06', '2026-08-13', '2026-08-20'];
const SUM_BY_DATE = {
  '2026-08-06': { 'Half Dome': 10, 'Bounty Hunters': 4 },
  '2026-08-13': { 'Half Dome': 6 },
  '2026-08-20': { 'Half Dome': 8, 'Bounty Hunters': 6 },
};

test('summarizes every AO in the slice', () => {
  const s = aoDailySummary(SUM_DATES, SUM_BY_DATE, null);
  assert.strictEqual(s.sessions, 3);
  assert.strictEqual(s.aos, 2);
  assert.strictEqual(s.avg, 11);  // (14 + 6 + 14) / 3
});

test('summarizes a single isolated AO', () => {
  const s = aoDailySummary(SUM_DATES, SUM_BY_DATE, 'Half Dome');
  assert.strictEqual(s.aos, 1);
  assert.strictEqual(s.avg, 8);   // (10 + 6 + 8) / 3
});

test('counts only the dates an isolated AO actually met', () => {
  // Bounty Hunters skipped Aug 13; that is 2 sessions, not 3, and its average
  // must not be diluted by a day it never ran.
  const s = aoDailySummary(SUM_DATES, SUM_BY_DATE, 'Bounty Hunters');
  assert.strictEqual(s.sessions, 2);
  assert.strictEqual(s.avg, 5);   // (4 + 6) / 2
});

test('reports an empty slice without dividing by zero', () => {
  const s = aoDailySummary([], {}, null);
  assert.strictEqual(s.sessions, 0);
  assert.strictEqual(s.avg, 0);
});

// --- aoDailyCutoff ---
console.log('\naoDailyCutoff');

const REF = new Date(2026, 7, 24);  // Mon Aug 24 2026

test('a weekday view looks back the full range', () => {
  // ~26 bars: cheap to draw and long enough to read a trend.
  assert.strictEqual(aoDailyCutoff('Thu', REF), '2026-02-23');
});

test('the all-days view looks back a shorter window', () => {
  // Every date in range x every AO; at 26 weeks this is ~8,600 SVG nodes and
  // roughly 2.4s of main-thread work on every toggle back to All.
  assert.strictEqual(aoDailyCutoff('', REF), '2026-06-29');
});

test('the all-days window is shorter than the weekday window', () => {
  assert.ok(AO_ALL_DAYS_WEEKS < AO_ONE_DAY_WEEKS);
  assert.ok(aoDailyCutoff('', REF) > aoDailyCutoff('Mon', REF));
});

// --- tone vocabulary ---
// One rule everywhere: color encodes health, never direction.
// good = green, watch = gold, alert = rust, none = muted / unjudgeable.
console.log('\naoTrendTone');

test('growth is healthy, decline needs attention', () => {
  assert.strictEqual(aoTrendTone(25), 'good');
  assert.strictEqual(aoTrendTone(-25), 'alert');
});

test('a swing inside the noise band is watch, not good or alert', () => {
  assert.strictEqual(aoTrendTone(0), 'watch');
  assert.strictEqual(aoTrendTone(5), 'watch');
  assert.strictEqual(aoTrendTone(-5), 'watch');
});

test('uses the same band edges as the trend chip', () => {
  assert.strictEqual(aoTrendTone(6), 'good');
  assert.strictEqual(aoTrendTone(-6), 'alert');
});

test('no baseline means no judgement', () => {
  assert.strictEqual(aoTrendTone(null), 'none');
});

console.log('\naoBenchTone');

test('deep Q benches are healthy, thin ones need attention', () => {
  assert.strictEqual(aoBenchTone(45, 30, 14), 'good');
  assert.strictEqual(aoBenchTone(30, 30, 9), 'watch');
  assert.strictEqual(aoBenchTone(10, 30, 3), 'alert');
});

test('an AO with no Q recorded at all is unjudgeable, not failing', () => {
  // Sunday Slowzy has 17 PAX and 0 logged Qs. Someone led those workouts; the
  // Q field was never filled in. That is a data gap, not a bench problem, and
  // painting it rust reports a crisis that does not exist.
  assert.strictEqual(aoBenchTone(0, 17, 0), 'none');
  assert.strictEqual(aoBenchTone(0, 30, 0), 'none');
});

test('holds the documented band edges', () => {
  assert.strictEqual(aoBenchTone(40, 30, 12), 'good');
  assert.strictEqual(aoBenchTone(39.9, 30, 12), 'watch');
  assert.strictEqual(aoBenchTone(20, 30, 6), 'watch');
  assert.strictEqual(aoBenchTone(19.9, 30, 6), 'alert');
});

test('a tiny AO is not scolded for a thin bench', () => {
  // Sunday Slowzy has a handful of PAX; 0% bench there is a sample-size
  // artifact, not a Q-depth problem. Flagging it red is a false alarm.
  assert.strictEqual(aoBenchTone(100, 4, 4), 'none');
  assert.strictEqual(aoBenchTone(10, AO_BENCH_MIN_PAX, 1), 'alert');
});

test('an unknown percentage is not colored', () => {
  assert.strictEqual(aoBenchTone(NaN, 30, 5), 'none');
});

console.log('\naoEmpty');

test('reads as an intentional absence, not broken data', () => {
  const html = aoEmpty('No FNGs yet');
  assert.ok(html.includes('No FNGs yet'));
  assert.ok(html.includes('empty-state'), html);
  assert.ok(!html.includes('—'), 'an em dash reads as a rendering failure');
});

test('escapes its label', () => {
  assert.ok(!aoEmpty('<img src=x>').includes('<img'));
});

// --- aoCorePax ---
// "Core" means posting at least every other week over the range.
console.log('\naoCorePax');

test('includes PAX at or above the threshold', () => {
  // 25 sessions: 13 posts clears 50%, 12 does not.
  const core = aoCorePax({ Moline: 19, Ramsay: 17, 'Red Ryder': 14 }, 25);
  assert.deepStrictEqual(core, ['Moline', 'Ramsay', 'Red Ryder']);
});

test('excludes PAX below the threshold', () => {
  const core = aoCorePax({ Regular: 19, Occasional: 10 }, 25);
  assert.deepStrictEqual(core, ['Regular']);
});

test('treats the threshold as inclusive', () => {
  // Exactly half the sessions still counts as every other week.
  assert.deepStrictEqual(aoCorePax({ Exactly: 10 }, 20), ['Exactly']);
  assert.deepStrictEqual(aoCorePax({ JustUnder: 9 }, 20), []);
});

test('returns names sorted so the list is stable between renders', () => {
  assert.deepStrictEqual(aoCorePax({ Zulu: 20, Alpha: 20, Mike: 20 }, 20),
    ['Alpha', 'Mike', 'Zulu']);
});

test('an AO with no sessions has no core PAX', () => {
  assert.deepStrictEqual(aoCorePax({ Someone: 5 }, 0), []);
});

test('the bar is every other week, not near-perfect attendance', () => {
  // A 70% bar left 6 of 23 AOs with zero core PAX and dropped PAX who miss
  // roughly one session a month. Guard the looser rule against regression.
  assert.ok(AO_CORE_THRESHOLD <= 0.5, `threshold is ${AO_CORE_THRESHOLD}`);
  const missesOneAMonth = aoCorePax({ Steady: 17 }, 25);  // 68%
  assert.deepStrictEqual(missesOneAMonth, ['Steady']);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
