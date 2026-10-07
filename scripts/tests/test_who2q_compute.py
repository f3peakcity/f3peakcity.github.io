import json
import sys
import unittest
from datetime import date, timedelta
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


class TestShippedConfig(unittest.TestCase):
    """A typo'd alias value silently mints a bogus handle instead of no-op'ing."""

    def test_no_chained_or_self_aliases(self):
        aliases = json.loads(
            (Path(__file__).resolve().parent.parent / "who2q_config.json").read_text()
        )["name_aliases"]
        for key, value in aliases.items():
            self.assertNotEqual(key, value)
            self.assertNotIn(value, aliases, f"{key} -> {value} chains to another alias")


from who2q_compute import (RosterError, parse_roster, parse_roster_date, match_ao, match_roster,
                           site_qs_for_ao, candidates_for_ao, is_visiting_q)

ROSTER_HEADER = "DoW,AO,F3 Name,Start Date,End Date,Season,Note\n"
SITE_CONFIG = dict(
    CONFIG,
    window_weeks=12,
    candidate_window_weeks=26,
    candidate_attendance=0.5,
    candidate_min_qs=2,
    recent_site_q_months=12,
    visiting_q_windows=[{"from": "2026-02-23", "to": "2026-02-24"}],
    ao_aliases={"CougarTown": "Cougar Town"},
    name_aliases={"Ch3ap Trick": "Cheap Trick", "Chicken Little": "The Chicken Little"},
)


class TestRosterParsing(unittest.TestCase):
    def test_dates_keep_their_precision(self):
        self.assertEqual(parse_roster_date("5/5/2025"), ("2025-05-05", "day"))
        self.assertEqual(parse_roster_date("5/18/24"), ("2024-05-18", "day"))
        self.assertEqual(parse_roster_date("2025-10"), ("2025-10", "month"))
        self.assertEqual(parse_roster_date("2025"), ("2025", "year"))
        self.assertEqual(parse_roster_date(""), (None, None))

    def test_rows_current_season_and_suffix(self):
        terms = parse_roster(ROSTER_HEADER +
                             "Tue,CougarTown,Ramsay,6/4/2024,Not Yet,All,\n"
                             "Wed,7th Inning Stretch,Triple Lindy (summer),,,Summer,\n"
                             ",,,,,,\n"
                             "Fri,Board Meeting,Rooney,5/18/24,2025-09,All,\n")
        self.assertEqual(len(terms), 3, "blank rows are skipped")
        self.assertIsNone(terms[0]["end"], "'Not Yet' means current")
        self.assertEqual((terms[1]["name"], terms[1]["season"]), ("Triple Lindy", "summer"))
        self.assertEqual(terms[2]["end"], "2025-09")

    def test_malformed_roster_stops_the_export(self):
        with self.assertRaises(RosterError):
            parse_roster("AO,Name\nX,Y\n")                                   # missing columns
        with self.assertRaises(RosterError):
            parse_roster(ROSTER_HEADER + "Tue,Cougar Town,Ramsay,someday,,All,\n")
        with self.assertRaises(RosterError):
            parse_roster(ROSTER_HEADER + "Tue,Cougar Town,Ramsay,,,Spring,\n")


class TestRosterMatching(unittest.TestCase):
    AOS = ["Cougar Town", "Lion's Den", "Hot for Teacher"]

    def test_ao_spellings_resolve(self):
        self.assertEqual(match_ao("CougarTown", self.AOS, SITE_CONFIG), "Cougar Town")
        self.assertEqual(match_ao("Lion’s Den", self.AOS, SITE_CONFIG), "Lion's Den")
        self.assertEqual(match_ao("Hot For Teacher", self.AOS, SITE_CONFIG), "Hot for Teacher")
        self.assertIsNone(match_ao("F3 Dads", self.AOS, SITE_CONFIG))

    def test_names_resolve_through_aliases_and_two_accounts_both_match(self):
        names = {1: "Ramsay", 2: "The Chicken Little", 3: "Sputnik", 4: "Sputnik"}
        terms = parse_roster(ROSTER_HEADER +
                             "Tue,CougarTown,Ramsay,,,All,\n"
                             "Sat,Lion's Den,Chicken Little,,,All,\n"
                             "Wed,Lion's Den,Sputnik,,,All,\n"
                             "Wed,Lion's Den,Nobody,,,All,\n"
                             "Sat,F3 Dads,Ramsay,,,All,\n")
        matched, warnings = match_roster(terms, names, self.AOS, SITE_CONFIG)
        self.assertEqual(matched[1]["uids"], [2])
        self.assertEqual(matched[2]["uids"], [3, 4], "both of Sputnik's accounts")
        self.assertEqual(len(warnings), 2, "one unmatched name, one unmatched AO")


