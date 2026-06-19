#!/usr/bin/env python3
"""
generate_lead_briefs.py  —  LEX overnight AI desk (runs on the 5090).

Reads your hottest LEX leads from Supabase, uses a LOCAL Ollama model on the
5090 to write — for each — a tailored call opener, a 3-point "why call now",
and a ready-to-send email, then writes them back to the `lead_briefs` table.
Free (no API bills), private (tenant data never leaves the PC), and as rich as
you like because the compute is yours.

The LEX app reads `lead_briefs` and shows them next to each lead, so Rowan opens
the app in the morning to find every hot lead already pitched.

------------------------------------------------------------------------------
SETUP — create a file called `.env` in this folder (reuse the one from the
backfill job; it already points at LEX):

    SUPABASE_URL=https://lvfybixzumlmiqckbbtj.supabase.co
    SUPABASE_SERVICE_KEY=<LEX service_role key>      # full read/write, bypasses RLS
    OLLAMA_URL=http://localhost:11434                # default; change if remote
    OLLAMA_MODEL=qwen2.5:14b                          # whatever you've pulled

RUN:
    python generate_lead_briefs.py                    # top 25, writes to DB
    python generate_lead_briefs.py --limit 5 --dry-run   # preview, write nothing
    python generate_lead_briefs.py --limit 50            # bigger nightly batch

SCHEDULE (Windows): Task Scheduler -> nightly -> `python <path>\generate_lead_briefs.py`
------------------------------------------------------------------------------
"""
import os
import sys
import json
import argparse
from datetime import date, datetime, timezone

import requests

try:
    from supabase import create_client
except ImportError:
    sys.exit("Missing dependency. Run:  pip install supabase requests")


# ---------------------------------------------------------------- config / env
def load_env():
    """Load .env without python-dotenv. Searches this folder, the repo root,
    the current directory, and the backfill folder — so it finds the LEX
    credentials wherever they already live on the PC."""
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(here, ".env"),
        os.path.join(os.path.dirname(here), ".env"),   # repo root
        os.path.join(os.getcwd(), ".env"),
        os.path.expanduser(r"~/backfill-work/.env"),
    ]
    for path in candidates:
        if os.path.exists(path):
            for line in open(path, encoding="utf-8"):
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


load_env()
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434").rstrip("/")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:14b")

if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env (LEX project).")


# ---------------------------------------------------------------- scoring
# Don't pitch tenants we already act for.
SKIP_RELATIONSHIPS = {"client", "represented", "acting", "won", "tenant rep"}


def months_to(expiry):
    if not expiry:
        return None
    try:
        d = date.fromisoformat(str(expiry)[:10])
    except ValueError:
        return None
    t = date.today()
    return (d.year - t.year) * 12 + (d.month - t.month) + (d.day - t.day) / 30.0


def expiry_points(m):
    """Prospecting sweet spot is ~6-30 months out; holdovers (past) are hot too."""
    if m is None:
        return 0
    if m < 0:
        return 75          # holding over month-to-month = no security = call them
    if m <= 6:
        return 70
    if m <= 18:
        return 100
    if m <= 30:
        return 82
    if m <= 48:
        return 45
    return 20


def score_lead(lead, has_signal, vacancy_pct):
    pts = expiry_points(lead["months"])
    if lead.get("size"):
        pts += min(lead["size"] / 120.0, 30)      # bigger tenancy = bigger prize
    if has_signal:
        pts += 40                                   # an active trigger event
    if vacancy_pct and vacancy_pct >= 20:
        pts += 15                                   # tenant-favoured market = movable
    return round(pts, 1)


# ---------------------------------------------------------------- Ollama
SYSTEM = (
    "You are an elite Sydney commercial office leasing broker working a tenant-rep "
    "desk (Rowan's). You write sharp, warm, specific first-contact outreach that "
    "earns a reply. Australian English. No corporate fluff, no clichés, no emojis. "
    "Use ONLY the facts given — never invent numbers, names, or events."
)

INSTRUCTION = (
    "Write outreach for this lead and return ONLY a JSON object with exactly these keys:\n"
    '  "headline": one short line on why this lead is worth a call now (max 12 words)\n'
    '  "why_now": array of exactly 3 short bullet strings, each a concrete reason to call\n'
    '  "opener": a warm first-contact message under 55 words that references their '
    "specific situation and makes a soft ask for a quick call\n"
    '  "email_subject": under 8 words, specific, not salesy\n'
    '  "email_body": under 110 words, signed off "Rowan", ready to send\n\n'
    "Lead facts:\n"
)


def call_ollama(facts):
    payload = {
        "model": OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": INSTRUCTION + facts},
        ],
        "format": "json",
        "stream": False,
        "options": {"temperature": 0.7, "num_ctx": 4096},
    }
    r = requests.post(f"{OLLAMA_URL}/api/chat", json=payload, timeout=180)
    r.raise_for_status()
    content = r.json()["message"]["content"]
    data = json.loads(content)
    why = data.get("why_now") or []
    if isinstance(why, str):
        why = [why]
    return {
        "headline": (data.get("headline") or "").strip(),
        "why_now": "\n".join("• " + str(w).strip() for w in why[:3]),
        "opener": (data.get("opener") or "").strip(),
        "email_subject": (data.get("email_subject") or "").strip(),
        "email_body": (data.get("email_body") or "").strip(),
    }


