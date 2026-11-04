"""Merge the quarterly event files (data/<year>/events/*.json) -> data/<year>/plan.json.

Photos listed in data/<year>/excluded.json (id -> reason) are dropped from the events. Checks that
every other photo in index.json sits in exactly one event, and compares the events with the
recurring traditions of earlier years (data/albelli/context.json).
Usage: python tools/merge_events.py 2025
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


MONTHS = {"jan": 1, "feb": 2, "mrt": 3, "maa": 3, "apr": 4, "mei": 5, "jun": 6, "jul": 7, "aug": 8, "sep": 9, "okt": 10, "oct": 10, "nov": 11, "dec": 12}
DATES = re.compile(r"((?:\d{1,2}\s*(?:\u2013|-|en|tot|t/m|,)\s*)*\d{1,2})\s+(jan|feb|mrt|maa|apr|mei|jun|jul|aug|sep|okt|oct|nov|dec)[a-z]*\b", re.I)
PHOTO_IDS = re.compile(r"p(\d{3})(?:\s*[\u2013-]\s*p(\d{3}))?")


def question_photos(text, year, index, limit=8):
    """Photos a question is about: explicit ids (p012, p001-p010) or Dutch dates (12-13 april)."""
    ids = []
    for a, b in PHOTO_IDS.findall(text):
        ids += [f"p{n:03d}" for n in range(int(a), int(b or a) + 1)]
    dates = set()
    for days, month in DATES.findall(text):
        m = MONTHS[month[:3].lower()]
        parts = re.split(r"\s*(\u2013|-|tot|t/m)\s*", days)
        nums = [int(x) for x in re.findall(r"\d{1,2}", days)]
        if len(parts) == 3 and len(nums) == 2:  # a range like 12–13 or 26 tot 28
            nums = list(range(nums[0], nums[1] + 1))
        y = int(year) + (1 if m == 1 and "2026" in text else 0)
        dates |= {f"{y}-{m:02d}-{d:02d}" for d in nums if 1 <= d <= 31}
    on_dates = [p["id"] for p in index if p["date"] in dates]
    if len(on_dates) > limit:  # spread the picks over the matching photos
        step = len(on_dates) / limit
        on_dates = [on_dates[int(i * step)] for i in range(limit)]
    seen, out = set(), []
    for pid in ids[:limit] + on_dates:
        if pid not in seen and len(out) < limit:
            seen.add(pid)
            out.append(pid)
    return out


def apply_corrections(corr, events, quarters):
    """Apply corrections.json: new events, photo moves, merges and field updates (in that order)."""
    holder = quarters[0]["events"]
    for new in corr.get("new", []):
        if new["id"] not in events:
            holder.append(dict(new))
            events[new["id"]] = holder[-1]
    for mv in corr.get("move", []):
        for e in events.values():
            e["photoIds"] = [pid for pid in e["photoIds"] if pid not in mv["photos"]]
        events[mv["to"]]["photoIds"] += mv["photos"]
    for mg in corr.get("merge", []):
        src, dst = events[mg["from"]], events[mg["into"]]
        dst["photoIds"] += src["photoIds"]
        dst["heroCandidates"] = dst.get("heroCandidates", []) + src.get("heroCandidates", [])
        dst["suggestedSpreads"] = max(float(dst.get("suggestedSpreads") or 0), float(src.get("suggestedSpreads") or 0))
        src["photoIds"] = []
    for eid, fields in corr.get("update", {}).items():
        events[eid].update(fields)
    for e in events.values():
        e["photoIds"] = sorted(set(e["photoIds"]))


def main():
    year = sys.argv[1]
    out = ROOT / "data" / year
    index = json.loads((out / "index.json").read_text(encoding="utf-8"))
    quarters = [json.loads(p.read_text(encoding="utf-8")) for p in sorted((out / "events").glob("*.json"))]
    events_by_id = {e["id"]: e for q in quarters for e in q["events"]}
    corr_path = out / "corrections.json"
    if corr_path.exists():
        apply_corrections(json.loads(corr_path.read_text(encoding="utf-8")), events_by_id, quarters)
    excl_path = out / "excluded.json"
    excluded = json.loads(excl_path.read_text(encoding="utf-8")) if excl_path.exists() else {}
    events = [e for q in quarters for e in q["events"]]
    for e in events:
        e["photoIds"] = [pid for pid in e["photoIds"] if pid not in excluded]
        e["heroCandidates"] = [pid for pid in e.get("heroCandidates", []) if pid not in excluded]
    events = [e for e in events if e["photoIds"]]
    by_photo = {p["id"]: p for p in index}
    for e in events:  # dates follow the photos after corrections
        dates = sorted(by_photo[pid]["date"] for pid in e["photoIds"])
        e["start"], e["end"], e["photoDays"] = dates[0], dates[-1], len(set(dates))
        e["heroCandidates"] = [pid for pid in e["heroCandidates"] if pid in e["photoIds"]] or e["photoIds"][:1]
    events.sort(key=lambda e: (e["start"], e["end"]))
    themes = [t | {"quarter": q["quarter"]} for q in quarters for t in q.get("themes", [])]
    questions = [{"id": f'{q["quarter"]}-v{i:02d}', "quarter": q["quarter"], "question": x, "photoIds": question_photos(x, year, index)}
                 for q in quarters for i, x in enumerate(q.get("openQuestions", []), 1)]
    for q in questions:
        if not q["photoIds"]:  # no ids or dates: fall back to events whose title shares a word with the question
            words = {w.lower() for w in re.findall(r"[A-Za-z]{5,}", q["question"])}
            hits = [e for e in events if e["start"][5:7] and words & {w.lower() for w in re.findall(r"[A-Za-z]{5,}", e["title"])}]
            q["photoIds"] = [pid for e in hits for pid in (e.get("heroCandidates") or e["photoIds"])[:3]][:8]

    seen = Counter(pid for e in events for pid in e["photoIds"])
    ids = {p["id"] for p in index} - set(excluded)
    missing = sorted(ids - set(seen))
    double = sorted(pid for pid, n in seen.items() if n > 1)
    unknown = sorted(set(seen) - ids)

    ctx_path = ROOT / "data" / "albelli" / "context.json"
    traditions = []
    if ctx_path.exists():
        ctx = json.loads(ctx_path.read_text(encoding="utf-8"))
        names = {t["name"].replace(" (reis)", "") for t in ctx["traditions"] if t["yearsPresent"] >= 3}
        found = Counter(e.get("tradition") for e in events if e.get("tradition"))
        traditions = [{"name": n, "events": found.get(n, 0)} for n in sorted(names | set(found))]

    plan = {"year": year, "photos": len(ids), "excluded": excluded, "events": events, "themes": themes, "questions": questions,
            "traditions": traditions, "check": {"missing": missing, "double": double, "unknown": unknown}}
    (out / "plan.json").write_text(json.dumps(plan, ensure_ascii=False, indent=1), encoding="utf-8")
    spreads = sum(float(e.get("suggestedSpreads") or 0) for e in events)
    half1 = sum(float(e.get("suggestedSpreads") or 0) for e in events if e["start"].startswith(year) and e["start"][5:7] <= "06")
    print(f"{len(events)} events, {len(themes)} themes, {len(questions)} questions; spreads {spreads} (jan-jun {half1})")
    print("check:", {k: len(v) for k, v in plan["check"].items()}, missing[:10], double[:10])


if __name__ == "__main__":
    main()