def terms_for(csv_body, names, aos):
    return match_roster(parse_roster(ROSTER_HEADER + csv_body), names, aos, SITE_CONFIG)[0]


class TestSiteQs(unittest.TestCase):
    def test_current_only_earliest_first_and_both_seasons_merge(self):
        names = {1: "Clockwork", 2: "Imp", 3: "Old Guard"}
        terms = terms_for("Wed,7th Inning Stretch,Clockwork,2024-01-10,,Winter,\n"
                          "Wed,7th Inning Stretch,Clockwork,2022-04-06,,Summer,\n"
                          "Wed,7th Inning Stretch,Imp,,,Winter,\n"
                          "Wed,7th Inning Stretch,Old Guard,2020,2023,All,\n",
                          names, ["7th Inning Stretch"])
        got = site_qs_for_ao("7th Inning Stretch", terms)
        self.assertEqual([(s["name"], s["start"], s["season"]) for s in got],
                         [("Clockwork", "2022-04-06", "all"), ("Imp", None, "winter")])


class TestCandidates(unittest.TestCase):
    WEEKS = [date(2026, 3, 2) + timedelta(weeks=i) for i in range(18)]   # 18 workouts at "A"

    def att(self, uid, name, n):
        return [row(uid, name, "A", d) for d in self.WEEKS[:n]]

    def run_rule(self, roster_body="", q_extra=()):
        names = {1: "Steady", 2: "Rare", 3: "Current SQ", 4: "Past SQ", 5: "Recent SQ", 6: "Anchor"}
        att = (self.att(1, "Steady", 12) + self.att(2, "Rare", 4) + self.att(3, "Current SQ", 12)
               + self.att(4, "Past SQ", 12) + self.att(5, "Recent SQ", 12) + self.att(6, "Anchor", 18))
        q = [row(u, names[u], "A", self.WEEKS[i]) for u in (1, 2, 3, 4, 5) for i in (0, 1)]
        q += [row(1, "Steady", "B", self.WEEKS[3])] + list(q_extra)
        terms = terms_for(roster_body, names, ["A", "B"])
        first = {1: date(2025, 8, 1)}
        return candidates_for_ao("A", att, q, names, terms, first, TODAY, SITE_CONFIG)

    def test_rule_order_and_fields(self):
        got = self.run_rule("Tue,A,Current SQ,,,All,\n"
                            "Tue,A,Past SQ,2023,2024-06,All,\n"
                            "Tue,A,Recent SQ,2024,2026-05,All,\n")
        self.assertEqual([c["name"] for c in got], ["Steady", "Past SQ", "Recent SQ"],
                         "Rare misses attendance, Anchor never Q'd, Current SQ is excluded; "
                         "past Site Qs follow, the recent one last")
        steady = got[0]
        self.assertEqual((steady["qs_here"], steady["q_aos"], steady["first_seen"]), (2, 2, "2025-08-01"))
        self.assertEqual(got[1]["past_site_q"], {"ao": "A", "end": "2024-06"})
        self.assertFalse(got[1]["recent_past"])
        self.assertTrue(got[2]["recent_past"])

    def test_takeover_qs_never_count(self):
        visit = row(6, "Anchor", "A", date(2026, 2, 23))   # 133 days before TODAY: would be overdue
        self.assertTrue(is_visiting_q(visit, SITE_CONFIG))
        payload = build_payload([visit, visit], self.att(6, "Anchor", 18), TODAY, SITE_CONFIG,
                                roster=[], first_seen={})
        self.assertEqual(payload["aos"][0]["stale_qs"], [], "a takeover Q is not 'last Q'd here'")


if __name__ == "__main__":
    unittest.main()
