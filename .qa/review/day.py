#!/usr/bin/env python3
"""Supervisor entry point: packets for every downloaded run of a day, plus Haiku batches of 5 (owner, 2026-11-24).

    python 2-shared/qa-kit/review/day.py 3-output/<date> [--repos heap-ntg1,heap-oap1] [--at-run-commit] [--post-upload]

Finds <day>/runs/<repo>/r<id>/, maps each <repo> to its 1-frameworks/<fw>/<ui> folder by git remote, runs
packet.py per run into <day>/review/packets/<repo>/r<id>/ and writes <day>/review/packets/batches.json:
the newest take of every clip, 5 per batch, defect-flagged clips spread over the batches.

--at-run-commit  read assignment/FINDINGS/config/narration as of each run's commit (gh run view headSha +
                 git archive into a temp dir): use it when the repo changed after the run (re-checking an old run).
"""
from __future__ import annotations

import argparse, glob, json, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, HERE)
import packet  # noqa: E402

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def repo_dirs():
    out = {}
    for d in glob.glob(os.path.join(ROOT, "1-frameworks", "*", "*")):
        if not os.path.exists(os.path.join(d, "assignment.json")):
            continue
        try:
            url = subprocess.run(["git", "-C", d, "remote", "get-url", "origin"], capture_output=True, text=True, timeout=20).stdout.strip()
        except Exception:
            continue
        name = url.rstrip("/").split("/")[-1].removesuffix(".git")
        if name:
            out[name] = d
    return out


def snapshot(repo_dir, repo, run_id, tmp):
    sha = subprocess.run(["gh", "run", "view", run_id, "-R", f"MMMustafakamran/{repo}", "--json", "headSha", "-q", ".headSha"],
                         capture_output=True, text=True, timeout=60).stdout.strip()
    if not sha:
        return None, None
    dest = os.path.join(tmp, f"{repo}-{sha[:9]}")
    if not os.path.isdir(dest):
        os.makedirs(dest)
        paths = ["assignment.json", "FINDINGS.md", "autorecorder/config", "autorecorder/actions", "narration/scripts", "frontend",
                 "my-copilot-app", "src", "app", "backend", "agent"]
        have = [p for p in paths if subprocess.run(["git", "-C", repo_dir, "cat-file", "-e", f"{sha}:{p}"], capture_output=True).returncode == 0]
        tar = subprocess.run(["git", "-C", repo_dir, "archive", "--format=tar", sha] + have, capture_output=True, timeout=300).stdout
        subprocess.run(["tar", "-xf", "-", "-C", dest], input=tar, capture_output=True, timeout=300)
    return os.path.join(dest, "assignment.json"), sha[:9]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("day")
    ap.add_argument("--repos")
    ap.add_argument("--at-run-commit", action="store_true")
    ap.add_argument("--post-upload", action="store_true")
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--batch", type=int, default=5)
    a = ap.parse_args()
    day = os.path.abspath(a.day)
    dirs = repo_dirs()
    pk_root = os.path.join(day, "review", "packets")
    tmp = os.path.join(tempfile.gettempdir(), "qa-packet-snapshots")
    newest = {}
    for run in sorted(glob.glob(os.path.join(day, "runs", "*", "r*"))):
        repo, rid = os.path.basename(os.path.dirname(run)), os.path.basename(run)[1:]
        if a.repos and repo not in a.repos.split(","):
            continue
        if repo not in dirs:
            print(f"skip {repo}: no 1-frameworks folder with that git remote")
            continue
        asg, sha = os.path.join(dirs[repo], "assignment.json"), "HEAD"
        if a.at_run_commit:
            s_asg, s_sha = snapshot(dirs[repo], repo, rid, tmp)
            if s_asg and os.path.exists(s_asg):
                asg, sha = s_asg, s_sha
        out = os.path.join(pk_root, repo, "r" + rid)
        print(f"{repo} r{rid} (repo @ {sha}) ...", flush=True)
        args = [run, "--assignment", asg, "--out", out, "--jobs", str(a.jobs)] + (["--post-upload"] if a.post_upload else [])
        packet.main(args)
        for c in (packet.rjson(os.path.join(out, "index.json"), {}) or {}).get("clips", []):
            if c.get("run") == rid or "run" not in c:
                k = (repo, c["clip"])
                if k not in newest or int(rid) > int(newest[k]["run"]):
                    newest[k] = {**c, "repo": repo, "run": rid, "dir": out}
    items = sorted(newest.values(), key=lambda c: (-len(c.get("risk") or []), c["repo"], c["clip"]))
    n_b = max(1, (len(items) + a.batch - 1) // a.batch)
    batches = [[] for _ in range(n_b)]
    for i, c in enumerate(items):  # round-robin: risky clips spread over the batches
        batches[i % n_b].append({"clip": c["clip"], "repo": c["repo"], "run": c["run"], "status": c.get("status"),
                                 "sheet": os.path.join(c["dir"], c["sheet"]) if c.get("sheet") else None,
                                 "card": os.path.join(c["dir"], c["card"]) if c.get("card") else None,
                                 "risk": c.get("risk"), "attention": c.get("attention")})
    os.makedirs(pk_root, exist_ok=True)
    with open(os.path.join(pk_root, "batches.json"), "w", encoding="utf-8") as f:
        json.dump(batches, f, ensure_ascii=False, indent=1)
    print(f"{len(items)} clips (newest take each), {n_b} batches of <= {a.batch} -> {os.path.join(pk_root, 'batches.json')}")
    print(f"{sum(1 for c in items if c.get('risk'))} clips with defect flags")


if __name__ == "__main__":
    main()
