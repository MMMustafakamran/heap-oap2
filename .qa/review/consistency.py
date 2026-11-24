#!/usr/bin/env python3
"""Same doc page, different status across frameworks (owner, 2026-11-24).

    python consistency.py 1-frameworks/*/*/assignment.json [--json]

Groups recorded pages (reachable sidebar/in-content, not excluded) by docPath with the frontend prefix
(vue/, angular/, react-native/...) removed, and lists every docPath whose status differs between repos.
Each difference needs a one-line reason (framework-specific code) or a probe. Stdlib only.
"""
import argparse, glob, json, os, re, sys
from collections import defaultdict

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def slug(p):
    d = (p.get("docPath") or p.get("id") or "").strip("/")
    return re.sub(r"^(vue|angular|react-native|react)/", "", d)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    files = [f for pat in a.files for f in (glob.glob(pat) or [pat])]
    rows = defaultdict(list)
    for f in files:
        try:
            with open(f, encoding="utf-8") as fh:
                d = json.load(fh)
        except (OSError, ValueError):
            continue
        name = os.path.relpath(os.path.dirname(f)).replace("\\", "/").replace("1-frameworks/", "")
        for p in d.get("pages", []):
            if p.get("excluded") or p.get("reachable") not in ("sidebar", "in-content") or not p.get("status"):
                continue
            rows[slug(p)].append({"repo": name, "status": p["status"], "id": p.get("id"),
                                  "note": (p.get("notes") or [""])[0][:90] if p.get("notes") else ""})
    diff = {k: v for k, v in sorted(rows.items()) if len({r["status"] for r in v}) > 1}
    if a.json:
        print(json.dumps(diff, ensure_ascii=False, indent=1))
        return
    for k, v in diff.items():
        print(f"\n{k}")
        for r in sorted(v, key=lambda r: r["status"]):
            print(f"  {r['status']}  {r['repo']:<34} {r['note']}")
    print(f"\n{len(diff)} doc pages with differing status across {len(files)} repos")


if __name__ == "__main__":
    main()
