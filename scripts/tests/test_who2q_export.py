"""The snapshot path returns exactly what the 3 BigQuery queries return.

The query path runs the real Q_SQL / ATT_SQL / FIRST_SQL text against sqlite
(stdlib) holding the same fixture the snapshot path reads as CSV, so neither
google-cloud-bigquery nor BigQuery is needed.
"""
import csv
import sqlite3
import sys
import tempfile
import types
import unittest
from datetime import date
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import who2q_export

TODAY = date(2026, 10, 24)
COLS = ["event_instance_id", "user_id", "f3_name", "q_ind", "start_date", "ao_name", "name", "region_org_id",
        "first_f_ind", "second_f_ind", "third_f_ind"]
# '' is NULL, as in the snapshot.
FIXTURE = [
    ("1", "10", "Alpha", "1", "2026-10-20", "Beaver Chase", "", "40342", "1", "0", "0"),   # Q, in window
    ("1", "11", "Bravo ", "0", "2026-10-20", "Beaver Chase", "", "40342", "1", "0", "0"),  # post; name stripped
    ("2", "10", "Alpha", "1", "2024-01-05", "Beaver Chase", "", "40342", "1", "0", "0"),   # old Q, out of window
    ("3", "12", "Charlie", "2", "2026-09-01", "Hot for Teacher", "", "40342", "1", "0", "0"),  # q_ind 2 isn't = 1
    ("7", "13", "", "1", "2025-03-01", "Hot for Teacher", "", "40342", "1", "0", "0"),     # no name: first-seen only
    ("4", "14", "Delta", "", "2026-08-01", "", "", "40342", "1", "0", "0"),                # NULL q_ind, NULL AO
    ("5", "10", "Alpha", "1", "2023-06-01", "Elsewhere", "", "36267", "1", "0", "0"),      # other region: dropped
    ("6", "15", "Echo", "0", "2026-04-25", "Tin2Iron", "", "40342", "1", "0", "0"),        # exactly 26 weeks back
    ("8", "16", "Fox", "0", "2026-04-24", "Tin2Iron", "", "40342", "1", "0", "0"),         # one day before window
    ("9", "17", "Golf", "1", "2026-09-29", "Full Metal Jacket (FMJ)", "Penultimate OVALTIME", "40342", "1", "0", "0"),  # Oval Time
    ("10", "17", "Golf", "1", "2026-09-30", "Full Metal Jacket (FMJ)", "Cinco de FMJ", "40342", "1", "0", "0"),  # stays FMJ
    ("11", "17", "Golf", "1", "2026-10-01", "Half Dome", "Ovaltime meets Half Dome", "40342", "1", "0", "0"),  # stays Half Dome
    ("12", "18", "Hotel", "0", "2026-10-02", "Dante's Peak", "QSource", "40342", "0", "0", "1"),   # 3rd F: dropped
    ("13", "19", "India", "0", "2026-10-03", "NeighborUp", "", "40342", "0", "0", "1"),          # 3rd F override: kept
    ("14", "20", "Juliet", "0", "2026-10-04", "Hot for Teacher", "", "40342", "", "", ""),      # no type flags: kept
    ("15", "21", "Kilo", "1", "2026-10-05", "Hot for Teacher", "", "40342", "0", "1", "0"),     # 2nd F Q: dropped
    ("16", "21", "Kilo", "0", "2026-10-06", "Hot for Teacher", "", "40342", "1", "1", "0"),     # 1st F and 2nd F: kept
]


