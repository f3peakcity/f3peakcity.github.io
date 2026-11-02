"""Upcoming Qs from the Q Sheet's day tabs (#223). No network: fixture CSV."""
import sys
import unittest
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import who2q_export
from who2q_compute import column_index, parse_q_tab, parse_sheet_date, upcoming_slots

# Shaped like the real Monday tab (gviz CSV, headers=0): header rows, then
# column B dates. Hells Bells' cell holds a line break, as typed in the sheet.
MONDAY = '''"","","2","3","4"
" ","","Beaver Chase","Hells Bells","Off The Rails"
"","","Beaver Creek Commons","Cornerstone Fellowship Church","Hunter Street Park"
"","","0530 - 0615","0530 - 0615","0530-615"
"","","Imp","Wahoo","Maestro "
"","","Jockey","Cousin IT","Sour Mash"
"","10/26/2026","Old","Old","Old"
"","11/2/2026","Earhart","Cheap Trick ","Steaks 🥩"
"","11/9/2026","","Hail Naw
3yr anniversary ","Jockey 🏇 "
"","11/16/2026","Thurston","Poi/QWERTY","Kanki"
"","11/23/2026","Two Factor","","Yahoo"
"","not a date","x","x","x"
'''
# Friday's header sits in row 1 only; Board Meeting is out of season.
FRIDAY = '''"","","Dante's Peak","Tin 2 Iron","Ruck this Way","Board Meeting"
"","1/2/2026","Egon","Soft Tail","","Closed"
"","11/6/2026","","Squeeze Bag","","See you
next year"
"","11/13/2026","Headgear","","","See you next year"
'''
COLS = {"C": "Beaver Chase", "D": "Hells Bells", "E": "Off The Rails"}


class TestParse(unittest.TestCase):
    def test_column_index(self):
        self.assertEqual([column_index(c) for c in ("A", "C", "z", "AA")], [0, 2, 25, 26])
        with self.assertRaises(ValueError):
            column_index("C1")

    def test_sheet_date(self):
        self.assertEqual(parse_sheet_date(" 11/2/2026 "), date(2026, 11, 2))
        self.assertIsNone(parse_sheet_date("2/30/2026"))
        self.assertIsNone(parse_sheet_date("Beaver Chase"))
        self.assertIsNone(parse_sheet_date(""))

    def test_tab(self):
        slots, problems = parse_q_tab(MONDAY, COLS)
        self.assertEqual(problems, [])
        self.assertEqual(slots["Hells Bells"][2], (date(2026, 11, 9), "Hail Naw 3yr anniversary"))
        self.assertEqual(slots["Beaver Chase"][2], (date(2026, 11, 9), ""))
        self.assertEqual(len(slots["Off The Rails"]), 5, "only rows with a date in column B")

    def test_shifted_column_is_skipped(self):
        slots, problems = parse_q_tab(MONDAY, {"C": "Hells Bells", "E": "Off the Rails"})
        self.assertEqual(list(slots), ["Off the Rails"], "header match ignores case")
        self.assertEqual(len(problems), 1)
        self.assertIn("column C", problems[0])

    def test_next_slots(self):
        slots, _ = parse_q_tab(MONDAY, COLS)
        got = upcoming_slots(slots["Beaver Chase"], date(2026, 11, 2), 3)
        self.assertEqual(got, [{"date": "2026-11-02", "q": "Earhart"},
                               {"date": "2026-11-09", "q": None},
                               {"date": "2026-11-16", "q": "Thurston"}])
        self.assertEqual(upcoming_slots(slots["Hells Bells"], date(2026, 11, 10), 3)[0]["q"], "Poi/QWERTY")
        self.assertEqual(upcoming_slots(slots["Beaver Chase"], date(2027, 1, 1), 3), [], "end of the sheet")

    def test_wrong_tab_is_refused(self):
        # An unknown gid gets the Week Summary tab: AO names up top, no dates in B.
        summary = '"","This Week (11/2/2026 - 11/7/2026)","",""\n"11/2/2026","Mon","Beaver Chase","Hells Bells"\n'
        slots, problems = parse_q_tab(summary, COLS)
        self.assertEqual(slots, {})
        self.assertIn("no dates in column B", problems[0])

    def test_closed_ao_has_no_slots(self):
        slots, problems = parse_q_tab(FRIDAY, {"C": "Dante's Peak", "D": "Tin 2 Iron", "F": "Board Meeting"})
        self.assertEqual(problems, [])
        self.assertEqual(upcoming_slots(slots["Board Meeting"], date(2026, 11, 2), 3), [])
        self.assertEqual([s["q"] for s in upcoming_slots(slots["Tin 2 Iron"], date(2026, 11, 2), 3)],
                         ["Squeeze Bag", None])


