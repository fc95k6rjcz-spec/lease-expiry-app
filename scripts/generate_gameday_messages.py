#!/usr/bin/env python3
r"""
generate_gameday_messages.py — Seaforth weekly game-day WhatsApp drafts (5090).

For every Seaforth team playing this coming week, writes one short, upbeat
WhatsApp-ready message (opponent, day/time, venue, home/away, a nudge) for the
team manager to paste straight into their team's group chat. Generated locally
on the 5090 — free, no API bills.

IMPORTANT — this reads the NETBALL/association Supabase (project
fnmafnfpkvndhbtsfdtx), NOT the LEX project. It needs that project's key.
Easiest: run it from the folder where your existing netball scripts
(generate_match_reports.py) live, so it picks up that folder's .env — OR set
NETBALL_KEY first.

  .env (netball) must contain one of:
      NETBALL_KEY=<netball service_role key>
      SUPABASE_SERVICE_KEY=<netball service_role key>
      SUPABASE_KEY=<netball service_role key>
  OLLAMA_URL=http://localhost:11434
  OLLAMA_MODEL=qwen2.5:14b

RUN:
    python generate_gameday_messages.py
    python generate_gameday_messages.py --team 20     # just Seaforth 20
    python generate_gameday_messages.py --days 10      # widen the window
"""
import os
import sys
import argparse
from datetime import date, timedelta

import requests
try:
    from supabase import create_client
except ImportError:
    sys.exit("Run:  pip install supabase requests")

NETBALL_URL = "https://fnmafnfpkvndhbtsfdtx.supabase.co"
CLUB = "seaforth"


def load_env():
    here = os.path.dirname(os.path.abspath(__file__))
    for path in [
        os.path.join(os.getcwd(), ".env"),
        os.path.join(here, ".env"),
        os.path.join(os.getcwd(), "netball.env"),
        os.path.join(here, "netball.env"),
        os.path.expanduser("~/.env"),
        os.path.expanduser("~/netball.env"),
    ]:
        if os.path.exists(path):
            for line in open(path, encoding="utf-8"):
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())


load_env()
KEY = os.environ.get("NETBALL_KEY") or os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434").rstrip("/")
MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:14b")
if not KEY:
    sys.exit("No netball key found. Set NETBALL_KEY, or run this from your netball "
             "scripts folder (the one with generate_match_reports.py and its .env).")


def parse_d(s):
    try:
        return date.fromisoformat(str(s)[:10])
    except (ValueError, TypeError):
        return None


def fetch_all(sb):
    """Pull all fixtures (paginates past the 1000-row API cap)."""
    rows, step, start = [], 1000, 0
    while True:
        r = sb.table("winter_2026_fixtures").select("*").range(start, start + step - 1).execute()
        d = r.data or []
        rows += d
        if len(d) < step:
            return rows
        start += step


SYSTEM = (
    "You are the team manager of a community netball team. You write short, warm, "
    "upbeat WhatsApp messages to players and their parents. Australian English. "
    "A couple of emojis are fine. Never invent player names, scores, or facts — use "
    "only what you're given."
)


def draft(facts):
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content":
                "Write a 2-3 sentence WhatsApp message for this weekend's game. Include the "
                "opponent, the day and time, the venue, and whether we're home or away. End with "
                "one encouraging line. Under 60 words. Facts:\n" + facts},
        ],
        "stream": False,
        "options": {"temperature": 0.7},
    }
    r = requests.post(f"{OLLAMA_URL}/api/chat", json=payload, timeout=180)
    r.raise_for_status()
    return r.json()["message"]["content"].strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--team", help="only this Seaforth team (e.g. 20)")
    ap.add_argument("--days", type=int, default=8, help="look this many days ahead")
    args = ap.parse_args()

    sb = create_client(NETBALL_URL, KEY)
    print(f"Netball DB -> {NETBALL_URL}   model={MODEL}")
    fx = fetch_all(sb)
    print(f"Loaded {len(fx)} fixtures; finding Seaforth games in the next {args.days} days.\n")

    today = date.today()
    cutoff = today + timedelta(days=args.days)

    # group Seaforth fixtures by our team
    teams = {}
    for f in fx:
        home = (f.get("Home Team") or "")
        away = (f.get("Away Team") or "")
        is_home = CLUB in home.lower()
        is_away = CLUB in away.lower()
        if not (is_home or is_away):
            continue
        team = home if is_home else away
        teams.setdefault(team, []).append({
            "date": parse_d(f.get("Game Date")),
            "time": f.get("Game Time"),
            "venue": f.get("Venue Name"),
            "round": f.get("Round Name"),
            "status": (f.get("Game Status") or ""),
            "opp": away if is_home else home,
            "home": is_home,
            "hs": f.get("Home Team Score"),
            "as": f.get("Away Team Score"),
            "raw": f,
        })

    n = 0
    for team in sorted(teams):
        if args.team and args.team.lower() not in team.lower():
            continue
        recs = sorted([r for r in teams[team] if r["date"]], key=lambda r: r["date"])
        nxt = next((r for r in recs
                    if r["date"] >= today and r["status"].lower() != "final"
                    and not (r["hs"] or r["as"])), None)
        if not nxt or nxt["date"] > cutoff:
            continue
        past = [r for r in recs if r["date"] < today and (r["hs"] or r["as"])]
        last = past[-1] if past else None

        facts = [
            f"Our team: {team}",
            f"Opponent: {nxt['opp']}",
            f"We are: {'HOME' if nxt['home'] else 'AWAY'}",
            f"Day/date: {nxt['date'].strftime('%A %d %b')}",
            f"Time: {nxt['time']}",
            f"Venue: {nxt['venue']}",
            f"Round: {nxt['round']}",
        ]
        if last:
            facts.append(f"Last game result: {last['raw'].get('Home Team')} {last['hs']} - "
                         f"{last['as']} {last['raw'].get('Away Team')}")
        try:
            msg = draft("\n".join(facts))
        except Exception as e:
            print(f"--- {team}: SKIP ({e})")
            continue
        n += 1
        print(f"================  {team}  —  vs {nxt['opp']}, {nxt['time']} {nxt['venue']}  ================")
        print(msg)
        print()

    print(f"Done. {n} team messages for the week of {today.isoformat()}.")


if __name__ == "__main__":
    main()
