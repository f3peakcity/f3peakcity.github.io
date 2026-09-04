// Node.js unit tests for leaderboard.js post-credit aggregation.
// Run with: node static/stats/test/leaderboard.test.js

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const dataUtils = require('../assets/js/data.js');
global.f3ParseLocalDate = dataUtils.f3ParseLocalDate;

const {
  LB_SECOND_POST_SITES, LB_DAY_CREDIT_FROM,
  lbDayPostCredit, lbMonthlyPostCredit, lbMonthLabel,
} = require('../assets/js/leaderboard.js');

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

const row = (date, site, role) => ({ Date: date, Name: 'Jockey', Site: site, Role: role || 'P' });

// 2026 weekday anchors used below:
//   2026-08-12 Wed · 2026-08-15 Sat · 2026-08-30 Sun · 2026-08-01 Sat · 2026-08-31 Mon

console.log('\nlbDayPostCredit — one post per calendar day');

test('a single record on a weekday earns 1', () => {
  assert.strictEqual(lbDayPostCredit('2026-08-12', ['7th Inning Stretch']), 1);
});

test('two different AOs on a weekday still earn only 1', () => {
  assert.strictEqual(lbDayPostCredit('2026-08-12', ['7th Inning Stretch', 'Half Dome']), 1);
});

test('a duplicated import of the same AO on a weekday earns 1', () => {
  assert.strictEqual(lbDayPostCredit('2026-08-12', ["Dante's Peak", "Dante's Peak"]), 1);
});

test('a day with no records earns 0', () => {
  assert.strictEqual(lbDayPostCredit('2026-08-12', []), 0);
});

console.log('\nlbDayPostCredit — Saturday double-downs');

test('Saturday workout plus NeighborUp earns 2', () => {
  assert.strictEqual(lbDayPostCredit('2026-08-15', ['Umstead Trails Collaborative', 'NeighborUp']), 2);
});

test('Saturday workout plus WWCM earns 2', () => {
  assert.strictEqual(lbDayPostCredit('2026-08-15', ['Das Boot', 'WWCM']), 2);
});

test('Saturday workout plus F3 Dads earns 2', () => {
  assert.strictEqual(lbDayPostCredit('2026-08-15', ['Das Boot', 'F3 Dads']), 2);
});

test('Saturday workout plus both NeighborUp and F3 Dads earns 3', () => {
  assert.strictEqual(lbDayPostCredit('2026-08-15', ['Das Boot', 'NeighborUp', 'F3 Dads']), 3);
});

test('two regular AOs on a Saturday earn only 1 — the second must qualify', () => {
  assert.strictEqual(lbDayPostCredit('2026-08-15', ['Das Boot', 'Ruck this Way']), 1);
});

test('a qualifying site alone on a Saturday earns 1, not 2', () => {
  assert.strictEqual(lbDayPostCredit('2026-08-15', ['NeighborUp']), 1);
});

test('a duplicated qualifying site on a Saturday earns 1', () => {
  assert.strictEqual(lbDayPostCredit('2026-08-15', ['NeighborUp', 'NeighborUp']), 1);
});

test('the same pairing on a Sunday earns 1 — double-downs are Saturday-only', () => {
  assert.strictEqual(lbDayPostCredit('2026-08-30', ['Sunday Slowzy', 'NeighborUp']), 1);
});

test('the same pairing on a Wednesday earns 1', () => {
  assert.strictEqual(lbDayPostCredit('2026-08-12', ['7th Inning Stretch', 'WWCM']), 1);
});

test('qualifying-site matching ignores case and surrounding whitespace', () => {
  assert.strictEqual(lbDayPostCredit('2026-08-15', ['Das Boot', '  neighborup ']), 2);
});

test('every configured qualifying site is honored on a Saturday', () => {
  LB_SECOND_POST_SITES.forEach(site => {
    assert.strictEqual(
      lbDayPostCredit('2026-08-15', ['Das Boot', site]), 2,
      `${site} should earn a Saturday double-down`);
  });
});

console.log('\nlbDayPostCredit — local-date convention');

test('the date string is read as a local calendar date, not UTC', () => {
  // new Date('2026-08-15') would be UTC midnight = Fri Aug 14 west of GMT,
  // which would silently disable Saturday double-downs for the whole region.
  assert.strictEqual(lbDayPostCredit('2026-08-15', ['Das Boot', 'WWCM']), 2);
  assert.strictEqual(lbDayPostCredit('2026-08-16', ['Sunday Slowzy', 'WWCM']), 1);
});

