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

- NeighborUp — WWCM was removed from this list when it merged into NeighborUp
  (see [Site-name migrations](#site-name-migrations) below); historical `WWCM`
  rows are rewritten before this list is ever checked, so it no longer needs a
  separate entry.
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

## Potential Cotters (`pax.html`)

A Cotter is a man who comes back after time away. The PAX page's collapsible
**Potential Cotters** list is the regulars we haven't seen lately, so someone
can reach out and welcome them back. Most recently gone first.

- **Was a regular:** 8+ posts **at Peak City AOs** in the 90 days before his last
  post. #downrange and Shield Lock don't count here: men whose posts are mostly
  out of region are usually another region's PAX.
- **Gone quiet:** no post **anywhere** (any AO, #downrange included) in 21+ days.
  A regular who's traveling and posting downrange isn't on the list.
- **Drops off** after about 6 months away (182 days).
- Shows his last date and AO, and his home AO (where he posted most in that
  window) when it differs. Not tied to the PC Regulars toggle.
- Thresholds are the `PAX_COTTER_*` constants in `assets/js/pax.js`.

### Keeping someone off the list

For any reason (moved, injured, stepped away on purpose, asked not to be listed):

1. In `assets/js/data.js`, add his name **in lowercase** with a short reason to
   `F3_COTTER_EXCLUDED_LC`:

   ```js
   const F3_COTTER_EXCLUDED_LC = {
     'new name': 'moved to Charlotte, 2026-10',
   };
   ```

2. Bump `?v=` on every stats page (`data.js` is shared; see [Cache busting](#cache-busting)).
3. Run the tests and open a pull request. To put him back, delete the line.

## New Guy Journey (`fng.html`)

Built from attendance alone. Each rate counts only FNGs old enough to have
reached that step, so last week's FNG is never a "no" on the 30-day return.
Only posts **after** the FNG-tagged post count as coming back.

- **Came back within 7 / 30 days**: a post within N days of the FNG post.
- **Established**: 4+ posts (counting the first) within 30 days.
- **Still posting after 60 days**: any post 60+ days after the first.
- **Has Q'd**: a Q on record: the only contribution step the data can see.
- **Last seen** (All FNGs table): for FNGs with 2+ posts, days since their
  most recent post; rust at 21+ days (`FNG_FADED_DAYS`, shared with the
  *came back, then faded* list). One-post FNGs show a dash.
- **Follow-ups**: *no second post* (first post 7–60 days ago), *came back,
  then faded* (2–3 posts, none in 21 days, first post within 120 days),
  *ready to Q* (10+ posts, no Q on record).

## Leadership (`leadership.html`)

Q records at Peak City sites only (`#downrange` and Shield Lock excluded).
Records start Jan 2025, so a "first Q" is the first **on record**.

- **Unique Qs / concentration**: last 90 days; concentration is the share of
  Q-led workouts led by the busiest 20% of Qs.
- **Q'd again in 60 days**: of this year's first-time Qs who are 60+ days
  past that first Q, the share who led again within 60 days.
- **Pipeline**: PC Regulars → have Q'd → Q'd in 90 days → regular Q (3+ in 90).
- **Ready to Q**: PC Regulars with no Q on record.
- **PC Regulars / All PAX toggle**: PC Regulars counts only regulars' Qs
  and uses PC Regulars as the base; All PAX counts every Q and uses anyone who
  posted in the last 90 days.
- **Q load by AO** (also on the AO cards): share of an AO's last-90-day
  Q-led workouts led by its two busiest Qs. Rust at 50%+, gold at 40%+,
  uncolored under 6 Q-led workouts (`F3_Q_LOAD_*` in `data.js`).

### Not an FNG (mis-tags)

Sometimes a man is tagged **FNG** in the sheet when he isn't new: a regular
whose tag lands months into his posts, or a visitor from another region. A
false FNG inflates the FNG count, skews the New Guy Journey, and puts a
regular in the follow-up lists.

The fix is a list of names in `assets/js/data.js`. Anyone on it has his FNG
tag read as an ordinary post on **every** stats page (FNG Stats, the landing
page, AO Stats). The sheet itself is not changed.

**Current list**

| Name | Why |
|---|---|
| Bolton | Tagged FNG 2026-08-28 after 84 posts since May 2025 |

#### How to add someone

1. **Check the exact name.** Use the name as it appears in the sheet's `Name`
   column (it's also the name shown on FNG Stats). Case and surrounding spaces
   don't matter; spelling does.
2. **Add a line to the list.** Open `static/stats/assets/js/data.js` and find
   `F3_NOT_FNG_LC`. Add the name in **lowercase**, in quotes, with a comma and
   a short reason:

   ```js
   const F3_NOT_FNG_LC = new Set([
     'bolton',   // tagged FNG 2026-08-28 after 84 posts since May 2025
     'new name', // why he isn't an FNG, with the date of the bad tag
   ]);
   ```

3. **Bump the cache token on every stats page.** `data.js` is loaded by all of
   them, so change `?v=` on all of them or returning visitors keep the old list
   (see [Cache busting](#cache-busting)). From the repo root:

   ```bash
   sed -i '' -E 's/\?v=[0-9]{8}[a-z]/?v=YYYYMMDDa/g' static/stats/*.html   # use today's date
   ```

4. **Add him to the table above** so the next person knows why he's there.
5. **Run the tests**, then open a pull request:

   ```bash
   for f in static/stats/test/*.test.js; do node "$f"; done
   ```

6. **Check after it deploys.** He should be gone from FNG Stats (the table,
   the journey and the follow-up lists), and the FNG counts on the landing page
   and AO Stats drop by one.

To **undo**, delete his line and bump the token again.

#### Finding candidates

A likely false FNG is a man whose FNG tag comes **after** earlier posts under
the same name. Don't add those automatically. Check each one first: Blindside
was tagged a week after his first post, and he is a genuine FNG whose tag was
simply late. Fixing the tag at the source (the Slack/BigQuery import, see the
Slack_Data_Collector repo) is better still, when it's possible.

### Takeovers (visiting Qs)

When another region takes over our workouts, their men's Q records are real
posts but not Peak City leadership. `F3_VISITING_Q_WINDOWS` in `data.js`
lists those date ranges; `f3IsVisitingQ` keeps their Qs out of every Q-depth
metric (Leadership page, AO unique Qs, bench strength, Q load). Men whose only
Qs came during a takeover are treated as visitors and kept off the pipeline
and bench. Attendance, PAX totals and #112 still count those posts.

- **2026-09-22 to 2026-09-25**: South Cary (SCary) takeover. Exception
  (`keep`): Santa Maria, a Peak City man whose 9/23 Q at 7th Inning Stretch counts.

A window's `keep` lists Peak City men (lowercase names) who Q'd during it; their
Qs still count. The Who to Q export keeps the same men by user id in
`scripts/who2q_config.json`.

Add a line for each future takeover.

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

## Site-name migrations

When a real-world AO renames or merges, historical rows in the sheet still
carry the old name. Rather than editing history in the sheet, `data.js`'s
`f3CanonicalSite` rewrites known old names to their current one for every
page, right after parsing — so a rename only needs one entry, in one place.

- **WWCM → NeighborUp** — Western Wake Crisis Ministry merged into NeighborUp
  in Aug 2026. Rows before that date still say `WWCM`; every stats page reads
  them as `NeighborUp`.

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
node static/stats/test/pax.test.js
node static/stats/test/fng.test.js
node static/stats/test/pax-detail.test.js
node static/stats/test/data.test.js
node static/stats/test/who2q.test.js
node static/stats/test/leadership.test.js

# or all at once:
for f in static/stats/test/*.test.js; do node "$f"; done
```

Browser tests need a server and headless Chrome — see the header comment in
`test/browser/ao-daily-chart.test.js`.

`test/fixtures/jockey-aug-2026.csv` holds real published records
and backs the regression test for the August 2026 count.

## Cache busting

Stats pages pin their assets with a `?v=` token. **Bump it on the affected page
whenever its CSS or JS changes**, or returning visitors get a stale asset against
new markup.

## Design system

Every page links one stylesheet, `assets/css/stats.css` (designer handoff,
Sep 2026). No Tabler/Bootstrap. The top half is the handoff verbatim; the
**EXTENSIONS** section holds features kept beyond it (tone scale, AO cards,
habit cards, posting rhythm, sortable headers, status states).

Rules worth keeping:

- **Three fonts, fixed roles.** Barlow Condensed for numbers and headings,
  Lora for sentences, Open Sans for labels. Every small caps label is `.label`.
- **One green per view.** One `.kpi--accent` per page, one green bar per chart
  (`f3HighlightAt`). Everything else is ink. The AO daily chart is the one
  multi-color exception (20+ stacked AOs).
- **Charts go through `data.js`.** `f3ApexOptions` (base theme),
  `f3RankedBarOptions` (horizontal, high to low), `f3ColumnOptions` (days,
  months, buckets). Don't hand-roll Apex options.
- **Explanations are ⓘ info-dots.** `f3InfoDot(tip)` in JS, or the same
  `<button class="info-dot" data-tip="…">` in HTML. One shared popover opens on
  hover, keyboard focus or tap; no Bootstrap. Dense data cells (heat cells,
  rhythm squares, Who to Q rows) keep native `title` hover text instead.
- **Data loads through `f3LoadRawRows()`.** It checks the Raw tab's header
  (`Date, Name, Site, Role`), applies `f3CanonicalSite`, and throws on a
  wrong-shaped sheet so pages show an error instead of an empty page.
  Loading/error/empty states come from `f3ShowLoading/f3ShowError/f3ShowEmpty`.
- **Tables fit; they don't scroll.** Headers wrap (`f3ThLabel` keeps the last
  word, ⓘ and sort arrow together), text cells wrap, `.num`/`.nowrap` cells
  don't. Under 800px, `.table--stack` tables turn each row into a card, with
  labels copied from the headers by `f3StackLabels` (call it after every body
  render). The #112 year grid is the one exception: 12 month cells scroll
  sideways on phones, as the handoff specifies.
