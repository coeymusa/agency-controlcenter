#!/usr/bin/env python3
"""
sweep-followups.py — Decommission prospects who got a follow-up and stayed silent.

Run 5+ days after a follow-up batch. Pulls Resend send history + CC events,
flags every prospect with 2+ Resend sends and zero engagement events as
`ignored` in the control center. Does NOT touch Vercel projects.

Usage (from agency-control-center/ root):
    # Easiest: export the prod CC token once per shell session, then:
    export CONTROL_API_TOKEN=<the 64-char prod token from memory>
    python scripts/sweep-followups.py --dry-run    # preview, no writes
    python scripts/sweep-followups.py              # actually decommission

    # Or pass tokens explicitly:
    python scripts/sweep-followups.py --cc-token <prod-token> --dry-run

Reads RESEND_API_KEY from .env (local dev — Vercel scrubs secrets out of
.env.production). The prod CONTROL_API_TOKEN is intentionally NOT in any
local .env file — supply it via the CONTROL_API_TOKEN env var or --cc-token.
"""

import argparse
import datetime
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict

CC_BASE = "https://agency-control-center-one.vercel.app"
ENGAGE_TYPES = {"email_opened", "email_clicked", "email_reply", "link_clicked", "pixel_open"}


def load_env(*env_paths: str) -> dict:
    """Merge env files in order. Later files override earlier ones, but EMPTY
    values never override non-empty ones (Vercel pulls leave secrets blank in
    .env.production so we keep the real value from .env)."""
    out: dict[str, str] = {}
    for env_path in env_paths:
        if not os.path.exists(env_path):
            continue
        for line in open(env_path, encoding="utf-8"):
            m = re.match(r'^\s*([A-Z0-9_]+)\s*=\s*"?([^"\r\n]*?)"?\s*$', line)
            if m and m.group(2):
                out[m.group(1)] = m.group(2)
    if not out:
        sys.exit(f"no env values loaded from: {env_paths}")
    return out


def fetch_resend_sends(api_key: str) -> dict:
    """Return {recipient_email_lower: total_send_count}."""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "User-Agent": "agency-control-center/1.0 Mozilla/5.0",
    }
    counts: Counter = Counter()
    after = None
    pages = 0
    while True:
        pages += 1
        url = f"https://api.resend.com/emails?limit=100" + (f"&after={after}" if after else "")
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                payload = json.load(r)
        except urllib.error.HTTPError as e:
            print(f"  page {pages} failed: HTTP {e.code} {e.read().decode('utf-8', errors='replace')[:120]}")
            break
        data = payload.get("data", []) or []
        for e in data:
            for to in (e.get("to") or []):
                counts[to.lower()] += 1
        if not payload.get("has_more") or not data:
            break
        after = data[-1]["id"]
        time.sleep(0.3)
        if pages > 100:
            print("  safety cap at 100 pages")
            break
    print(f"  Resend: pulled {pages} page(s), {sum(counts.values())} sends across {len(counts)} recipients")
    return dict(counts)