test('an unparseable date still earns 1 rather than being dropped', () => {
  assert.strictEqual(lbDayPostCredit('not-a-date', ['Das Boot']), 1);
});

console.log('\nlbMonthlyPostCredit — grouping');

test('records on separate days each count once', () => {
  const out = lbMonthlyPostCredit([
    row('2026-08-03', 'Beaver Chase'),
    row('2026-08-04', 'Pump Fiction'),
    row('2026-08-05', '7th Inning Stretch'),
  ]);
  assert.strictEqual(out['Jockey'].posts['AUG 2026'], 3);
});

test('records with different import times on one day count once', () => {
  const out = lbMonthlyPostCredit([
    { Date: '2026-08-12', Name: 'Jockey', Site: '7th Inning Stretch', Role: 'P', ImportedAt: '2026-08-12 13:17:23' },
    { Date: '2026-08-12', Name: 'Jockey', Site: '7th Inning Stretch', Role: 'P', ImportedAt: '2026-08-13 07:41:26' },
  ]);
  assert.strictEqual(out['Jockey'].posts['AUG 2026'], 1);
});

test('August 1 and August 31 count toward August', () => {
  const out = lbMonthlyPostCredit([
    row('2026-08-01', 'Umstead Trails Collaborative'),
    row('2026-08-31', 'Beaver Chase'),
  ]);
  assert.strictEqual(out['Jockey'].posts['AUG 2026'], 2);
});

test('July 31 and September 1 are excluded from August', () => {
  const out = lbMonthlyPostCredit([
    row('2026-07-31', 'Tin2Iron'),
    row('2026-08-15', 'Das Boot'),
    row('2026-09-01', 'Cougar Town'),
  ]);
  assert.strictEqual(out['Jockey'].posts['AUG 2026'], 1);
  assert.strictEqual(out['Jockey'].posts['JULY 2026'], 1);
  assert.strictEqual(out['Jockey'].posts['SEP 2026'], 1);
});

test('a Saturday double-down spanning no month boundary lands wholly in its month', () => {
  // 2026-08-01 is itself a Saturday
  const out = lbMonthlyPostCredit([
    row('2026-08-01', 'Umstead Trails Collaborative'),
    row('2026-08-01', 'NeighborUp'),
  ]);
  assert.strictEqual(out['Jockey'].posts['AUG 2026'], 2);
});

test('non-2026 rows are ignored', () => {
  const out = lbMonthlyPostCredit([
    row('2025-08-12', 'Beaver Chase'),
    row('2026-08-12', 'Beaver Chase'),
  ]);
  assert.strictEqual(out['Jockey'].posts['AUG 2026'], 1);
});

console.log('\nlbMonthlyPostCredit — names');

test('surrounding whitespace in a name is trimmed to one PAX', () => {
  const out = lbMonthlyPostCredit([
    { Date: '2026-08-03', Name: ' Jockey ', Site: 'Beaver Chase', Role: 'P' },
    { Date: '2026-08-04', Name: 'Jockey',   Site: 'Pump Fiction', Role: 'P' },
  ]);
  assert.strictEqual(Object.keys(out).length, 1);
  assert.strictEqual(out['Jockey'].posts['AUG 2026'], 2);
});

test('different PAX are aggregated independently', () => {
  const out = lbMonthlyPostCredit([
    { Date: '2026-08-12', Name: 'Jockey',    Site: 'Beaver Chase', Role: 'P' },
    { Date: '2026-08-12', Name: 'Jockstrap', Site: 'Beaver Chase', Role: 'P' },
  ]);
  assert.strictEqual(out['Jockey'].posts['AUG 2026'], 1);
  assert.strictEqual(out['Jockstrap'].posts['AUG 2026'], 1);
});

test('rows without a name are ignored', () => {
  const out = lbMonthlyPostCredit([
    { Date: '2026-08-12', Name: '   ', Site: 'Beaver Chase', Role: 'P' },
    row('2026-08-12', 'Beaver Chase'),
  ]);
  assert.strictEqual(Object.keys(out).length, 1);
});

console.log('\nlbMonthlyPostCredit — Q counts');

