# Stats landing — implementation notes

> **Child pages (AO, PAX, FNG, Leaderboard, Who to Q):** see `PAGES.md`. Their styles are already in `stats.css`.

Files: `index.html` (markup), `stats.css` (all styles), `assets/` (logo). No framework, no build step.

## Install
1. Copy `stats.css` into `static/stats/assets/css/` and link it **after** the existing CSS (or replace the landing-page rules in `custom.css`).
2. Replace the landing page body markup with `index.html`'s `<body>`. Keep the existing `<script>` tags.
3. Nav and row links already point at the live pages (`ao.html`, `pax.html`, `fng.html`, `leaderboard.html`, `who2q.html`).

## Wiring live data
The numbers in the markup are placeholders. Point the existing Google Sheets JS at these IDs (set `textContent`):
- `stat-total-posts`: all-time posts, formatted with commas
- `stat-total-pax`, `stat-active-aos`
- `stat-fng-pct` (e.g. `63%`) and `stat-fng-ratio` (e.g. `26 of 41`): these used to be one string, now split in two
- `meta-aos`, `meta-pax`, `meta-fngs`, `meta-lb`: the small labels on each dashboard row

Mark the current page in the nav with `aria-current="page"`. It turns white.

## Design rules (don't drift)
- **Three fonts, fixed roles.** Barlow Condensed 700–900 for numbers and headings (always uppercase). Lora for sentences. Open Sans for labels and nav.
- **One label style.** Every small caps label uses `.label`: 11px, 600 weight, 0.18em tracking, khaki. Don't add new sizes.
- **Type scale in use:** 184 / 112 / 64 / 56 / 40 / 28 / 26 / 22 / 20 / 18 / 17 / 16 / 15 / 14 / 11 px (child pages use 10px only for month labels on charts). Nothing else.
- **Green is for one thing at a time:** the kicker, the accent KPI, arrows, links. Don't color whole headings green.
- **Rules:** 4px ink under the hero, 2px ink for section edges, 1px tan (`--rule`) between items. No rounded corners or shadows anywhere.
- **Spacing:** 24px gutter and padding, 56px between major sections.
- **Responsive:** it's already built in. The hero stacks, the KPIs wrap, and under 560px the dashboard arrow drops under the description. The only media query is the one in the CSS.
