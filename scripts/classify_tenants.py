#!/usr/bin/env python3
r"""
classify_tenants.py — AI-classify every LEX tenant into Rowan's verticals (5090).

Reads all tenants, asks the local Ollama model to bucket each into
Tech/AI/Fintech, Finance/Trading/PE, Health Tech, Media/Advertising, or Other,
then writes niche_category back. The model knows real companies (e.g. Susquehanna
= market maker, Optiver = trading) so it catches the abstract-named firms that
keyword matching misses. Lead Finder's "My verticals" filter reads this column.

Uses the LEX .env (same one generate_lead_briefs.py uses).

RUN:
    python scripts\classify_tenants.py --limit 60 --dry-run   # preview, write nothing
    python scripts\classify_tenants.py                        # classify all, write back
"""
import os
import sys
import json
import argparse
from collections import defaultdict

import requests
try:
    from supabase import create_client
except ImportError:
    sys.exit("Run:  pip install supabase requests")

SUPABASE_URL_DEFAULT = "https://lvfybixzumlmiqckbbtj.supabase.co"


def load_env():
    here = os.path.dirname(os.path.abspath(__file__))
    for p in [os.path.join(os.getcwd(), ".env"), os.path.join(here, ".env"),
              os.path.join(os.path.dirname(here), ".env"),
              os.path.expanduser("~/.env"), os.path.expanduser("~/backfill-work/.env")]:
        if os.path.exists(p):
            for line in open(p, encoding="utf-8"):
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())


load_env()
URL = os.environ.get("SUPABASE_URL", SUPABASE_URL_DEFAULT)
KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY")
OLLAMA = os.environ.get("OLLAMA_URL", "http://localhost:11434").rstrip("/")
MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:14b")
if not KEY:
    sys.exit("Set SUPABASE_SERVICE_KEY in .env (LEX project).")

CODE = {"TECH": "Tech / AI / Fintech", "FINANCE": "Finance / Trading / PE",
        "HEALTH": "Health Tech", "MEDIA": "Media / Advertising", "OTHER": None}

SYSTEM = ("You classify Australian office tenants into verticals for a commercial real estate "
          "tenant-rep broker. Use real knowledge of each company; if unknown, infer from the "
          "name; if still unclear, answer OTHER. Be decisive.")


def classify_batch(names):
    listing = "\n".join(f"{i + 1}. {n}" for i, n in enumerate(names))
    instr = (
        "Classify each company into EXACTLY one code:\n"
        "TECH = technology, software, AI, data, SaaS, fintech, cyber, IT\n"
        "FINANCE = financial services, banks, trading firms, market makers, brokers, asset "
        "managers, funds, ETF, FX, private equity, wealth, advisory\n"
        "HEALTH = health tech, biotech, pharma, medical, diagnostics\n"
        "MEDIA = media, advertising, marketing, creative, PR, content, publishing\n"
        "OTHER = anything else (law, government, retail, construction, hospitality, etc.)\n\n"
        'Return ONLY a JSON object mapping each number to its code, e.g. {"1":"FINANCE","2":"OTHER"}.\n\n'
        "Companies:\n" + listing
    )
    r = requests.post(f"{OLLAMA}/api/chat", json={
        "model": MODEL,
        "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": instr}],
        "format": "json", "stream": False, "options": {"temperature": 0, "num_ctx": 4096},
    }, timeout=300)
    r.raise_for_status()
    return json.loads(r.json()["message"]["content"])


def fetch_all(sb):
    rows, start, step = [], 0, 1000
    while True:
        d = sb.table("tenants").select("id,legal_name").range(start, start + step - 1).execute().data or []
        rows += d
        if len(d) < step:
            return rows
        start += step


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, help="only the first N tenants (testing)")
    ap.add_argument("--batch", type=int, default=40, help="names per model call")
    ap.add_argument("--dry-run", action="store_true", help="print, write nothing")
    a = ap.parse_args()

    sb = create_client(URL, KEY)
    tens = fetch_all(sb)
    if a.limit:
        tens = tens[:a.limit]
    print(f"LEX -> {URL}   model={MODEL}   tenants={len(tens)}{'   (dry-run)' if a.dry_run else ''}")

    by_cat, counts = defaultdict(list), defaultdict(int)
    for i in range(0, len(tens), a.batch):
        chunk = tens[i:i + a.batch]
        names = [t["legal_name"] or "" for t in chunk]
        try:
            res = classify_batch(names)
        except Exception as e:
            print(f"  batch {i // a.batch + 1}: ERROR {e} — marking OTHER")
            res = {}
        for j, t in enumerate(chunk):
            code = str(res.get(str(j + 1), "OTHER")).upper()
            if code not in CODE:
                code = "OTHER"
            by_cat[code].append(t["id"])
            counts[code] += 1
        print(f"  {min(i + a.batch, len(tens))}/{len(tens)} classified…")

    print("Totals:", {k: counts[k] for k in CODE if counts[k]})
    if a.dry_run:
        # show a sample so you can eyeball quality
        for code in ("FINANCE", "TECH", "HEALTH", "MEDIA"):
            sample = [t["legal_name"] for t in tens if t["id"] in set(by_cat[code])][:8]
            if sample:
                print(f"  e.g. {code}: " + ", ".join(sample))
        print("dry-run: nothing written.")
        return

    written = 0
    for code, ids in by_cat.items():
        val = CODE[code]
        for k in range(0, len(ids), 200):
            sb.table("tenants").update({"niche_category": val}).in_("id", ids[k:k + 200]).execute()
            written += len(ids[k:k + 200])
    print(f"Done. Wrote niche_category for {written} tenants.")


if __name__ == "__main__":
    main()
