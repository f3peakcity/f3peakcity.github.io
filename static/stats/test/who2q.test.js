// Node.js unit tests for who2q.js pure render helpers
// Run with: node static/stats/test/who2q.test.js

const assert = require('assert');
const dataUtils = require('../assets/js/data.js');
global.f3Esc = dataUtils.f3Esc;
global.f3ParseLocalDate = dataUtils.f3ParseLocalDate;
const { who2qFmtRate, who2qFmtDate, who2qNeverRowsHtml, who2qStaleRowsHtml } =
  require('../assets/js/who2q.js');

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

test('never-qd table renders rows in order with rank', () => {
  const html = who2qNeverRowsHtml([
    { name: 'Blue Steel', attended: 12, rate: 0.75, last_attended: '2026-07-01' },
    { name: 'Magnum', attended: 8, rate: 0.5, last_attended: '2026-06-24' },
  ]);
  assert.ok(html.indexOf('Blue Steel') < html.indexOf('Magnum'));
  assert.ok(html.includes('75%'));
  assert.ok(html.includes('Jul 1, 2026'));
});

test('never-qd empty state', () => {
  const html = who2qNeverRowsHtml([]);
  assert.ok(html.includes('already Q’d'));
  assert.ok(!html.includes('<table'));
});

test('stale-q table shows days ago and window attendance', () => {
  const html = who2qStaleRowsHtml([
    { name: 'Mercy Rule', last_q: '2026-01-15', days_since: 172, attended_in_window: 5 },
    { name: 'Bench', last_q: '2026-04-01', days_since: 96, attended_in_window: 0 },
  ]);
  assert.ok(html.indexOf('Mercy Rule') < html.indexOf('Bench'));
  assert.ok(html.includes('172 days'));
  assert.ok(html.includes('Jan 15, 2026'));
});

test('stale-q empty state', () => {
  const html = who2qStaleRowsHtml([]);
  assert.ok(html.includes('No overdue Qs'));
});

test('render helpers escape HTML in names', () => {
  const html = who2qNeverRowsHtml([
    { name: '<img src=x>', attended: 1, rate: 1, last_attended: '2026-07-01' },
  ]);
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
