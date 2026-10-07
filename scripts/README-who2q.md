# Who to Q — data refresh

The page at `/stats/who2q.html` reads `static/stats/data/who2q.json`,
generated from F3 Nation BigQuery by `scripts/who2q_export.py`.
All thresholds and exclusion lists live in `scripts/who2q_config.json`
(`excluded_aos`, `excluded_pax`, `name_aliases`) — edit, re-run the
export, commit.

## Refresh locally (works today)

    gcloud auth application-default login   # once
    pip3 install -r scripts/requirements-who2q.txt
    python3 scripts/who2q_export.py
    git add static/stats/data/who2q.json && git commit -m "chore(who2q): data refresh" && git push

## Automated daily refresh

The refresh runs in the **Slack_Data_Collector** repo, as part of its daily
`bq-import.yml` workflow (the old `who2q-refresh.yml` here was retired). That
job checks out this repo's `main`, runs `scripts/tests`, runs
`scripts/who2q_export.py`, and commits `who2q.json` only when it changed. So a
change merged here is live on the next run; the job installs only
`requirements-who2q.txt`, so the export must not need anything else.

If the job ever breaks, the page keeps serving the last committed JSON and
shows its "Data as of" date — refresh locally until fixed.

## Site Qs and Site Q candidates

Current Site Qs come from the **Site Q roster** tab of the
[Peak City Q Sheet](https://docs.google.com/spreadsheets/d/13aEBXExY-04Lq8cCtnqIeOhaxSDh0CGuUPY9vrYW8Io/edit?gid=1809974440),
published as CSV (`site_qs_csv_url`). One row per Site Q term:

| Column | Rule |
|---|---|
| AO | As the sheet spells it; `ao_aliases` maps it to the Who to Q name when they differ (`CougarTown` → `Cougar Town`). Case and curly apostrophes don't matter |
| F3 Name | As BigQuery has it, or add a `name_aliases` entry (`Chicken Little` → `The Chicken Little`). A trailing "(summer)" / "(winter)" is ignored |
| Start Date | `5/5/2025`, `5/18/24`, `2025-05`, `2025` or blank (unknown) |
| End Date | Blank or `Not Yet` while current; a date once the term ends. Keep the row: it's the history |
| Season | `All`, `Summer` (May–Sept) or `Winter` (Oct–Apr). A man listed for both is shown once, all year |

A malformed roster (missing column, unreadable date, unknown season) **stops
the export** so the site keeps yesterday's data; the run log says which row.
A name or AO that matches nothing is a `WARNING:` line in the log, not a stop.

A **candidate** for an AO, over the last `candidate_window_weeks` (26):
posted at `candidate_attendance` (40%) or more of its workouts, Q'd there at
least `candidate_min_qs` (1) time, and is not a current Site Q anywhere. Past
Site Qs are listed after everyone else; those whose term ended within
`recent_site_q_months` (12) go last. Alphabetical otherwise. Each candidate
carries Qs here, the number of AOs he Q'd at, and his first attendance on
record (`first_seen`: BigQuery history starts around Aug 2025, so read it as
"since at least").

Takeovers (`visiting_q_windows`): another region's men leading our workouts.
Their Qs never count, for candidates or for "Overdue for a Q". Same dates as
`F3_VISITING_Q_WINDOWS` in `static/stats/assets/js/data.js`.

**Check a candidate list by hand** (Hot for Teacher; expect the page's list
plus any current Site Q, who the page leaves out):

    WITH win AS (
      SELECT a.user_id, a.f3_name, e.ao_name, e.start_date, a.q_ind
      FROM `analytics.attendance_info` a
      JOIN `analytics.event_info` e ON e.id = a.event_instance_id
      WHERE e.region_org_id = 40342
        AND e.start_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 26 WEEK)
    ),
    denom AS (SELECT ao_name, COUNT(DISTINCT start_date) n FROM win GROUP BY ao_name)
    SELECT ANY_VALUE(w.f3_name) AS name,
           ROUND(COUNT(DISTINCT w.start_date) / ANY_VALUE(d.n), 2) AS rate,
           COUNTIF(w.q_ind = 1 AND w.start_date NOT BETWEEN '2026-09-22' AND '2026-09-25') AS qs_here
    FROM win w JOIN denom d USING (ao_name)
    WHERE w.ao_name = 'Hot for Teacher'
    GROUP BY w.user_id
    HAVING rate >= 0.4 AND qs_here >= 1
    ORDER BY name;

## Validation against SQL (Beaver Chase example)

**List 2 (overdue Qs)** — expect exact match with the page:

    SELECT a.f3_name,
           MAX(e.start_date) AS last_q,
           DATE_DIFF(CURRENT_DATE(), MAX(e.start_date), DAY) AS days_since
    FROM `analytics.attendance_info` a
    JOIN `analytics.event_info` e ON e.id = a.event_instance_id
    WHERE e.region_org_id = 40342 AND a.q_ind = 1 AND e.ao_name = "Beaver Chase"
    GROUP BY a.f3_name
    HAVING days_since > 60
    ORDER BY days_since DESC;

Note: the page groups by `user_id` and shows the latest `f3_name` with
aliases applied, so rows may differ if one person posted under two names.

**List 1 (regulars who never Q'd)** — expect the page's top 10:

    WITH win AS (
      SELECT a.user_id, a.f3_name, e.start_date
      FROM `analytics.attendance_info` a
      JOIN `analytics.event_info` e ON e.id = a.event_instance_id
      WHERE e.region_org_id = 40342 AND e.ao_name = "Beaver Chase"
        AND e.start_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 16 WEEK)
    ),
    denom AS (SELECT COUNT(DISTINCT start_date) AS n FROM win),
    ever_q AS (
      SELECT DISTINCT a.user_id
      FROM `analytics.attendance_info` a
      JOIN `analytics.event_info` e ON e.id = a.event_instance_id
      WHERE e.region_org_id = 40342 AND e.ao_name = "Beaver Chase" AND a.q_ind = 1
    )
    SELECT ANY_VALUE(w.f3_name) AS f3_name,
           COUNT(DISTINCT w.start_date) AS attended,
           ROUND(COUNT(DISTINCT w.start_date) / (SELECT n FROM denom), 3) AS rate,
           MAX(w.start_date) AS last_attended
    FROM win w
    WHERE w.user_id NOT IN (SELECT user_id FROM ever_q)
    GROUP BY w.user_id
    HAVING rate >= 0.5
    ORDER BY rate DESC, last_attended DESC, f3_name
    LIMIT 10;

Caveat: `CURRENT_DATE()` in the SQL vs `generated_at` in the JSON differ
if you validate on a different day than the export ran.