ET = ZoneInfo("America/New_York")
CONFIG = {
    "ao_aliases": {"Hells Bells": "Hell's Bells", "Tin 2 Iron": "Tin2Iron", "Board Meeting": "The Board Meeting"},
    "q_schedule": {
        "sheet_id": "SHEET", "slots": 2,
        "tabs": {"Monday": {"gid": 11, "columns": COLS},
                 "Friday": {"gid": 55, "columns": {"D": "Tin 2 Iron", "F": "Board Meeting"}}},
    },
}


def payload(*names):
    return {"params": {}, "aos": [{"name": n} for n in names]}


class TestExport(unittest.TestCase):
    def fetch(self, url):
        if url.endswith("gid=11"):
            return MONDAY
        if url.endswith("gid=55"):
            return FRIDAY
        raise AssertionError(url)

    def test_start_after_workouts(self):
        sched = CONFIG["q_schedule"]
        mon = date(2026, 11, 2)
        self.assertEqual(who2q_export.schedule_start(mon, sched, datetime(2026, 11, 2, 7, 59, tzinfo=ET)), mon)
        self.assertEqual(who2q_export.schedule_start(mon, sched, datetime(2026, 11, 2, 8, 0, tzinfo=ET)),
                         date(2026, 11, 3))
        self.assertEqual(who2q_export.schedule_start(mon, sched, datetime(2026, 11, 5, 9, tzinfo=ET)), mon,
                         "--today in the past: list from that day")

    def test_adds_slots_links_and_as_of(self):
        p = payload("Beaver Chase", "Hell's Bells", "Tin2Iron", "The Board Meeting", "Oval Time")
        warnings = []
        who2q_export.add_upcoming_qs(p, CONFIG, date(2026, 11, 2), warnings, fetch=self.fetch,
                                     now=datetime(2026, 11, 2, 9, tzinfo=ET))
        self.assertEqual(warnings, [])
        aos = {a["name"]: a for a in p["aos"]}
        # After 8 am Monday's workout is over: 3 slots (2 + 1 spare) from Nov 9.
        self.assertEqual([s["q"] for s in aos["Beaver Chase"]["upcoming_qs"]], [None, "Thurston", "Two Factor"])
        self.assertTrue(aos["Hell's Bells"]["q_sheet_url"].endswith("/SHEET/edit#gid=11"))
        self.assertTrue(aos["Tin2Iron"]["q_sheet_url"].endswith("#gid=55"))
        self.assertEqual(aos["The Board Meeting"]["upcoming_qs"], [])
        self.assertNotIn("upcoming_qs", aos["Oval Time"], "not on the Q Sheet")
        self.assertEqual(p["params"]["q_slots"], 2)
        self.assertIn("upcoming_qs_as_of", p)

    def test_unreadable_tab_warns_and_carries_on(self):
        def fetch(url):
            if url.endswith("gid=55"):
                raise OSError("HTTP Error 404")
            return MONDAY
        p = payload("Beaver Chase", "Tin2Iron")
        warnings = []
        who2q_export.add_upcoming_qs(p, CONFIG, date(2026, 11, 2), warnings, fetch=fetch,
                                     now=datetime(2026, 11, 2, 6, tzinfo=ET))
        self.assertEqual(len(warnings), 1)
        self.assertIn("Friday", warnings[0])
        self.assertEqual(p["aos"][0]["upcoming_qs"][0], {"date": "2026-11-02", "q": "Earhart"})
        self.assertNotIn("upcoming_qs", p["aos"][1])

    def test_nothing_readable_leaves_payload_alone(self):
        def fetch(url):
            raise OSError("offline")
        p = payload("Beaver Chase")
        warnings = []
        who2q_export.add_upcoming_qs(p, CONFIG, date(2026, 11, 2), warnings, fetch=fetch)
        self.assertEqual(len(warnings), 2)
        self.assertEqual(p, payload("Beaver Chase"))


if __name__ == "__main__":
    unittest.main()