# ---------------------------------------------------------------- build facts
def facts_for(lead, signal, vacancy_pct, market):
    t = lead["tenant"] or {}
    lines = [f"Tenant: {t.get('legal_name', 'the company')}"]
    if t.get("industry"):
        lines.append(f"Industry: {t['industry']}")
    if t.get("business_summary"):
        lines.append(f"About: {t['business_summary']}")
    lines.append(f"Building: {lead['building_name']}" + (f", {market}" if market else ""))
    if vacancy_pct:
        leverage = "tenant-favoured" if vacancy_pct >= 20 else "tight"
        lines.append(f"Market vacancy: {vacancy_pct:.1f}% ({leverage} — relevant to their options)")
    if lead.get("size"):
        lines.append(f"Current space: {int(lead['size'])} sqm")
    if lead.get("rent"):
        lines.append(f"Current rent: ${int(lead['rent']):,}/yr")
    m = lead["months"]
    if m is None:
        lines.append("Lease expiry: unknown")
    elif m < 0:
        lines.append("Lease status: holding over month-to-month (expired, no security)")
    else:
        lines.append(f"Lease expires: {lead['expiry']} (~{round(m)} months away)")
    if lead.get("has_option"):
        lines.append("They hold a renewal option — a decision point is coming.")
    if signal:
        lines.append(
            f"Trigger event: {signal.get('signal_type', '')} "
            f"({signal.get('direction', '')}) — {signal.get('headline', '')}"
        )
    return "\n".join(lines)


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=25, help="how many top leads to brief")
    ap.add_argument("--dry-run", action="store_true", help="print, write nothing")
    ap.add_argument("--model", help="override OLLAMA_MODEL")
    args = ap.parse_args()
    global OLLAMA_MODEL
    if args.model:
        OLLAMA_MODEL = args.model

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    print(f"LEX → {SUPABASE_URL}   model={OLLAMA_MODEL}   limit={args.limit}"
          f"{'  (dry-run)' if args.dry_run else ''}")

    # market vacancy lookup
    ms = sb.table("market_stats").select("market,vacancy_pct").execute().data or []
    vac = {r["market"]: r.get("vacancy_pct") for r in ms}

    # active signals by tenant
    sigs = sb.table("signals").select("*").execute().data or []
    sig_by_tenant = {}
    for s in sigs:
        if (s.get("status") or "active") == "active" and s.get("tenant_id"):
            sig_by_tenant.setdefault(s["tenant_id"], s)

    # leases with embedded building + tenant
    rows = (
        sb.table("leases")
        .select("id,tenant_id,size_sqm,rent_per_annum,expiry_date,has_renewal_option,"
                "levels,suite,building:buildings(name,street_address,market),"
                "tenant:tenants(id,legal_name,industry,business_summary,relationship)")
        .not_.is_("tenant_id", "null")
        .limit(5000)
        .execute()
        .data
        or []
    )

    # collapse to one hottest lease per tenant
    best = {}
    for r in rows:
        t = r.get("tenant") or {}
        rel = (t.get("relationship") or "").strip().lower()
        if rel in SKIP_RELATIONSHIPS:
            continue
        b = r.get("building") or {}
        market = b.get("market")
        lead = {
            "lease_id": r["id"],
            "tenant_id": r["tenant_id"],
            "tenant": t,
            "building_name": b.get("name") or b.get("street_address") or "(unnamed building)",
            "market": market,
            "size": r.get("size_sqm"),
            "rent": r.get("rent_per_annum"),
            "expiry": r.get("expiry_date"),
            "months": months_to(r.get("expiry_date")),
            "has_option": r.get("has_renewal_option"),
        }
        has_sig = r["tenant_id"] in sig_by_tenant
        lead["score"] = score_lead(lead, has_sig, vac.get(market))
        cur = best.get(r["tenant_id"])
        if cur is None or lead["score"] > cur["score"]:
            best[r["tenant_id"]] = lead

    leads = sorted(best.values(), key=lambda x: x["score"], reverse=True)[: args.limit]
    print(f"Scored {len(best)} tenants; briefing top {len(leads)}.\n")

    written = 0
    for i, lead in enumerate(leads, 1):
        sig = sig_by_tenant.get(lead["tenant_id"])
        name = (lead["tenant"] or {}).get("legal_name", "?")
        facts = facts_for(lead, sig, vac.get(lead["market"]), lead["market"])
        try:
            brief = call_ollama(facts)
        except Exception as e:
            print(f"[{i}/{len(leads)}] {name} — SKIP (model error: {e})")
            continue

        print(f"[{i}/{len(leads)}] {name}  (score {lead['score']})")
        print(f"    {brief['headline']}")
        print(f"    opener: {brief['opener'][:140]}")
        if args.dry_run:
            continue

        payload = {
            "tenant_id": lead["tenant_id"],
            "lease_id": lead["lease_id"],
            "signal_id": sig["id"] if sig else None,
            "score": lead["score"],
            "headline": brief["headline"],
            "why_now": brief["why_now"],
            "opener": brief["opener"],
            "email_subject": brief["email_subject"],
            "email_body": brief["email_body"],
            "market": lead["market"],
            "model": OLLAMA_MODEL,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            sb.table("lead_briefs").upsert(payload, on_conflict="tenant_id").execute()
            written += 1
        except Exception as e:
            print(f"        write failed: {e}")

    print(f"\nDone. {written} briefs written"
          f"{' (dry-run: 0)' if args.dry_run else ''}.")


if __name__ == "__main__":
    main()
