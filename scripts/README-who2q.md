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

## Automated weekly refresh (GitHub Action)

`.github/workflows/who2q-refresh.yml` runs Sundays 10:00 UTC and on
manual dispatch (Actions tab → "Refresh Who2Q data" → Run workflow).
One-time setup:

1. In the GCP project used for billing the queries:
   `gcloud iam service-accounts create who2q-refresh`
2. Grant it `roles/bigquery.jobUser` on that project, and
   `roles/bigquery.dataViewer` on the `analytics` dataset (if the dataset
   belongs to F3 Nation's project, ask its admins to grant the viewer role
   to the service-account email).
3. Create a JSON key and add its contents as the repo secret `GCP_SA_KEY`.
4. Test via manual dispatch; the run commits `who2q.json` only when data changed.

If the Action ever breaks, the page keeps serving the last committed JSON
and shows its "Data as of" date — refresh locally until fixed.

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