test('Q records are tallied per month alongside posts', () => {
  const out = lbMonthlyPostCredit([
    row('2026-08-06', 'Hot for Teacher', 'Q'),
    row('2026-08-20', 'Half Dome', 'Q'),
    row('2026-08-21', 'Half Dome', 'P'),
  ]);
  assert.strictEqual(out['Jockey'].qs['AUG 2026'], 2);
  assert.strictEqual(out['Jockey'].posts['AUG 2026'], 3);
});

console.log('\nlbMonthlyPostCredit — the rule is forward-looking');

test('the cutoff is the month the day-credit rule takes effect', () => {
  assert.strictEqual(LB_DAY_CREDIT_FROM, '2026-08');
});

test('months before the cutoff keep the original per-record count', () => {
  // Red Ryder really did post at two AOs on Wed 2026-01-07. Under the old rule
  // that was 2 posts, and finishers keep what they earned.
  const out = lbMonthlyPostCredit([
    row('2026-01-07', 'Cougar Town'),
    row('2026-01-07', "Lion's Den"),
  ]);
  assert.strictEqual(out['Jockey'].posts['JAN 2026'], 2);
});

test('a duplicated import before the cutoff also keeps its original count', () => {
  const out = lbMonthlyPostCredit([
    row('2026-03-06', "Dante's Peak"),
    row('2026-03-06', "Dante's Peak"),
  ]);
  assert.strictEqual(out['Jockey'].posts['MAR 2026'], 2);
});

test('a Saturday before the cutoff is not day-credited either', () => {
  // 2026-01-10 is a Saturday with two regular AOs — 2 under the old rule.
  const out = lbMonthlyPostCredit([
    row('2026-01-10', 'Das Boot'),
    row('2026-01-10', 'Ruck this Way'),
  ]);
  assert.strictEqual(out['Jockey'].posts['JAN 2026'], 2);
});

test('July 2026 is before the cutoff and keeps its original count', () => {
  const out = lbMonthlyPostCredit([
    row('2026-07-23', 'Half Dome'),
    row('2026-07-23', 'Ruck the Hall'),
  ]);
  assert.strictEqual(out['Jockey'].posts['JULY 2026'], 2);
});

test('August 2026 is on the cutoff and is day-credited', () => {
  const out = lbMonthlyPostCredit([
    row('2026-08-12', '7th Inning Stretch'),
    row('2026-08-12', 'Half Dome'),
  ]);
  assert.strictEqual(out['Jockey'].posts['AUG 2026'], 1);
});

test('months after the cutoff are day-credited', () => {
  const out = lbMonthlyPostCredit([
    row('2026-09-02', '7th Inning Stretch'),
    row('2026-09-02', 'Half Dome'),
  ]);
  assert.strictEqual(out['Jockey'].posts['SEP 2026'], 1);
});

test('the cutoff splits a single run of days at the month boundary', () => {
  const out = lbMonthlyPostCredit([
    row('2026-07-30', 'Half Dome'),
    row('2026-07-30', 'Ruck the Hall'),
    row('2026-08-03', 'Beaver Chase'),
    row('2026-08-03', 'Off The Rails'),
  ]);
  assert.strictEqual(out['Jockey'].posts['JULY 2026'], 2);
  assert.strictEqual(out['Jockey'].posts['AUG 2026'], 1);
});

console.log('\nregression — real published data for Jockey, August 2026');

const fixture = dataUtils.f3ParseCSV(
  fs.readFileSync(path.join(__dirname, 'fixtures/jockey-aug-2026.csv'), 'utf8'), 0);

test('the fixture holds the 29 raw August records the old code counted', () => {
  const aug = fixture.filter(r => r['Date'].startsWith('2026-08'));
  assert.strictEqual(aug.length, 29);
  assert.strictEqual(new Set(aug.map(r => r['Date'])).size, 27);
});

test('Jockey earns 28 posts in August 2026 — 27 days plus one Saturday NeighborUp', () => {
  const out = lbMonthlyPostCredit(fixture);
  assert.strictEqual(out['Jockey'].posts['AUG 2026'], 28);
});

test('the 2026-08-30 Sunday pair collapses to a single post', () => {
  // #downrange + Sunday Slowzy, both real, but Sunday is not a double-down day
  assert.strictEqual(lbDayPostCredit('2026-08-30', ['#downrange', 'Sunday Slowzy']), 1);
});

test('September records do not leak into the August total', () => {
  const out = lbMonthlyPostCredit(fixture);
  assert.strictEqual(out['Jockey'].posts['SEP 2026'], 3);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
