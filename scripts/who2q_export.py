#!/usr/bin/env python3
"""Write static/stats/data/who2q.json from the BigQuery snapshot (or BigQuery).

Usage:
    python3 scripts/who2q_export.py --snapshot DIR   # reads DIR/bq_*.csv, no BigQuery
    python3 scripts/who2q_export.py                  # queries BigQuery (legacy path)

--snapshot DIR is Slack_Data_Collector's data/ledger (the full-history BigQuery
snapshot its bq-import.yml commits daily). The query path needs
`pip3 install -r scripts/requirements-who2q.txt` and Application Default
Credentials. See scripts/README-who2q.md.
"""
import argparse
import csv
import json
import sys
import urllib.request
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from who2q_compute import PC_REGULAR_WEEKS, RosterError, build_payload, parse_roster, plausibility_error

SCRIPT_DIR = Path(__file__).resolve().parent
CONFIG_PATH = SCRIPT_DIR / "who2q_config.json"
OUT_PATH = SCRIPT_DIR.parent / "static" / "stats" / "data" / "who2q.json"

# All-time Q history for the region. Traceable to the spec's example query.
Q_SQL = """
SELECT a.user_id, a.f3_name, e.ao_name, e.name, e.start_date,
       e.first_f_ind, e.second_f_ind, e.third_f_ind
FROM `{ds}.attendance_info` AS a
JOIN `{ds}.event_info` AS e ON e.id = a.event_instance_id
WHERE e.region_org_id = @region
  AND a.q_ind = 1
"""

# Window attendance (all roles — a Q counts as a post). Covers the longer of the
# Who-to-Q, candidate and PC Regular windows; each list filters its own window in Python.
ATT_SQL = """
SELECT a.user_id, a.f3_name, e.ao_name, e.name, e.start_date,
       e.first_f_ind, e.second_f_ind, e.third_f_ind
FROM `{ds}.attendance_info` AS a
JOIN `{ds}.event_info` AS e ON e.id = a.event_instance_id
WHERE e.region_org_id = @region
  AND e.start_date >= DATE_SUB(CURRENT_DATE(), INTERVAL @weeks WEEK)
"""

# First attendance on record per person: "in F3 since at least" (the profile
# start date in BigQuery isn't reliable, so it isn't used).
FIRST_SQL = """
SELECT a.user_id, MIN(e.start_date) AS first_date
FROM `{ds}.attendance_info` AS a
JOIN `{ds}.event_info` AS e ON e.id = a.event_instance_id
WHERE e.region_org_id = @region
GROUP BY a.user_id
"""


def fetch_roster(url):
    """The published Site Q roster CSV (stdlib only: the CI job installs nothing extra)."""
    with urllib.request.urlopen(url, timeout=30) as resp:
        return parse_roster(resp.read().decode("utf-8-sig"))


def ao_for(ao_name, event_name):
    """The Who to Q AO for an event: BigQuery's ao_name, except Ovaltime, which
    BigQuery files under FMJ. Same rule as Slack_Data_Collector's pipeline: an
    FMJ event whose name contains "ovaltime" is Oval Time ("Ovaltime meets
    Half Dome" is at Half Dome, so it stays there). Callers are already
    scoped to Peak City (region_org_id)."""
    ao_name = (ao_name or "").strip()
    if ao_name == "Full Metal Jacket (FMJ)" and "ovaltime" in (event_name or "").lower():
        return "Oval Time"
    return ao_name


# #204: AOs whose 3rd F events still count as 1st F. Same list as
# Slack_Data_Collector's FIRST_F_AO_OVERRIDES (NeighborUp is a 3rd F service project).
FIRST_F_AO_OVERRIDES = {"NeighborUp"}


def is_first_f(first_f, second_f, third_f, ao_name):
    """Same rule as Slack_Data_Collector's is_first_f (#73): False only for an
    event typed 2nd/3rd F and not 1st F. Flags are 0/1/NULL/'' ('' in the snapshot)."""
    flag = lambda v: v not in (None, "", "0", 0, False)
    return (flag(first_f) or not (flag(second_f) or flag(third_f))
            or ao_name in FIRST_F_AO_OVERRIDES)


def _row(user_id, f3_name, ao_name, event_name, start_date, first_f=1, second_f=0, third_f=0):
    """One q/att row as build_payload wants it, or None (the query path's skip rule,
    and #204: 2nd/3rd F events don't count)."""
    if user_id is None or start_date is None or not f3_name:
        return None
    if not is_first_f(first_f, second_f, third_f, (ao_name or "").strip()):
        return None
    return {"user_id": user_id, "f3_name": f3_name.strip(),
            "ao_name": ao_for(ao_name, event_name), "start_date": start_date}


def fetch_rows(client, sql, params):
    from google.cloud import bigquery
    job = client.query(sql, job_config=bigquery.QueryJobConfig(query_parameters=params))
    rows = (_row(r.user_id, r.f3_name, r.ao_name, r.name, r.start_date,
                 r.first_f_ind, r.second_f_ind, r.third_f_ind) for r in job.result())
    return [r for r in rows if r]