def fetch_cc(path: str, token: str) -> dict:
    req = urllib.request.Request(
        f"{CC_BASE}{path}",
        headers={"Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def post_cc_prospect(prospect: dict, token: str) -> tuple[bool, str]:
    """Full-replace POST to /api/prospects. Must pass every field defensively."""
    body = json.dumps(prospect).encode("utf-8")
    req = urllib.request.Request(
        f"{CC_BASE}/api/prospects",
        data=body,
        method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return True, f"{r.status}"
    except urllib.error.HTTPError as e:
        return False, f"{e.code} {e.read().decode('utf-8', errors='replace')[:160]}"


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true", help="Preview decommissions without writing")
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ap.add_argument(
        "--env",
        action="append",
        default=None,
        help="Env file(s). Default loads .env (for RESEND_API_KEY) then .env.production (overrides CONTROL_API_TOKEN with prod). Pass --env <path> one or more times to override.",
    )
    ap.add_argument("--reason", default="auto-sweep follow-up silent", help="Suffix tag + note context")
    ap.add_argument("--limit", type=int, default=200, help="Cap on prospects to process this run")
    ap.add_argument("--cc-token", default=None, help="Prod CC bearer token (overrides .env / CONTROL_API_TOKEN env var)")
    ap.add_argument("--resend-key", default=None, help="Resend API key (overrides .env)")
    args = ap.parse_args()

    env_paths = args.env or [os.path.join(root, ".env"), os.path.join(root, ".env.production")]
    env = load_env(*env_paths)
    resend_key = args.resend_key or os.environ.get("RESEND_API_KEY") or env.get("RESEND_API_KEY")
    cc_token = args.cc_token or os.environ.get("CONTROL_API_TOKEN") or env.get("CONTROL_API_TOKEN")
    if not resend_key:
        sys.exit("RESEND_API_KEY missing. Pass --resend-key, set env var, or add to .env.")
    if not cc_token or cc_token.startswith("local-dev-token"):
        sys.exit(
            "CONTROL_API_TOKEN missing or stub. Local-dev token won't work against prod CC.\n"
            "  → export CONTROL_API_TOKEN=<64-char prod token> (see memory reference_control_center_creds.md)\n"
            "  → or pass --cc-token <token>"
        )

    print("Pulling Resend send history...")
    sends_by_to = fetch_resend_sends(resend_key)

    print("Pulling CC prospects + events...")
    ps_payload = fetch_cc("/api/prospects", cc_token)
    prospects = ps_payload.get("prospects", ps_payload) if isinstance(ps_payload, dict) else ps_payload
    ev_payload = fetch_cc("/api/events", cc_token)
    events = ev_payload.get("events", [])

    engaged_pids = defaultdict(set)
    for ev in events:
        pid = ev.get("prospectId")
        if pid and ev.get("type") in ENGAGE_TYPES:
            engaged_pids[pid].add(ev["type"])

    # Candidates: status `emailed`, no engagement events, Resend send count >= 2
    today_iso = datetime.date.today().isoformat()
    candidates = []
    for p in prospects:
        if p.get("status") != "emailed":
            continue
        if engaged_pids.get(p["id"]):
            continue
        em = (p.get("contactEmail") or "").lower()
        if not em:
            continue
        n = sends_by_to.get(em, 0)
        if n >= 2:
            candidates.append((p, n))

    candidates.sort(key=lambda x: ((x[0].get("location") or ""), x[0]["business"]))
    print(f"\nFound {len(candidates)} candidates (status=emailed, 2+ Resend sends, zero engagement).\n")

    if not candidates:
        print("Nothing to do.")
        return

    if args.dry_run:
        print("DRY RUN — preview only, no writes:\n")
    for p, n in candidates[: args.limit]:
        line = f"  {n}x  {p['business'][:42]:42s}  {(p.get('location') or '?')[:18]:18s}  {p.get('contactEmail')}"
        print(line if args.dry_run else f"[updating] {line}")

    if args.dry_run:
        print(f"\nTotal would-decommission: {min(len(candidates), args.limit)}")
        return

    ok = 0
    fail = 0
    today_stamp = datetime.date.today().isoformat()
    for p, n in candidates[: args.limit]:
        updated = {
            "slug": p["slug"],
            "business": p["business"],
            "website": p.get("website") or "",
            "contactEmail": p.get("contactEmail") or "",
            "location": p.get("location") or "",
            "industry": p.get("industry") or "",
            "status": "ignored",
            "tags": (p.get("tags") or []) + [f"auto-decommission-sweep-{today_stamp}"],
            "notes": (p.get("notes") or "")
            + f"\n\n[{today_stamp} sweep] Decommissioned: {n} Resend sends, zero engagement events. {args.reason}.",
        }
        success, info = post_cc_prospect(updated, cc_token)
        if success:
            ok += 1
        else:
            fail += 1
            print(f"  FAIL {p['slug']}: {info}")
        time.sleep(0.3)

    print(f"\nDone: {ok} decommissioned, {fail} failed.")


if __name__ == "__main__":
    main()
