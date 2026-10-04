// Node.js unit tests for leadership.js pure functions
// Run with: node static/stats/test/leadership.test.js

const assert = require('assert');
const dataUtils = require('../assets/js/data.js');
Object.assign(global, dataUtils);
const {
  ldQHistory, ldVisitors, ldBase, ldScopedHistory, ldConcentration, ldFirstTimeQs, ldRepeatRate, ldPipeline, ldBench,
} = require('../assets/js/leadership.js');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); failed++; }
}

const NOW = new Date(2026, 8, 28);
const r = (date, name, site, role) => ({ Date: date, Name: name, Site: site, Role: role || 'P' });

// Weekly posts for `name` from `start` for `weeks` weeks.
function weekly(name, start, weeks, site = 'Das Boot') {
  const out = [];
  const d = new Date(start + 'T00:00:00');
  for (let i = 0; i < weeks; i++) {
    const x = new Date(d); x.setDate(d.getDate() + 7 * i);
    const iso = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    out.push(r(iso, name, site));
  }
  return out;
}

console.log('\nldQHistory / ldConcentration');

test('history keeps only Peak City Q records, oldest first', () => {
  const h = ldQHistory([
    r('2026-09-01', 'Imp', 'Das Boot', 'Q'), r('2026-03-01', 'Imp', 'Half Dome', 'Q'),
    r('2026-09-02', 'Imp', '#downrange', 'Q'), r('2026-09-03', 'Imp', 'Das Boot'),
  ]);
  assert.deepStrictEqual(h.Imp.map(q => q.date), ['2026-03-01', '2026-09-01']);
});

test('concentration = share of recent Q-led posts by the top 20% of Qs', () => {
  const rows = [];
  ['A', 'A', 'A', 'A', 'A', 'B', 'C', 'D', 'E'].forEach((n, i) =>
    rows.push(r(`2026-09-${String(i + 1).padStart(2, '0')}`, n, 'Das Boot', 'Q')));
  rows.push(r('2026-01-05', 'F', 'Das Boot', 'Q'));   // outside 90 days
  const c = ldConcentration(ldQHistory(rows), NOW);
  assert.strictEqual(c.uniqueQs, 5);
  assert.strictEqual(c.topN, 1);
  assert.strictEqual(c.qLed, 9);
  assert.strictEqual(c.topShare, 5 / 9);
});

console.log('\nldFirstTimeQs / ldRepeatRate');

const qRows = [
  r('2025-06-01', 'Veteran', 'Das Boot', 'Q'), r('2026-05-01', 'Veteran', 'Das Boot', 'Q'),
  r('2026-03-01', 'Returner', 'Half Dome', 'Q'), r('2026-03-20', 'Returner', 'Half Dome', 'Q'),
  r('2026-03-01', 'Late', 'Half Dome', 'Q'), r('2026-06-15', 'Late', 'Half Dome', 'Q'),
  r('2026-04-01', 'Once', 'Tortoises', 'Q'),
  r('2026-09-10', 'New', 'Tortoises', 'Q'),
];

test('first-time Qs start this year, newest first, with days to second Q', () => {
  const ft = ldFirstTimeQs(ldQHistory(qRows), '2026-01-01');
  assert.deepStrictEqual(ft.map(f => f.name), ['New', 'Once', 'Late', 'Returner']);
  assert.strictEqual(ft.find(f => f.name === 'Returner').daysToSecond, 19);
  assert.strictEqual(ft.find(f => f.name === 'Once').daysToSecond, null);
});

test('repeat rate counts only first-timers 60+ days out, and a 2nd Q within 60 days', () => {
  const rate = ldRepeatRate(ldFirstTimeQs(ldQHistory(qRows), '2026-01-01'), NOW);
  assert.deepStrictEqual(rate, { n: 1, of: 3 }, 'New is too recent; Late came back after 106 days');
});

console.log('\nldPipeline / ldBench');

