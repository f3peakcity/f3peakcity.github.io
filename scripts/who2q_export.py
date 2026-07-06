#!/usr/bin/env python3
"""Query BigQuery and write static/stats/data/who2q.json.

Usage:
    pip3 install -r scripts/requirements-who2q.txt
    python3 scripts/who2q_export.py

Auth: uses Application Default Credentials (gcloud auth application-default
login locally; a service-account key in CI). See scripts/README-who2q.md.
"""
import json
import sys
from datetime import date
from pathlib import Path

from google.cloud import bigquery

sys.path.insert(0, str(Path(__file__).resolve().parent))
from who2q_compute import build_payload

SCRIPT_DIR = Path(__file__).resolve().parent
CONFIG_PATH = SCRIPT_DIR / "who2q_config.json"
OUT_PATH = SCRIPT_DIR.parent / "static" / "stats" / "data" / "who2q.json"

# All-time Q history for the region. Traceable to the spec's example query.
Q_SQL = """
SELECT a.user_id, a.f3_name, e.ao_name, e.start_date
FROM `{ds}.attendance_info` AS a
JOIN `{ds}.event_info` AS e ON e.id = a.event_instance_id
WHERE e.region_org_id = @region
  AND a.q_ind = 1
"""

# Window attendance (all roles — a Q counts as a post).
ATT_SQL = """
SELECT a.user_id, a.f3_name, e.ao_name, e.start_date
FROM `{ds}.attendance_info` AS a
JOIN `{ds}.event_info` AS e ON e.id = a.event_instance_id
WHERE e.region_org_id = @region
  AND e.start_date >= DATE_SUB(CURRENT_DATE(), INTERVAL @weeks WEEK)
"""


def fetch_rows(client, sql, params):
    job = client.query(sql, job_config=bigquery.QueryJobConfig(query_parameters=params))
    rows = []
    for r in job.result():
        if r.user_id is None or r.start_date is None or not r.f3_name:
            continue
        rows.append({
            "user_id": r.user_id,
            "f3_name": r.f3_name.strip(),
            "ao_name": (r.ao_name or "").strip(),
            "start_date": r.start_date,
        })
    return rows


def main():
    config = json.loads(CONFIG_PATH.read_text())
    project = config.get("bq_project")
    if not project:
        sys.exit("Set bq_project in scripts/who2q_config.json (see scripts/README-who2q.md)")
    ds = config.get("bq_dataset", "analytics")
    region = bigquery.ScalarQueryParameter("region", "INT64", config["region_org_id"])
    weeks = bigquery.ScalarQueryParameter("weeks", "INT64", config["window_weeks"])

    client = bigquery.Client(project=project)
    q_rows = fetch_rows(client, Q_SQL.format(ds=ds), [region])
    att_rows = fetch_rows(client, ATT_SQL.format(ds=ds), [region, weeks])
    print(f"Fetched {len(q_rows)} Q rows (all time), {len(att_rows)} attendance rows "
          f"(last {config['window_weeks']} weeks)")

    payload = build_payload(q_rows, att_rows, date.today(), config)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=1, ensure_ascii=False) + "\n")
    print(f"Wrote {OUT_PATH} — {len(payload['aos'])} AOs, generated_at {payload['generated_at']}")


if __name__ == "__main__":
    main()
