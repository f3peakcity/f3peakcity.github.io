// Node.js unit tests for who2q.js pure render helpers
// Run with: node static/stats/test/who2q.test.js

const assert = require('assert');
const dataUtils = require('../assets/js/data.js');
global.f3Esc = dataUtils.f3Esc;
global.f3ParseLocalDate = dataUtils.f3ParseLocalDate;
global.f3PaxLink = dataUtils.f3PaxLink;
const {
  who2qFmtRate, who2qFmtDate, who2qShortDate, who2qQLoadRowsHtml, who2qQLoadSummary, who2qStaleRowsHtml,
  who2qRosterDate, who2qTenure, who2qSiteQRowsHtml, who2qCandidateRowsHtml, who2qCandidateRule,
  who2qRegularRowsHtml, who2qPcRowsHtml, who2qPcRule, who2qCapped,
} = require('../assets/js/who2q.js');

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

test('who2qFmtRate renders percent', () => {
  assert.strictEqual(who2qFmtRate(0.75), '75%');
  assert.strictEqual(who2qFmtRate(0.667), '67%');
});

test('who2qFmtDate renders short date', () => {
  assert.strictEqual(who2qFmtDate('2026-07-01'), 'Jul 1, 2026');
  assert.strictEqual(who2qFmtDate(''), '—');
});

test('who2qShortDate adds the year only outside the current one', () => {
  const now = new Date(2026, 8, 26);
  assert.strictEqual(who2qShortDate('2026-05-04', now), 'May 4');
  assert.strictEqual(who2qShortDate('2025-08-06', now), 'Aug 6, 2025');
});

test('who carries the Qs: counts, regular vs visitor, summary', () => {
  const list = [
    { name: 'Ramsay', qs: 2, last_q: '2026-09-15', regular: true },
    { name: 'Cataracts', qs: 1, last_q: '2026-10-20', regular: false },
  ];
  const html = who2qQLoadRowsHtml(list);
  assert.ok(html.indexOf('Ramsay') < html.indexOf('Cataracts'), 'keeps export order');
  assert.ok(html.includes('Regular · last'));
  assert.ok(html.includes('Visitor · last'));
  assert.ok(html.includes('>2</span>'));
  assert.strictEqual(who2qQLoadSummary(list), '3 Qs from 2 men');
  assert.strictEqual(who2qQLoadSummary([list[1]]), '1 Q from 1 man');
  assert.ok(who2qQLoadRowsHtml([]).includes('empty-state'));
});

test('stale-q table shows days ago and window attendance', () => {
  const html = who2qStaleRowsHtml([
    { name: 'Mercy Rule', last_q: '2026-01-15', days_since: 172, attended_in_window: 5 },
    { name: 'Bench', last_q: '2026-04-01', days_since: 96, attended_in_window: 0 },
  ]);
  assert.ok(html.indexOf('Mercy Rule') < html.indexOf('Bench'));
  assert.ok(html.includes('172 days ago'));
  assert.ok(html.includes('is-good'), 'over 120 days is highlighted');
  assert.strictEqual(html.split('is-good').length - 1, 1, 'only the long-overdue row is green');
  assert.ok(html.includes('Jan 15, 2026'));
});

test('stale-q empty state', () => {
  const html = who2qStaleRowsHtml([]);
  assert.ok(html.includes('No overdue Qs'));
});

test('render helpers escape HTML in names', () => {
  const html = who2qStaleRowsHtml([
    { name: '<img src=x>', last_q: '2026-07-01', days_since: 90, attended_in_window: 1 },
  ]);
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
});

// --- Site Qs and candidates (#182) ---
const NOW = new Date(2026, 9, 8);   // Oct 8, 2026

test('roster dates read at their own precision', () => {
  assert.strictEqual(who2qRosterDate('2026-09-10'), 'Sep 10, 2026');
  assert.strictEqual(who2qRosterDate('2025-05'), 'May 2025');
  assert.strictEqual(who2qRosterDate('2024'), '2024');
});

test('tenure: weeks, months, years; ~ for approximate starts; null when unknown', () => {
  assert.strictEqual(who2qTenure('2026-09-10', 'day', NOW), '4 wk');
  assert.strictEqual(who2qTenure('2025-05-05', 'day', NOW), '17 mo');
  assert.strictEqual(who2qTenure('2024-06-04', 'day', NOW), '2 yr');
  assert.strictEqual(who2qTenure('2025-05', 'month', NOW), '~17 mo');
  assert.strictEqual(who2qTenure('2024', 'year', NOW), '~2 yr');
  assert.strictEqual(who2qTenure(null, null, NOW), null);
});

