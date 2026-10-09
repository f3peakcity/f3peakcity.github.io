# Child pages: implementation guide

Covers `ao.html`, `pax.html`, `fng.html`, `leaderboard.html`, `who2q.html`. All styles are in `stats.css` (bottom half, "CHILD PAGES"). The designs to match are the five `.dc.html` files in the project. Open them side by side while you build.

Keep your existing Google Sheets JS. This is a markup and CSS swap. The only data changes are the handful of new or split values flagged **NEW** below.

---

## Do this on every page

1. **Link `stats.css`** after the existing CSS. Delete the old card, chart and navbar rules for the page as you replace them.
2. **Header and footer:** copy them exactly from `index.html`. Single-tier nav. Put `aria-current="page"` on the current page's link.
3. **Page head.** Replace the old title card with:
   ```html
   <section class="page-head">
     <div class="eyebrow label"><span>Dashboard 01</span><span>Since Jan 1, 2026</span></div>
     <h1 class="page-title">AO Stats</h1>
     <p class="page-sub">…</p>   <!-- or wrap p + toggle in .page-head-row -->
   </section>
   ```
4. **Stats row.** Reuse the landing `.kpis` / `.kpi` markup. Only one KPI per page gets `.kpi--accent` (green). If a value has a secondary figure (e.g. `26` + `63%`), put that figure in `<small>` inside `.kpi-num`.
5. **Sections.** Every block is `.section` > `.section-head` (`h2` + a `.label` note on the right) > content. Two half-width blocks go side by side in `.pair` and stack under ~740px.
6. **Charts.** Replace every Chart.js chart with the HTML patterns below. Bars are sized with inline `style="width:NN%"` (or `height`) relative to the max value in the set. **Only the top bar gets `.is-top` (green).** Everything else is ink.
   - Horizontal list: `.bar-row` > `.bar-name`, `.bar-track > .bar-fill`, `.bar-val`
   - Ranked list: add `.bar-row--ranked` and a leading `.bar-rank` (`01`, `02`…)
   - Columns: `.cols` > `.col` > `.col-plot` (`.col-val` + `.col-bar`) + `.label`
   - Weekly strip: `.strip` > 26 × `<span style="height:NN%">`, then `.axis.label`
7. **Tables.** Use `<table class="table">` inside `.table-wrap`. Add `.num` to numeric columns.
8. **Toggles.** Use `.toggle` with `<button aria-pressed="true|false">`. Wire each one to your existing filter function and flip `aria-pressed` when it's clicked.
9. **Remove:** the card shadows and rounded corners, the old colored card headers, the icon badges, and the ⓘ tooltips. The tooltips are on hold until we have the copy.

---

## 01 · AO Stats (`ao.html`)

**Head:** "Since Jan 1, 2026" · subtitle "Site health metrics for Site Qs…"

**KPIs:** Active AOs · Avg attendance · Unique Qs · **FNGs (accent)**

**Sections, in order:**
1. **Daily attendance by AO.** A `.toggle` in the section head with All / Mon … Sun.
   - *All:* `.cols` with 7 columns, showing total attendance per weekday.
   - *A single day:* swap to a `.bar-row` list of the AOs that meet that day. The columns grid uses `minmax(90px,150px)` for the name.
2. **Weekly attendance.** A `.strip` covering the last 26 weeks. The right label reads "Last 6 months · Peak {max}". Put the date in each bar's `title` so it shows on hover.
3. **`.pair`:** **Avg attendance** (per workout) | **FNGs by AO** (year to date). Both are `.bar-row` lists sorted high→low.
4. **All AOs.** One table with columns AO · Days · Avg · Unique Qs · FNGs, sorted by avg.
   → **This replaces both the old "AO Breakdown" and "All AOs" tables.** Check that nothing else reads from the old table IDs.

---

## 02 · PAX Stats (`pax.html`)

**Head:** subtitle and a `.toggle` inside `.page-head-row`: **PC Regulars** (default) / **All PAX**. The toggle re-filters **everything** on the page: the KPIs, every list, and the table.

**KPIs:** Total PAX · **Active last 3 wks (accent)** · Total posts (with commas) · Total Qs