def query_rows(client, ds, region_org_id, att_weeks):
    """(q_rows, att_rows, first_seen) from BigQuery: 3 queries."""
    from google.cloud import bigquery
    region = bigquery.ScalarQueryParameter("region", "INT64", region_org_id)
    weeks = bigquery.ScalarQueryParameter("weeks", "INT64", att_weeks)
    q_rows = fetch_rows(client, Q_SQL.format(ds=ds), [region])
    att_rows = fetch_rows(client, ATT_SQL.format(ds=ds), [region, weeks])
    first_seen = {r.user_id: r.first_date for r in client.query(
        FIRST_SQL.format(ds=ds),
        job_config=bigquery.QueryJobConfig(query_parameters=[region])).result()
        if r.user_id is not None and r.first_date is not None}
    return q_rows, att_rows, first_seen


def snapshot_rows(snapshot_dir, region_org_id, att_weeks, today):
    """(q_rows, att_rows, first_seen) from DIR/bq_*.csv — the same rows Q_SQL,
    ATT_SQL and FIRST_SQL return. The snapshot ('' for NULL) is a superset of
    the region, so filter to region_org_id here."""
    paths = sorted(Path(snapshot_dir).glob("bq_[0-9][0-9][0-9][0-9].csv"))
    if not paths:
        sys.exit(f"Aborting export: no bq_YYYY.csv files in {snapshot_dir}")
    att_start = today - timedelta(weeks=att_weeks)  # DATE_SUB(CURRENT_DATE(), INTERVAL n WEEK)
    region = str(region_org_id)
    q_rows, att_rows, first = [], [], {}
    for path in paths:
        with open(path, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                if r["region_org_id"] != region or not r["user_id"] or not r["start_date"]:
                    continue
                uid, d = int(r["user_id"]), date.fromisoformat(r["start_date"])
                first[uid] = min(first.get(uid, d), d)  # FIRST_SQL: no f3_name filter
                row = _row(uid, r["f3_name"], r["ao_name"], r["name"], d,
                           r["first_f_ind"], r["second_f_ind"], r["third_f_ind"])
                if not row:
                    continue
                if r["q_ind"] == "1":  # a.q_ind = 1 (a count: '2' doesn't match)
                    q_rows.append(row)
                if d >= att_start:
                    att_rows.append(row)
    return q_rows, att_rows, first


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--snapshot", metavar="DIR", help="read DIR/bq_*.csv instead of querying BigQuery")
    ap.add_argument("--today", type=date.fromisoformat, default=date.today(),
                    help="as-of date, YYYY-MM-DD (default: today; snapshot path only)")
    ap.add_argument("--out", type=Path, default=OUT_PATH, help=f"output path (default: {OUT_PATH})")
    args = ap.parse_args()

    config = json.loads(CONFIG_PATH.read_text())
    today = args.today
    att_weeks = max(config["window_weeks"], config.get("candidate_window_weeks", 0), PC_REGULAR_WEEKS)
    if not args.snapshot:
        project = config.get("bq_project")
        if not project:
            sys.exit("Set bq_project in scripts/who2q_config.json (see scripts/README-who2q.md)")
        if today != date.today():
            sys.exit("--today needs --snapshot (BigQuery's window uses CURRENT_DATE())")

    # Roster first: a malformed roster stops the run before anything is written,
    # so the site keeps yesterday's JSON instead of losing its Site Qs.
    roster = None
    if config.get("site_qs_csv_url"):
        try:
            roster = fetch_roster(config["site_qs_csv_url"])
        except (RosterError, OSError) as exc:
            sys.exit(f"Aborting export: Site Q roster: {exc}")
        print(f"Read {len(roster)} Site Q roster rows")

    if args.snapshot:
        q_rows, att_rows, first_seen = snapshot_rows(args.snapshot, config["region_org_id"], att_weeks, today)
    else:
        from google.cloud import bigquery
        client = bigquery.Client(project=project)
        q_rows, att_rows, first_seen = query_rows(
            client, config.get("bq_dataset", "analytics"), config["region_org_id"], att_weeks)
    print(f"Fetched {len(q_rows)} Q rows (all time), {len(att_rows)} attendance rows "
          f"(last {att_weeks} weeks), {len(first_seen)} first-attendance dates")

    warnings = []
    payload = build_payload(q_rows, att_rows, today, config,
                            roster=roster, first_seen=first_seen, warnings=warnings)
    for w in warnings:
        print(f"WARNING: {w}")
    problem = plausibility_error(payload, att_rows)
    if problem:
        sys.exit(f"Aborting export: {problem}")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=1, ensure_ascii=False) + "\n")
    print(f"Wrote {args.out} — {len(payload['aos'])} AOs, generated_at {payload['generated_at']}")


if __name__ == "__main__":
    main()
