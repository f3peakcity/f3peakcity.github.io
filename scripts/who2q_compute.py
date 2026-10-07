"""Pure computation for the Who-to-Q lists.

No BigQuery imports here — everything is testable with fixture rows.
Row shape: {"user_id": <hashable>, "f3_name": str, "ao_name": str,
            "start_date": datetime.date}

Logic decisions (see docs/superpowers/plans/2026-07-06-who-to-q-dashboard.md):
- Rate denominator = distinct workout dates at the AO in the window that
  have at least one recorded attendee.
- "Ever Q'd" = any q_ind=1 row in all available history for that AO.
- List 1 sort: rate desc, then last attendance desc, then name asc; cap max_never_qd.
- List 2 sort: days since last Q desc, then name asc; no cap; stale means
  days_since > stale_days (exactly stale_days is NOT stale).
"""
import csv
import io
import re
from collections import defaultdict
from datetime import date, timedelta


def canonical_name(f3_name, config):
    return config.get("name_aliases", {}).get(f3_name, f3_name)


def latest_names(rows, config):
    """Map user_id -> alias-resolved f3_name from that user's most recent row."""
    best = {}
    for r in rows:
        cur = best.get(r["user_id"])
        if cur is None or r["start_date"] > cur[0]:
            best[r["user_id"]] = (r["start_date"], canonical_name(r["f3_name"], config))
    return {uid: name for uid, (_, name) in best.items()}


def never_qd_list(att_rows, q_user_ids, names, config):
    """Regular attendees (rate >= threshold) of one AO who never Q'd it.

    att_rows: window attendance rows for a single AO.
    q_user_ids: user_ids with any all-time Q at this AO.
    """
    excluded = set(config.get("excluded_pax", []))
    workout_dates = {r["start_date"] for r in att_rows}
    denom = len(workout_dates)
    if denom == 0:
        return []
    dates_by_user = defaultdict(set)
    for r in att_rows:
        dates_by_user[r["user_id"]].add(r["start_date"])

    candidates = []
    for uid, dates in dates_by_user.items():
        if uid in q_user_ids:
            continue
        name = names[uid]
        if name in excluded:
            continue
        rate = len(dates) / denom
        if rate < config["regular_threshold"]:
            continue
        candidates.append({
            "name": name,
            "attended": len(dates),
            "rate": round(rate, 3),
            "_last": max(dates),
        })
    candidates.sort(key=lambda p: (-p["rate"], -p["_last"].toordinal(), p["name"]))
    return [
        {"name": p["name"], "attended": p["attended"], "rate": p["rate"],
         "last_attended": p["_last"].isoformat()}
        for p in candidates[: config["max_never_qd"]]
    ]


def stale_q_list(q_rows, att_rows, names, today, config):
    """People who Q'd this AO but not within stale_days.

    q_rows: all-time Q rows for a single AO.
    att_rows: window attendance rows for the same AO (context column).
    """
    excluded = set(config.get("excluded_pax", []))
    last_q = {}
    for r in q_rows:
        if r["user_id"] not in last_q or r["start_date"] > last_q[r["user_id"]]:
            last_q[r["user_id"]] = r["start_date"]
    window_dates = defaultdict(set)
    for r in att_rows:
        window_dates[r["user_id"]].add(r["start_date"])

    out = []
    for uid, lq in last_q.items():
        days = (today - lq).days
        if days <= config["stale_days"]:
            continue
        name = names[uid]
        if name in excluded:
            continue
        out.append({
            "name": name,
            "last_q": lq.isoformat(),
            "days_since": days,
            "attended_in_window": len(window_dates.get(uid, ())),
        })
    out.sort(key=lambda p: (-p["days_since"], p["name"]))
    return out