**Sections:**
1. **Top 15 by posts.** A ranked `.bar-row--ranked` list, year to date.
2. **Weekly avg posts per PAX.** A `.strip`. Mark the **latest** week `.is-top`, not the max. The right label reads "Last 6 months · Now {latest}".
3. **`.pair`:** **Q to post ratio** (top 8, value shown as `%`) | **Most popular AOs** (total posts).
4. **`.pair`:** **Favorite post day**, a `.cols` chart where each column's value is a % share | **PAX trajectory**, a `.row` list (`name | "20 → 28" | ↑8`). Add `.is-good` to the value when it goes up, and leave it muted when it goes down.
5. **Table.** Its title follows the toggle ("PC Regulars" / "All PAX") and the right label shows "{n} PAX". Columns are PAX · Posts · Qs · Home AO · Last seen.

---

## 03 · FNG Stats (`fng.html`)

**KPIs:** Total FNGs · Developing / retained · Pending · **Graduated regular (accent)** with the % in `<small>`

**Sections:**
1. **Status breakdown.** A `.stack` bar made of three `<span style="width:NN%">`: graduated (`--green`), developing (`--ink`), pending (`--track`). Under it goes a `.legend`, one item per status: `.swatch`, `.label`, then `.legend-num` with the count and `<small>` holding the %.
2. **`.pair`:** **Days to 2nd post**, a `.cols` chart with 6 buckets: 0–3 d, 4–7 d, 8–14 d, 15–30 d, 31+ d, None | **Monthly FNG trend**, a `.cols` chart with one column per month so far.
   → **NEW:** the day buckets may not exist in the sheet yet. You'll need to compute them from each FNG's first and second post dates.
3. **All FNGs.** A table, newest first. Columns are FNG · First post · AO · Posts · Days to 2nd · Status. Show status as a `StatusTag` pill if you already have one. Otherwise plain text is fine.

---

## 04 · #112 Leaderboard (`leaderboard.html`)

**Head:** eyebrow "2026 season" · subtitle "12 posts and 1 Peak City Q, every month. That's the crew." · `.toggle` with **PC Regulars** / **All Crew**

**KPIs:** In the crew this year · Month completions (with "Sep, so far" in `<small>`, using the current month) · **Active streakers (accent)**, meaning PAX with 2+ months in a row

**Sections:**
1. **Completions per month.** A `.cols` chart with 12 columns. The current month is `.is-top`. Future months are `.col.is-future` and have no value.
2. **Who's in the crew.** A `.crew` grid of `.row`s, one per PAX on track this month: `name | posts | .streak "4 mo"`. Sort by posts this month.
3. **Year at a glance.** Put the legend in the section head. Below it goes `.heat` > `.heat-inner` > a month header row, then one `.heat-row` per PAX (the name, then 12 `.cell`s showing the post count).
   Cell class comes from the existing four-level key:
   - `cell--low`: 1–5 posts
   - `cell--mid`: 6–11 posts
   - `cell--noq`: 12+ posts but no Q
   - `cell--done`: 12+ posts **and** a Q
   - `cell--future`: an empty future month

   This is the same logic as the old `lb-status-*` classes. Only the class names change.

---

## 05 · Who to Q (`who2q.html`)

**Head:** eyebrow "For Site Qs" · subtitle "Q candidates by AO…". This page has no KPI row.

1. **AO picker.** A strip directly under the head (padding 20px 0, 2px ink underrule) holding `.label` "AO" plus a `.toggle` with one button per AO. It scrolls sideways on mobile. If you have more than ~8 AOs, use a `<select>` styled the same way instead.
2. **Selected AO.** Show the AO name large (Barlow 900, `clamp(40px,7vw,64px)`) with a `.label` summary on the right: "5 never Q'd · 6 overdue".
3. **`.pair`:**
   - **Never Q'd here.** Regulars at this AO with no Q there. Each `.row` is `name | "Last Sep 21" | posts here`, sorted by posts.
   - **Overdue for a Q.** Past Qs at this AO. Each `.row` is `name | "Q'd May 4" | days since`, sorted by days, longest first. Add `.is-good` (green) when it's over 120 days.
4. **Footer** note: "Refreshed weekly from F3 Nation BigQuery". This page's data source is different from the others, so keep your existing fetch.

---

## Check before you ship

- [ ] Only one green KPI per page, and one green bar per chart
- [ ] Every small label uses `.label`. No other label sizes
- [ ] No Chart.js left on these five pages. You can drop the library if nothing else uses it
- [ ] The toggles update `aria-pressed` and re-render everything they scope
- [ ] Check at 375px: the pairs stack, the tables and the heat grid scroll sideways, and the nav wraps
- [ ] `aria-current="page"` is set in the nav on each page
