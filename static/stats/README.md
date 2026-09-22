# Stats dashboard — metric definitions

How the numbers on <https://f3peakcity.com/stats/> are computed. All pages read
the same published Google Sheet ("Raw" tab) at page load and aggregate in the
browser; there is no build step and no stored copy of these numbers.

## What counts as a post

**This differs by page. It is the single most common source of "that number
looks wrong" reports, so check here first.**

| Page | Counting | Why |
|---|---|---|
| `leaderboard.html` (#112) | One post per PAX per **calendar day**, from AUG 2026 on | A monthly challenge; a day is a day |
| `pax.html`, `pax-detail.html` | One post per **raw record** | Per-PAX totals and averages |
| `ao.html` | One record per **AO per day** | Headcount at a location |
| `fng.html` | One record per **raw record** | First-post tracking |

### The #112 rule

The challenge is **12 posts plus at least one Peak City Q in a calendar month**.

A calendar day is worth **one post**, however many attendance records it
carries. **Saturdays are the exception**: a Saturday workout plus a qualifying
second AO earns an extra post for each distinct qualifying AO.

Qualifying second-post AOs (`LB_SECOND_POST_SITES` in `assets/js/leaderboard.js`):

- NeighborUp
- WWCM
- F3 Dads — *no `Site` rows exist in the sheet yet; pre-listed so the rule works
  the day that AO starts reporting. If it gets logged under a different name,
  that constant needs the real string.*

Two regular AOs on one Saturday morning is still a single post — the second
post must be one of the AOs above.

Q records are counted **per record**, not per day. #112 only asks whether a PAX
led at least one workout in the month, so day-grouping them would change
nothing but the habit-card tooltip.

### The rule is forward-looking

`LB_DAY_CREDIT_FROM = '2026-08'`. Months before it keep the original
one-post-per-record count, so nobody loses a #112 month they had already
finished under the old counting.

August was chosen as the cutoff because it revokes **zero** completions while
still correcting the month that surfaced the bug. Applying the rule retroactively
across all of 2026 would have stripped five already-earned completions
(Cataracts, Sooey, Iceman, Rooney in JAN; Hitchhiker in JULY).

**If this rule ever changes again, re-run that zero-revocation check before
picking a new cutoff.** Compare completion counts before and after against the
published sheet; the totals should hold.

## Known upstream data issue

Out-of-region BigQuery events discard the real AO name and are stored as
`#downrange`, while the Slack backblast for the same workout resolves to its
real AO name. Because the import dedup key includes Site, both rows land — one
workout, two posts. **51 person-days are affected in 2026.**

Tracked as [f3peakcity/Slack_Data_Collector#48][issue]. Not yet fixed.

Day-grouping masks this on the #112 leaderboard from August on, but `pax.html`
still double-counts those days because it counts raw records. When the import is
fixed, the raw count converges and both pages agree.

[issue]: https://github.com/f3peakcity/Slack_Data_Collector/issues/48

## Other definitions

- **PC Regular** — 26+ posts in the trailing 26 weeks, *or* 3+ posts in the
  trailing 3 weeks. Excludes `#downrange` and Shield Lock.
- **Active Streakers** — consecutive months completing #112. During the first
  13 days of a month the count runs through the prior month, so a new month
  does not show everyone at zero.

## Tests

Run from the repo root:

```bash
node static/stats/test/leaderboard.test.js     # #112 counting rules
node static/stats/test/ao.test.js
node static/stats/test/data.test.js
node static/stats/test/who2q.test.js
```

Browser tests need a server and headless Chrome — see the header comment in
`test/browser/ao-daily-chart.test.js`.

`test/fixtures/jockey-aug-2026.csv` holds real published records
and backs the regression test for the August 2026 count.

## Cache busting

Stats pages pin their assets with a `?v=` token. **Bump it on the affected page
whenever its CSS or JS changes**, or returning visitors get a stale asset against
new markup.