def build_payload(q_rows, att_rows, today, config, roster=None, first_seen=None, warnings=None):
    """Assemble the full JSON payload for all AOs.

    q_rows: all-time Q rows, region-wide.
    att_rows: attendance rows, region-wide, covering at least the longer of
        window_weeks and candidate_window_weeks; each list filters its own window.
    roster: parsed Site Q terms (parse_roster), or None to skip Site Qs and candidates.
    first_seen: user_id -> date of first attendance on record (time in F3).
    warnings: a list that roster-matching problems are appended to.
    """
    excluded_aos = set(config.get("excluded_aos", []))
    # Takeover Qs are not Peak City leadership: never "ever Q'd", never overdue.
    q_rows = [r for r in q_rows if not is_visiting_q(r, config)]
    names = latest_names(list(q_rows) + list(att_rows), config)

    window_start = today - timedelta(weeks=config["window_weeks"])
    att_by_ao = defaultdict(list)
    for r in att_rows:
        if r["start_date"] >= window_start:
            att_by_ao[r["ao_name"]].append(r)
    q_by_ao = defaultdict(list)
    for r in q_rows:
        q_by_ao[r["ao_name"]].append(r)
    ao_names = [a for a in sorted(att_by_ao, key=str.lower) if a not in excluded_aos]

    terms = []
    if roster is not None:
        terms, problems = match_roster(roster, names, ao_names, config)
        if warnings is not None:
            warnings.extend(problems)
        cand_start = today - timedelta(weeks=config["candidate_window_weeks"])
        cand_att_by_ao = defaultdict(list)
        for r in att_rows:
            if r["start_date"] >= cand_start:
                cand_att_by_ao[r["ao_name"]].append(r)
        cand_q = [r for r in q_rows if r["start_date"] >= cand_start]

    aos = []
    for ao_name in ao_names:
        ao_att = att_by_ao[ao_name]
        ao_q = q_by_ao.get(ao_name, [])
        q_uids = {r["user_id"] for r in ao_q}
        ao = {
            "name": ao_name,
            "workouts_in_window": len({r["start_date"] for r in ao_att}),
            "never_qd": never_qd_list(ao_att, q_uids, names, config),
            "stale_qs": stale_q_list(ao_q, ao_att, names, today, config),
        }
        if roster is not None:
            ao["site_qs"] = site_qs_for_ao(ao_name, terms)
            ao["candidates"] = candidates_for_ao(ao_name, cand_att_by_ao[ao_name], cand_q, names,
                                                 terms, first_seen or {}, today, config)
        aos.append(ao)

    params = {
        "window_weeks": config["window_weeks"],
        "regular_threshold": config["regular_threshold"],
        "stale_days": config["stale_days"],
        "max_never_qd": config["max_never_qd"],
    }
    if roster is not None:
        params.update({k: config[k] for k in ("candidate_window_weeks", "candidate_attendance",
                                              "candidate_min_qs", "recent_site_q_months")})
    return {"generated_at": today.isoformat(), "params": params, "aos": aos}


def plausibility_error(payload, att_rows, min_att_rows=50):
    """Return an error string if the export result is implausibly small, else None.

    Guards the committed artifact against a "successful but empty" BigQuery
    run (revoked access, schema drift) silently replacing good data.
    """
    if len(att_rows) < min_att_rows:
        return ("implausibly few attendance rows ({} < {})"
                .format(len(att_rows), min_att_rows) + " — refusing to overwrite artifact")
    if not payload.get("aos"):
        return "payload contains no AOs — refusing to overwrite artifact"
    return None


# ---------------------------------------------------------------------------
# Site Q roster and candidates (spec: Who to Q: Site Q Candidates; #181)
# ---------------------------------------------------------------------------

ROSTER_COLUMNS = ("AO", "F3 Name", "Start Date", "End Date", "Season")
CURRENT_END_WORDS = {"", "not yet", "current", "-", "n/a"}
SEASONS = {"all": "all", "all year": "all", "summer": "summer", "winter": "winter"}
# "Triple Lindy (summer)": the season is already in its own column.
_SEASON_SUFFIX = re.compile(r"\s*\((summer|winter)\)\s*$", re.IGNORECASE)


class RosterError(ValueError):
    """The Site Q roster can't be read; the export stops rather than guess."""


def normalize(text):
    """Curly apostrophes and stray spaces differ between the sheet and BigQuery."""
    return (text or "").replace("\u2019", "'").replace("\u2018", "'").strip()


