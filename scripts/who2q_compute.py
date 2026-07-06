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
from collections import defaultdict


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


def build_payload(q_rows, att_rows, today, config):
    """Assemble the full JSON payload for all AOs.

    q_rows: all-time Q rows, region-wide.
    att_rows: window attendance rows, region-wide.
    """
    excluded_aos = set(config.get("excluded_aos", []))
    names = latest_names(list(q_rows) + list(att_rows), config)

    att_by_ao = defaultdict(list)
    for r in att_rows:
        att_by_ao[r["ao_name"]].append(r)
    q_by_ao = defaultdict(list)
    for r in q_rows:
        q_by_ao[r["ao_name"]].append(r)

    aos = []
    for ao_name in sorted(att_by_ao, key=str.lower):
        if ao_name in excluded_aos:
            continue
        ao_att = att_by_ao[ao_name]
        ao_q = q_by_ao.get(ao_name, [])
        q_uids = {r["user_id"] for r in ao_q}
        aos.append({
            "name": ao_name,
            "workouts_in_window": len({r["start_date"] for r in ao_att}),
            "never_qd": never_qd_list(ao_att, q_uids, names, config),
            "stale_qs": stale_q_list(ao_q, ao_att, names, today, config),
        })

    return {
        "generated_at": today.isoformat(),
        "params": {
            "window_weeks": config["window_weeks"],
            "regular_threshold": config["regular_threshold"],
            "stale_days": config["stale_days"],
            "max_never_qd": config["max_never_qd"],
        },
        "aos": aos,
    }


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