const teamRows = [
  ...weekly('Leader', '2026-04-06', 26), ...weekly('Leader', '2026-04-08', 26),
  r('2026-08-01', 'Leader', 'Das Boot', 'Q'), r('2026-08-15', 'Leader', 'Das Boot', 'Q'),
  r('2026-09-01', 'Leader', 'Das Boot', 'Q'),
  ...weekly('Past', '2026-04-06', 26), ...weekly('Past', '2026-04-08', 26), r('2026-01-10', 'Past', 'Das Boot', 'Q'),
  ...weekly('Bench', '2026-04-06', 26, 'Half Dome'), ...weekly('Bench', '2026-04-08', 26, 'Half Dome'),
  ...weekly('Casual', '2026-01-05', 3),
];

test('pipeline narrows from PC Regulars to regular Qs', () => {
  const h = ldQHistory(teamRows);
  assert.deepStrictEqual(ldPipeline(teamRows, h, NOW).map(s => s.n), [3, 2, 1, 1]);
});

test("the pipeline's 'have Q'd' gap is exactly the bench (the page links one to the other)", () => {
  const h = ldQHistory(teamRows);
  const [base, qd] = ldPipeline(teamRows, h, NOW);
  assert.strictEqual(ldBench(teamRows, h, NOW).length, base.n - qd.n);
});

test('bench is PC Regulars with no Q on record, with a home AO', () => {
  const b = ldBench(teamRows, ldQHistory(teamRows), NOW);
  assert.deepStrictEqual(b.map(x => [x.name, x.homeAo]), [['Bench', 'Half Dome']]);
});

console.log('\nPC Regulars vs All PAX');

test('All PAX widens the base to anyone who posted in 90 days', () => {
  const rows = [...teamRows, r('2026-09-20', 'Drop-in', 'Das Boot'), r('2026-09-10', 'Drop-in Q', 'Das Boot', 'Q')];
  const h = ldQHistory(rows);
  assert.deepStrictEqual([...ldBase(rows, h, NOW, 'regulars')].sort(), ['Bench', 'Leader', 'Past']);
  assert.deepStrictEqual([...ldBase(rows, h, NOW, 'all')].sort(), ['Bench', 'Drop-in', 'Drop-in Q', 'Leader', 'Past']);
  assert.deepStrictEqual(ldBench(rows, h, NOW, 'all').map(b => b.name), ['Bench', 'Drop-in']);
  const [base, qd] = ldPipeline(rows, h, NOW, 'all');
  assert.deepStrictEqual([base.label, base.n, qd.n], ['Active PAX', 5, 3]);
});

test("PC Regulars view counts only regulars' Qs; All PAX counts every Q", () => {
  const rows = [...teamRows, r('2026-09-10', 'Drop-in Q', 'Das Boot', 'Q')];
  const h = ldQHistory(rows);
  const regs = ldScopedHistory(h, ldBase(rows, h, NOW, 'regulars'), 'regulars');
  assert.strictEqual(regs['Drop-in Q'], undefined);
  assert.ok(ldScopedHistory(h, ldBase(rows, h, NOW, 'all'), 'all')['Drop-in Q']);
});

console.log('\ntakeover (visiting Qs)');

test('takeover Qs are not leadership; visitors stay off the bench and pipeline', () => {
  const rows = [
    ...teamRows,
    // A visitor who posted enough that week to read as a PC Regular, and Q'd.
    ...['2026-09-21', '2026-09-22', '2026-09-24'].map(d => r(d, 'Visitor', 'Tin2Iron')),
    r('2026-09-23', 'Visitor', 'Tin2Iron', 'Q'),
    // A local man who also Q'd during the takeover keeps his other Qs.
    r('2026-09-24', 'Leader', 'Das Boot', 'Q'),
  ];
  const h = ldQHistory(rows);
  assert.strictEqual(h.Visitor, undefined);
  assert.strictEqual(h.Leader.length, 3, 'the takeover Q is dropped, his own three remain');
  assert.deepStrictEqual([...ldVisitors(rows, h)], ['Visitor']);
  assert.deepStrictEqual(ldBench(rows, h, NOW).map(b => b.name), ['Bench']);
  assert.strictEqual(ldPipeline(rows, h, NOW)[0].n, 3, 'the visitor is not in the PC Regular base');
  assert.deepStrictEqual(ldFirstTimeQs(h, '2026-01-01').map(f => f.name).includes('Visitor'), false);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