def parse_roster_date(text):
    """'5/5/2025', '5/18/24', '2025-05-05', '2025-05' or '2025' -> (iso, precision).

    precision is 'day', 'month' or 'year'; blank -> (None, None).
    iso keeps only the known part ('2025', '2025-05') so nothing is invented.
    """
    t = normalize(text)
    if not t:
        return None, None
    m = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{2}|\d{4})", t)
    if m:
        mo, dy, yr = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if yr < 100:
            yr += 2000
        return date(yr, mo, dy).isoformat(), "day"
    m = re.fullmatch(r"(\d{4})-(\d{1,2})-(\d{1,2})", t)
    if m:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3))).isoformat(), "day"
    m = re.fullmatch(r"(\d{4})-(\d{1,2})", t)
    if m:
        return "{}-{:02d}".format(int(m.group(1)), int(m.group(2))), "month"
    if re.fullmatch(r"\d{4}", t):
        return t, "year"
    raise ValueError("unreadable date {!r}".format(text))


def parse_roster(csv_text):
    """Roster CSV -> list of terms. Raises RosterError on any malformed row."""
    reader = csv.DictReader(io.StringIO(csv_text))
    missing = [c for c in ROSTER_COLUMNS if c not in (reader.fieldnames or [])]
    if missing:
        raise RosterError("roster is missing column(s): " + ", ".join(missing))
    terms = []
    for line, row in enumerate(reader, start=2):
        ao = normalize(row.get("AO"))
        name = _SEASON_SUFFIX.sub("", normalize(row.get("F3 Name")))
        if not ao and not name:
            continue
        if not ao or not name:
            raise RosterError("row {}: needs both an AO and an F3 Name".format(line))
        season = SEASONS.get(normalize(row.get("Season")).lower() or "all")
        if season is None:
            raise RosterError("row {}: Season must be All, Summer or Winter, not {!r}"
                              .format(line, row.get("Season")))
        try:
            start, start_precision = parse_roster_date(row.get("Start Date"))
            end_text = normalize(row.get("End Date"))
            end = None if end_text.lower() in CURRENT_END_WORDS else parse_roster_date(end_text)[0]
        except ValueError as exc:
            raise RosterError("row {}: {}".format(line, exc))
        terms.append({"ao": ao, "name": name, "start": start, "start_precision": start_precision,
                      "end": end, "season": season})
    return terms


def is_visiting_q(row, config):
    """A Q inside a takeover window: another region's man leading our workout.

    Real attendance, but not Peak City leadership (same rule as
    F3_VISITING_Q_WINDOWS in static/stats/assets/js/data.js).
    """
    d = row["start_date"].isoformat()
    return any(w["from"] <= d <= w["to"] for w in config.get("visiting_q_windows", []))


def match_ao(roster_ao, ao_names, config):
    """Roster AO spelling -> the AO name Who to Q uses, or None.

    Order: the sheet's own alias (ao_aliases), then exact, then case-insensitive.
    """
    aliases = {normalize(k): v for k, v in config.get("ao_aliases", {}).items()}
    wanted = aliases.get(normalize(roster_ao), normalize(roster_ao))
    by_lower = {normalize(a).lower(): a for a in ao_names}
    return by_lower.get(wanted.lower())


