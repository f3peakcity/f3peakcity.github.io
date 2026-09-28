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

## New Guy Journey (`fng.html`)

Built from attendance alone. Each rate counts only FNGs old enough to have
reached that step, so last week's FNG is never a "no" on the 30-day return.
Only posts **after** the FNG-tagged post count as coming back.

- **Came back within 7 / 30 days**: a post within N days of the FNG post.
- **Established**: 4+ posts (counting the first) within 30 days.
- **Still posting after 60 days**: any post 60+ days after the first.
- **Has Q'd**: a Q on record: the only contribution step the data can see.
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
- **Q load by AO** (also on the AO cards): share of an AO's last-90-day
  Q-led workouts led by its two busiest Qs. Rust at 50%+, gold at 40%+,
  uncolored under 6 Q-led workouts (`F3_Q_LOAD_*` in `data.js`).

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
node static/stats/test/data.test.js
node static/stats/test/who2q.test.js
node static/stats/test/leadership.test.js
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
