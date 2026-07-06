import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from who2q_compute import latest_names, never_qd_list, stale_q_list, build_payload, plausibility_error

CONFIG = {
    "region_org_id": 40342,
    "window_weeks": 16,
    "regular_threshold": 0.5,
    "stale_days": 60,
    "max_never_qd": 10,
    "excluded_aos": ["Moon Tower"],
    "excluded_pax": ["Ghosted"],
    "name_aliases": {"Ch3ap Trick": "Cheap Trick"},
}

def row(uid, name, ao, d):
    return {"user_id": uid, "f3_name": name, "ao_name": ao, "start_date": d}

TODAY = date(2026, 7, 6)


class TestLatestNames(unittest.TestCase):
    def test_most_recent_name_wins(self):
        rows = [
            row(1, "Old Handle", "A", date(2026, 1, 1)),
            row(1, "New Handle", "A", date(2026, 6, 1)),
        ]
        self.assertEqual(latest_names(rows, CONFIG)[1], "New Handle")

    def test_alias_applied(self):
        rows = [row(2, "Ch3ap Trick", "A", date(2026, 6, 1))]
        self.assertEqual(latest_names(rows, CONFIG)[2], "Cheap Trick")


class TestNeverQd(unittest.TestCase):
    def test_rate_uses_distinct_workout_dates_as_denominator(self):
        # 4 distinct workout dates; uid 1 attends 2 (50% -> in), uid 2 attends 1 (25% -> out)
        dates = [date(2026, 6, d) for d in (1, 8, 15, 22)]
        att = [row(1, "Half", "A", dates[0]), row(1, "Half", "A", dates[1]),
               row(2, "Rare", "A", dates[2])]
        # uid 3 attends all 4 so the denominator is 4
        att += [row(3, "Always", "A", d) for d in dates]
        names = latest_names(att, CONFIG)
        result = never_qd_list(att, set(), names, CONFIG)
        got = {p["name"]: p for p in result}
        self.assertIn("Half", got)
        self.assertNotIn("Rare", got)
        self.assertEqual(got["Half"]["rate"], 0.5)
        self.assertEqual(got["Half"]["attended"], 2)
        self.assertEqual(got["Always"]["last_attended"], "2026-06-22")

    def test_threshold_boundary_50_percent_is_regular(self):
        att = [row(1, "Edge", "A", date(2026, 6, 1)),
               row(2, "Anchor", "A", date(2026, 6, 1)), row(2, "Anchor", "A", date(2026, 6, 8))]
        names = latest_names(att, CONFIG)
        result = never_qd_list(att, set(), names, CONFIG)
        self.assertIn("Edge", [p["name"] for p in result])  # 1/2 = exactly 0.5

    def test_excludes_prior_qs_and_excluded_pax(self):
        att = [row(1, "HasQd", "A", date(2026, 6, 1)),
               row(2, "Ghosted", "A", date(2026, 6, 1)),
               row(3, "Clean", "A", date(2026, 6, 1))]
        names = latest_names(att, CONFIG)
        result = never_qd_list(att, {1}, names, CONFIG)
        self.assertEqual([p["name"] for p in result], ["Clean"])

    def test_caps_at_max_and_sorts_rate_then_recency_then_name(self):
        d1, d2 = date(2026, 6, 1), date(2026, 6, 8)
        att = []
        # 12 people all attend both workouts (rate 1.0) -> alphabetical tie-break, cap 10
        for uid in range(12):
            att += [row(uid, f"Pax{chr(65 + uid)}", "A", d1), row(uid, f"Pax{chr(65 + uid)}", "A", d2)]
        names = latest_names(att, CONFIG)
        result = never_qd_list(att, set(), names, CONFIG)
        self.assertEqual(len(result), 10)
        self.assertEqual(result[0]["name"], "PaxA")
        self.assertEqual(result[-1]["name"], "PaxJ")

    def test_recency_breaks_rate_ties(self):
        # Both attend 1 of 2 workouts (rate 0.5); Late attended more recently
        att = [row(1, "Early", "A", date(2026, 6, 1)),
               row(2, "Late", "A", date(2026, 6, 8))]
        names = latest_names(att, CONFIG)
        result = never_qd_list(att, set(), names, CONFIG)
        self.assertEqual([p["name"] for p in result], ["Late", "Early"])

    def test_empty_when_no_workouts(self):
        self.assertEqual(never_qd_list([], set(), {}, CONFIG), [])


