#!/usr/bin/env python3
r"""
refresh_investigate_today.py — nightly refill of the dashboard "investigate today"
panel (the verified_* fields), run on the 5090.

Picks the best ACTIVE occupiers — ranked by decision window (size-based lead time),
portfolio shape, niche, signals and market leverage — skipping anything dismissed
(Competitor / Lost / Client / moved / done / occupier_status dismissed). Writes a
short "why now" line with the local Ollama model. Clears yesterday's picks so the
panel rotates.

NOTE: this is AI *selection*, not live news verification (the 5090 has no web).
Run:  python scripts\refresh_investigate_today.py            # top 6, writes
      python scripts\refresh_investigate_today.py --limit 8 --dry-run
"""
import os
import sys
import json
import argparse
from collections import defaultdict
from datetime import date

import requests
try:
    from supabase import create_client
except ImportError:
    sys.exit("Run:  pip install supabase requests")

URL_DEFAULT = "https://lvfybixzumlmiqckbbtj.supabase.co"


def load_env():
    here = os.path.dirname(os.path.abspath(__file__))
    for p in [os.path.join(os.getcwd(), ".env"), os.path.join(here, ".env"),
              os.path.join(os.path.dirname(here), ".env"), os.path.expanduser("~/.env"),
              os.path.expanduser("~/backfill-work/.env")]:
        if os.path.exists(p):
            for line in open(p, encoding="utf-8"):
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())


load_env()
URL = os.environ.get("SUPABASE_URL", URL_DEFAULT)
KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY")
OLLAMA = os.environ.get("OLLAMA_URL", "http://localhost:11434").rstrip("/")
MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:14b")
if not KEY:
    sys.exit("Set SUPABASE_SERVICE_KEY in .env (LEX project).")

DISMISSED = {"Already Represented", "Already Renewed", "Already Relocated",
             "Not a Fit", "Do Not Contact", "Lost Opportunity"}
SKIP_REL = {"Competitor", "Lost", "Client"}
OPERATORS = ("wework", "servcorp", "regus", "iwg", "hub australia", "executive centre",
             "justco", "christie spaces", "compass offices", "the great room", "spaces")


def lead_time(area):
    if area >= 5000:
        return 48, 24
    if area >= 1000:
        return 24, 12
    return 9, 3


def months_to(expiry, today):
    try:
        d = date.fromisoformat(str(expiry)[:10])
    except (ValueError, TypeError):
        return None
    return (d.year - today.year) * 12 + (d.month - today.month) + (d.day - today.day) / 30.0


def page_all(sb, table, select, flt=None):
    rows, start, step = [], 0, 1000
    while True:
        q = sb.table(table).select(select)
        if flt:
            q = flt(q)
        d = q.range(start, start + step - 1).execute().data or []
        rows += d
        if len(d) < step:
            return rows
        start += step


def ollama_line(facts):
    try:
        r = requests.post(f"{OLLAMA}/api/chat", json={
            "model": MODEL,
            "messages": [
                {"role": "system", "content": "You are a Sydney commercial office tenant-rep broker. Write ONE sharp line (max 18 words) on why to call this occupier now. No fluff, no greeting, Australian English. Use only the facts given."},
                {"role": "user", "content": facts},
            ],
            "stream": False, "options": {"temperature": 0.6, "num_ctx": 2048},
        }, timeout=120)
        r.raise_for_status()
        return r.json()["message"]["content"].strip().strip('"')[:180]
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=6)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    sb = create_client(URL, KEY)
    today = date.today()
    print(f"LEX -> {URL}   model={MODEL}   {'(dry-run)' if a.dry_run else ''}")

    vac = {r["market"]: r.get("vacancy_pct") for r in (sb.table("market_stats").select("market,vacancy_pct").execute().data or [])}
    sig = {}
    for s in (sb.table("signals").select("tenant_id,direction,status,headline").execute().data or []):
        if (s.get("status") or "active") == "active" and s.get("tenant_id"):
            sig.setdefault(s["tenant_id"], s)

    leases = page_all(sb, "leases",
                      "tenant_id,size_sqm,expiry_date,building:buildings(name,market),"
                      "tenant:tenants(id,legal_name,relationship,prospect_status,occupier_status,niche_category)",
                      lambda q: q.not_.is_("tenant_id", "null"))
    print(f"Loaded {len(leases)} leases.")

    occ = {}
    for x in leases:
        t = x.get("tenant") or {}
        rel = t.get("relationship")
        if rel in SKIP_REL or t.get("prospect_status") in ("moved", "done") or t.get("occupier_status") in DISMISSED:
            continue
        name = t.get("legal_name") or ""
        if any(op in name.lower() for op in OPERATORS):
            continue
        b = x.get("building") or {}
        o = occ.get(t["id"]) or occ.setdefault(t["id"], {
            "id": t["id"], "name": name, "t": t, "area": 0, "markets": set(), "next": None, "next_b": None})
        o["area"] += float(x.get("size_sqm") or 0)
        if b.get("market"):
            o["markets"].add(b["market"])
        m = months_to(x.get("expiry_date"), today)
        if m is not None and m >= 0 and (o["next"] is None or m < o["next"]):
            o["next"] = m
            o["next_b"] = b.get("name")
            o["next_exp"] = x.get("expiry_date")
            o["next_market"] = b.get("market")

    scored = []
    for o in occ.values():
        m = o["next"]
        if m is None:
            continue
        early, late = lead_time(o["area"])
        phase = "deciding" if m <= late else "live" if m <= early else "watching"
        big = o["area"] >= 3000
        rep_risk = big and phase in ("deciding", "live")
        s = 100 if phase == "deciding" else 70 if phase == "live" else 25
        if len(o["markets"]) >= 2:
            s += 30
        if o["t"].get("niche_category"):
            s += 12
        if o["id"] in sig:
            s += 40
        v = vac.get(o.get("next_market"))
        if v and float(v) >= 20:
            s += 15
        s += min(o["area"] / 400, 20)
        if rep_risk:
            s -= 55
        o["score"], o["phase"], o["rep_risk"] = round(s), phase, rep_risk
        scored.append(o)

    scored.sort(key=lambda o: o["score"], reverse=True)
    top = scored[: a.limit]
    print(f"Scored {len(scored)} active occupiers; picking top {len(top)}.\n")

    for o in top:
        facts = (f"Occupier: {o['name']}\nFootprint: {int(o['area'])} sqm across {len(o['markets'])} market(s) "
                 f"({', '.join(sorted(o['markets']))})\nNext expiry: {o.get('next_exp')} (~{round(o['next'])} months) "
                 f"at {o['next_b']}\nMarket vacancy: {vac.get(o.get('next_market')) or 'n/a'}")
        if o["id"] in sig:
            facts += f"\nSignal: {sig[o['id']].get('headline')}"
        if len(o["markets"]) >= 2:
            facts += "\nMulti-market — possible consolidation play."
        note = ollama_line(facts) or f"{int(o['area'])} sqm, next lease ~{round(o['next'])} mo at {o['next_b']} — decision window open."
        o["note"] = note
        print(f"  [{o['score']}] {o['name']} — {note}")

    if a.dry_run:
        print("\ndry-run: nothing written.")
        return

    sb.table("tenants").update({"verified_at": None, "verified_note": None}).not_.is_("verified_at", "null").execute()
    for o in top:
        sb.table("tenants").update({"verified_at": today.isoformat(), "verified_note": o["note"]}).eq("id", o["id"]).execute()
    print(f"\nDone. Refreshed 'investigate today' with {len(top)} occupiers for {today.isoformat()}.")


if __name__ == "__main__":
    main()