def _period_end(iso):
    """Last day of a roster date at its precision ('2025' -> 2025-12-31)."""
    parts = [int(p) for p in iso.split("-")]
    if len(parts) == 3:
        return date(*parts)
    if len(parts) == 2:
        nxt = date(parts[0] + parts[1] // 12, parts[1] % 12 + 1, 1)
        return nxt - timedelta(days=1)
    return date(parts[0], 12, 31)


def match_roster(terms, names, ao_names, config):
    """Attach BigQuery user ids and the Who-to-Q AO name to each roster term.

    names: user_id -> canonical name (latest_names). A name can map to several
    user ids when one man has two accounts merged by name_aliases (Sputnik);
    the term then covers all of them. Returns (terms, warnings); a term that
    matches no person or no AO is kept and reported once.
    """
    by_name = defaultdict(set)
    for uid, name in names.items():
        by_name[normalize(name).lower()].add(uid)
    aliases = {normalize(k): v for k, v in config.get("name_aliases", {}).items()}
    out, warnings = [], []
    for t in terms:
        canonical = aliases.get(t["name"], t["name"])
        uids = sorted(by_name.get(normalize(canonical).lower(), set()), key=str)
        if not uids:
            warnings.append("roster name {!r} ({}) matches no one in BigQuery; add a name_aliases entry"
                            .format(t["name"], t["ao"]))
        ao_name = match_ao(t["ao"], ao_names, config)
        if ao_name is None:
            warnings.append("roster AO {!r} is not an AO on Who to Q; add an ao_aliases entry if it should be"
                            .format(t["ao"]))
        display = names[uids[0]] if uids else canonical
        out.append(dict(t, uids=uids, ao_name=ao_name, display=display))
    return out, list(dict.fromkeys(warnings))


def site_qs_for_ao(ao_name, terms):
    """Current Site Qs of one AO, earliest start first (unknown starts last).

    A man listed for both seasons (Clockwork at 7th Inning Stretch) is one Site Q
    all year: one entry, his earliest start, season 'all'.
    """
    merged = {}
    for t in terms:
        if t["ao_name"] != ao_name or t["end"] is not None:
            continue
        cur = merged.get(t["display"])
        if cur is None:
            merged[t["display"]] = {"name": t["display"], "start": t["start"],
                                    "start_precision": t["start_precision"], "season": t["season"]}
            continue
        if cur["season"] != t["season"]:
            cur["season"] = "all"
        if t["start"] and (cur["start"] is None or t["start"] < cur["start"]):
            cur["start"], cur["start_precision"] = t["start"], t["start_precision"]
    return sorted(merged.values(), key=lambda s: (s["start"] is None, s["start"] or "", s["name"].lower()))


def candidates_for_ao(ao_name, att_rows, q_rows, names, terms, first_seen, today, config):
    """Site Q candidates for one AO.

    att_rows: candidate-window attendance for this AO.
    q_rows: candidate-window Q rows, region-wide, takeover Qs already removed.
    Rule: >= candidate_attendance of the AO's workouts AND >= candidate_min_qs Qs
    here AND not a current Site Q anywhere. Past Site Qs follow everyone else,
    those whose term ended within recent_site_q_months last; alphabetical within.
    """
    workout_dates = {r["start_date"] for r in att_rows}
    if not workout_dates:
        return []
    excluded = set(config.get("excluded_pax", []))
    excluded_aos = set(config.get("excluded_aos", []))
    current_uids = {uid for t in terms if t["end"] is None for uid in t["uids"]}

    last_end = {}
    for t in terms:
        if t["end"] is None:
            continue
        for uid in t["uids"]:
            if uid not in last_end or t["end"] > last_end[uid]["end"]:
                last_end[uid] = {"ao": t["ao_name"] or t["ao"], "end": t["end"]}
    recent_cutoff = today - timedelta(days=round(config["recent_site_q_months"] * 30.44))

    dates_by_user = defaultdict(set)
    for r in att_rows:
        dates_by_user[r["user_id"]].add(r["start_date"])
    qs_here, q_aos = defaultdict(int), defaultdict(set)
    for r in q_rows:
        if r["ao_name"] in excluded_aos:
            continue
        q_aos[r["user_id"]].add(r["ao_name"])
        if r["ao_name"] == ao_name:
            qs_here[r["user_id"]] += 1

    out = []
    for uid, dates in dates_by_user.items():
        rate = len(dates) / len(workout_dates)
        name = names[uid]
        if (rate < config["candidate_attendance"] or qs_here[uid] < config["candidate_min_qs"]
                or uid in current_uids or name in excluded):
            continue
        past = last_end.get(uid)
        recent = bool(past) and _period_end(past["end"]) >= recent_cutoff
        out.append({
            "name": name,
            "attended": len(dates),
            "rate": round(rate, 3),
            "qs_here": qs_here[uid],
            "q_aos": len(q_aos[uid]),
            "first_seen": first_seen[uid].isoformat() if uid in first_seen else None,
            "past_site_q": past,
            "recent_past": recent,
        })
    out.sort(key=lambda c: (2 if c["recent_past"] else 1 if c["past_site_q"] else 0, c["name"].lower()))
    return out