class TestStaleQs(unittest.TestCase):
    def test_over_60_days_included_sorted_desc(self):
        q = [row(1, "VeryStale", "A", date(2026, 1, 1)),   # 186 days
             row(2, "Stale", "A", date(2026, 4, 1)),       # 96 days
             row(3, "Fresh", "A", date(2026, 6, 20))]      # 16 days
        names = latest_names(q, CONFIG)
        result = stale_q_list(q, [], names, TODAY, CONFIG)
        self.assertEqual([p["name"] for p in result], ["VeryStale", "Stale"])
        self.assertEqual(result[0]["days_since"], 186)
        self.assertEqual(result[0]["last_q"], "2026-01-01")

    def test_exactly_60_days_is_not_stale(self):
        q = [row(1, "OnTheLine", "A", TODAY.replace(month=5, day=7))]  # 2026-05-07 = 60 days
        names = latest_names(q, CONFIG)
        self.assertEqual(stale_q_list(q, [], names, TODAY, CONFIG), [])

    def test_uses_most_recent_q_per_person(self):
        q = [row(1, "Repeat", "A", date(2025, 1, 1)), row(1, "Repeat", "A", date(2026, 6, 30))]
        names = latest_names(q, CONFIG)
        self.assertEqual(stale_q_list(q, [], names, TODAY, CONFIG), [])

    def test_counts_window_attendance_distinct_dates(self):
        q = [row(1, "Comeback", "A", date(2026, 1, 1))]
        att = [row(1, "Comeback", "A", date(2026, 6, 1)),
               row(1, "Comeback", "A", date(2026, 6, 1)),   # duplicate date
               row(1, "Comeback", "A", date(2026, 6, 8))]
        names = latest_names(q + att, CONFIG)
        result = stale_q_list(q, att, names, TODAY, CONFIG)
        self.assertEqual(result[0]["attended_in_window"], 2)

    def test_excluded_pax_removed(self):
        q = [row(2, "Ghosted", "A", date(2026, 1, 1))]
        names = latest_names(q, CONFIG)
        self.assertEqual(stale_q_list(q, [], names, TODAY, CONFIG), [])


class TestBuildPayload(unittest.TestCase):
    def test_shape_ao_filtering_and_sorting(self):
        att = [row(1, "P1", "Zulu", date(2026, 6, 1)),
               row(2, "P2", "Alpha", date(2026, 6, 1)),
               row(3, "P3", "Moon Tower", date(2026, 6, 1))]  # excluded AO
        q = [row(9, "OldQ", "Alpha", date(2026, 1, 1))]        # Q'd, never attended in window
        payload = build_payload(q, att, TODAY, CONFIG)
        self.assertEqual(payload["generated_at"], "2026-07-06")
        self.assertEqual(payload["params"]["window_weeks"], 16)
        self.assertEqual([a["name"] for a in payload["aos"]], ["Alpha", "Zulu"])
        alpha = payload["aos"][0]
        self.assertEqual(alpha["workouts_in_window"], 1)
        self.assertEqual([p["name"] for p in alpha["never_qd"]], ["P2"])
        self.assertEqual([p["name"] for p in alpha["stale_qs"]], ["OldQ"])
        self.assertEqual(alpha["stale_qs"][0]["attended_in_window"], 0)


class TestPlausibilityError(unittest.TestCase):
    def test_ok_payload_returns_none(self):
        att = [row(uid, f"P{uid}", "A", date(2026, 6, 1)) for uid in range(60)]
        payload = {"aos": [{"name": "A"}]}
        self.assertIsNone(plausibility_error(payload, att))

    def test_too_few_attendance_rows(self):
        att = [row(1, "P1", "A", date(2026, 6, 1))]
        payload = {"aos": [{"name": "A"}]}
        self.assertIn("attendance rows", plausibility_error(payload, att))

    def test_no_aos(self):
        att = [row(uid, f"P{uid}", "A", date(2026, 6, 1)) for uid in range(60)]
        payload = {"aos": []}
        self.assertIn("no AOs", plausibility_error(payload, att))


if __name__ == "__main__":
    unittest.main()
