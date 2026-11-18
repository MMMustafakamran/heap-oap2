#!/usr/bin/env python3
"""Merge CI probe shards into one markdown table (owner, 2026-11-18).

Usage: probe_summary.py <dir> --assignment assignment.json --out probe-summary.md

<dir> holds the probe-<shard> artifacts; every summary.json under it is read:
  {pages: [{id, runs: [{ok, secs, checks: [{label, expect, observed, ok}], reply, error,
                       errorsOnScreen, consoleErrors}],
            result: 'pass'|'fail'|'flaky'|'setup-failed'}]}
Status now comes from assignment.json (page id or clip matched to the recorder id, else docPath).
Always exits 0: the summary is information, never a gate.
"""
import argparse, json, sys
from pathlib import Path


def norm(s):
    return (s or '').strip('/').lower()


def load_status(path):
    try:
        a = json.loads(Path(path).read_text(encoding='utf-8'))
    except Exception as e:
        print(f'assignment.json unreadable ({type(e).__name__})', file=sys.stderr)
        return {}
    out = {}
    for p in a.get('pages', []):
        st = p.get('status') or ''
        for k in (p.get('id'), p.get('recorderId'), p.get('docPath')):
            if norm(k):
                out[norm(k)] = st
        for l in p.get('links', []):
            if l.get('clip'):
                out[norm(l['clip'])] = st
    return out


def status_for(pid, page, status):
    for k in (pid, page.get('docPath')):
        if k and norm(k) in status:
            return status[norm(k)]
    # clip names often end with the recorder id (e.g. OAP-vue-05-SharedState): match the suffix
    for k, v in status.items():
        if k.endswith(norm(pid)) or norm(pid).endswith(k):
            return v
    return '?'


def cell(s, n=90):
    s = ' '.join(str(s or '').split()).replace('|', '\\|')
    return s if len(s) <= n else s[:n - 1] + '…'


def first_fail(runs):
    for r in runs:
        for c in r.get('checks') or []:
            if not c.get('ok'):
                return f"{c.get('label')}: expected {c.get('expect')}, saw {c.get('observed')}"
        e = r.get('error') or r.get('errors')
        if not r.get('ok') and e:
            return e[0] if isinstance(e, list) else e
    return ''


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('dir')
    ap.add_argument('--assignment', default='assignment.json')
    ap.add_argument('--out', default='probe-summary.md')
    a = ap.parse_args()
    status = load_status(a.assignment)
    pages = {}
    for f in sorted(Path(a.dir).rglob('summary.json')) if Path(a.dir).is_dir() else []:
        try:
            d = json.loads(f.read_text(encoding='utf-8'))
        except Exception as e:
            print(f'skip {f}: {type(e).__name__}', file=sys.stderr)
            continue
        for p in d.get('pages', []):
            if p.get('id'):
                pages[p['id']] = p
    lines = ['## Probe summary', '']
    if not pages:
        lines.append('No probe results found (every shard failed before probing?).')
    else:
        counts = {}
        rows = []
        for pid in sorted(pages):
            p = pages[pid]
            runs = p.get('runs') or []
            ok = sum(1 for r in runs if r.get('ok'))
            res = p.get('result') or ('pass' if runs and ok == len(runs) else 'fail' if ok == 0 else 'flaky')
            counts[res] = counts.get(res, 0) + 1
            st = status_for(pid, p, status)
            if res == 'setup-failed':
                changed = 'setup failed'
            elif res == 'flaky':
                changed = 'flaky'
            elif st == '✅' and res == 'fail':
                changed = '✅ now fails'
            elif st in ('❌', '⚠️') and res == 'pass':
                changed = '❌⚠️ now passes'
            else:
                changed = ''
            probe = f'{ok}/{len(runs)}' if res != 'setup-failed' else 'setup failed'
            rows.append(f'| {pid} | {st} | {probe} | {changed} | {cell(first_fail(runs))} |')
        lines.append('Pages: ' + ', '.join(f'{v} {k}' for k, v in sorted(counts.items())))
        lines += ['', '| Page | Status now | Probe | Changed? | First failing check |', '|---|---|---|---|---|'] + rows
    text = '\n'.join(lines) + '\n'
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(text, encoding='utf-8')
    sys.stdout.buffer.write(text.encode('utf-8'))


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f'probe_summary failed: {type(e).__name__}: {e}', file=sys.stderr)
    sys.exit(0)