class FakeBigQuery:
    """google.cloud.bigquery stand-in: runs the query text in sqlite."""

    def __init__(self, db):
        self.db = db
        self.ScalarQueryParameter = lambda name, _type, value: (name, value)
        self.QueryJobConfig = lambda query_parameters: dict(query_parameters)

    def query(self, sql, job_config):
        sql = (sql.replace("`analytics.", "").replace("` AS", " AS")
               .replace("DATE_SUB(CURRENT_DATE(), INTERVAL @weeks WEEK)",
                        f"date('{TODAY}', '-' || (@weeks * 7) || ' days')"))
        cur = self.db.execute(sql, {k: v for k, v in job_config.items()})
        names = [d[0] for d in cur.description]
        rows = []
        for values in cur.fetchall():
            r = types.SimpleNamespace(**dict(zip(names, values)))
            for k in ("start_date", "first_date"):
                if getattr(r, k, None):
                    setattr(r, k, date.fromisoformat(getattr(r, k)))
            rows.append(r)
        return types.SimpleNamespace(result=lambda: rows)


def nullable(v, as_int=False):
    return None if v == "" else (int(v) if as_int else v)


class TestSnapshotMatchesQueries(unittest.TestCase):
    def test_same_rows(self):
        db = sqlite3.connect(":memory:")
        db.execute("CREATE TABLE attendance_info (event_instance_id INT, user_id INT, f3_name TEXT, q_ind INT)")
        db.execute("CREATE TABLE event_info (id INT, start_date TEXT, ao_name TEXT, name TEXT, region_org_id INT,\n                   first_f_ind INT, second_f_ind INT, third_f_ind INT)")
        for eid, uid, name, q, d, ao, _, reg, *_ in FIXTURE:
            db.execute("INSERT INTO attendance_info VALUES (?,?,?,?)",
                       (int(eid), int(uid), nullable(name), nullable(q, True)))
        for eid, _, _, _, d, ao, ev, reg, *flags in {f[0]: f for f in FIXTURE}.values():
            db.execute("INSERT INTO event_info VALUES (?,?,?,?,?,?,?,?)",
                       (int(eid), d, nullable(ao), nullable(ev), int(reg),
                        *(nullable(f, True) for f in flags)))

        fake = FakeBigQuery(db)
        google = types.ModuleType("google")
        cloud = types.ModuleType("google.cloud")
        google.cloud, cloud.bigquery = cloud, fake
        with mock.patch.dict(sys.modules, {"google": google, "google.cloud": cloud,
                                           "google.cloud.bigquery": fake}):
            queried = who2q_export.query_rows(fake, "analytics", 40342, 26)

        with tempfile.TemporaryDirectory() as tmp:
            for year in ("2023", "2026"):  # rows split across year files, like the ledger
                with open(Path(tmp, f"bq_{year}.csv"), "w", newline="", encoding="utf-8") as f:
                    w = csv.writer(f, lineterminator="\n")
                    w.writerow(COLS)
                    w.writerows(r for r in FIXTURE if (r[4][:4] == "2026") == (year == "2026"))
            snap = who2q_export.snapshot_rows(tmp, 40342, 26, TODAY)

        key = lambda r: (r["start_date"], r["user_id"], r["ao_name"])
        q_q, q_att, q_first = queried
        s_q, s_att, s_first = snap
        self.assertEqual(sorted(q_q, key=key), sorted(s_q, key=key))
        self.assertEqual(sorted(q_att, key=key), sorted(s_att, key=key))
        self.assertEqual(q_first, s_first)
        # Guard against both sides being trivially empty or equally wrong.
        self.assertEqual(len(s_q), 5)  # user 13 has no f3_name; user 21's 2nd F Q is dropped
        self.assertEqual({r["user_id"] for r in s_att}, {10, 11, 12, 14, 15, 17, 19, 20, 21})  # not 18 (3rd F); 19 NeighborUp override
        # Ovaltime splits out of FMJ; "Ovaltime meets Half Dome" stays at Half Dome.
        golf = {str(r["start_date"]): r["ao_name"] for r in s_q if r["user_id"] == 17}
        self.assertEqual(golf, {"2026-09-29": "Oval Time", "2026-09-30": "Full Metal Jacket (FMJ)",
                                "2026-10-01": "Half Dome"})
        self.assertEqual(s_first[13], date(2025, 3, 1))
        self.assertEqual(s_first[18], date(2026, 10, 2))  # tenure counts every F


if __name__ == "__main__":
    unittest.main()