test('Site Q rows: since, tenure, season tag, linked names; empty state', () => {
  const html = who2qSiteQRowsHtml([
    { name: 'Moline', start: '2026-09-10', start_precision: 'day', season: 'all' },
    { name: 'Triple Lindy', start: null, start_precision: null, season: 'summer' },
  ], NOW);
  assert.ok(html.includes('since Sep 10, 2026'));
  assert.ok(html.includes('4 wk'));
  assert.ok(html.includes('Summer · start date not on record'));
  assert.ok(html.includes('pax-detail.html?pax=Moline'));
  assert.ok(who2qSiteQRowsHtml([], NOW).includes('No Site Q on record'));
});

test('candidate rows: facts, then past Site Qs under a divider; empty state', () => {
  const html = who2qCandidateRowsHtml([
    { name: 'Hobbit', rate: 0.792, qs_here: 2, q_aos: 7, first_seen: '2025-08-12', past_site_q: null },
    { name: 'Cheap Trick', rate: 0.542, qs_here: 1, q_aos: 1, first_seen: null, past_site_q: null },
    { name: 'Old Guard', rate: 0.5, qs_here: 3, q_aos: 2, first_seen: '2025-08-01',
      past_site_q: { ao: 'Cougar Town', end: '2025-06' }, recent_past: true },
  ]);
  assert.ok(html.indexOf('Hobbit') < html.indexOf('Past Site Qs'), 'fresh candidates first');
  assert.ok(html.indexOf('Past Site Qs') < html.indexOf('Old Guard'), 'past Site Qs under the divider');
  assert.ok(html.includes('2 Qs here · Q\'s at 7 AOs · in F3 since at least Aug 2025'));
  assert.ok(html.includes('1 Q here · Q\'s at 1 AO'), 'singulars');
  assert.ok(html.includes('Site Q at Cougar Town until Jun 2025'));
  assert.ok(html.includes('79%'));
  assert.ok(!who2qCandidateRowsHtml([{ name: 'A', rate: 0.5, qs_here: 1, q_aos: 1, past_site_q: null }]).includes('Past Site Qs'),
    'no divider without past Site Qs');
  assert.ok(who2qCandidateRowsHtml([]).includes('No one meets the bar yet'));
});

test('candidate rule tooltip reads the export settings', () => {
  const rule = who2qCandidateRule({ candidate_attendance: 0.4, candidate_min_qs: 1, candidate_window_weeks: 26 });
  assert.ok(rule.includes('40%+'));
  assert.ok(rule.includes('at least once in the last 26 weeks'));
  assert.ok(who2qCandidateRule({ candidate_attendance: 0.5, candidate_min_qs: 2, candidate_window_weeks: 26 })
    .includes('at least 2 times'));
});

test('regulars rows: a dash for no Q on record, days otherwise', () => {
  const html = who2qRegularRowsHtml([
    { name: 'Moline', attended: 10, rate: 0.83, last_q: null, days_since: null },
    { name: 'Hitchhiker', attended: 10, rate: 0.83, last_q: '2026-10-06', days_since: 15 },
  ]);
  assert.ok(html.includes('<span class="label">83%</span>'));
  assert.ok(html.includes('title="No Q\'s in recent history"'), 'the dash explains itself on hover');
  assert.ok(html.includes('>—</span>'));
  assert.ok(!html.includes('Never'), 'history starts Aug 2025: never say never');
  assert.ok(html.includes('>15</span>'));
  assert.ok(html.indexOf('Moline') < html.indexOf('Hitchhiker'), 'keeps export order');
  assert.ok(who2qRegularRowsHtml([]).includes('empty-state'));
});

test('PC Regular rows: posts here and no Q on record', () => {
  const list = [
    { name: '9-Lives', posts_here: 5, last_q: null, days_since: null },
    { name: 'I-Beam', posts_here: 1, last_q: '2025-09-23', days_since: 393 },
    { name: 'Blindside', posts_here: 0, last_q: null, days_since: null },
  ];
  const html = who2qPcRowsHtml(list);
  assert.ok(html.includes('<span class="label">5 posts here</span>'));
  assert.ok(html.includes('1 post here · Q\'d Sep 23, 2025'));
  assert.ok(html.includes('never posted here'));
  assert.ok(who2qPcRowsHtml([]).includes('empty-state'));
  assert.ok(who2qPcRule({ pc_stale_days: 182 }).includes('182+ days'));
});

test('every list caps at 15 rows and says how many there are', () => {
  const list = Array.from({ length: 20 }, (_, i) => i);
  const html = who2qCapped(list, shown => shown.map(i => `<i>${i}</i>`).join(''));
  assert.ok(html.includes('<i>14</i>') && !html.includes('<i>15</i>'));
  assert.ok(html.includes('Showing 15 of 20'));
  assert.ok(!who2qCapped(list.slice(0, 15), shown => '').includes('Showing'), 'no footer when nothing is cut');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
