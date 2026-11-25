#!/usr/bin/env python3
"""Review packets: one contact sheet + one card per clip, for a Haiku reviewer (owner, 2026-11-24).

    python packet.py <run-dir> --assignment <repo>/assignment.json --out <dir> [--post-upload] [--jobs 4]

<run-dir> is a CI artifact folder (`.../r<id>` or `.../r<id>/run-<date>`). Repo files (FINDINGS.md,
autorecorder/config, autorecorder/actions, narration/scripts) are read next to the assignment file, so a
snapshot of the repo at the run's commit works too (see day.py --at-run-commit).

Writes <out>/<clip>.sheet.jpg, <out>/<clip>.card.md, <out>/index.json. Stdlib + ffmpeg/ffprobe only, no LLM.
"""
from __future__ import annotations

import argparse, concurrent.futures as cf, glob, json, os, re, shutil, subprocess, sys, tempfile, time

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

TILE_W, TILE_H, LABEL_H, COLS, MAX_TILES = 800, 450, 30, 2, 12
PER_SHEET = 6  # 2x3 per image (~1600x1450): one 12-tile image got downscaled by the reviewer model and blurred (owner, 2026-11-25)
CARD_LINES = 60
DEFECT, ATTENTION = "defect", "attention"
HEALTH_CP = {"evidence", "app-alive", "no-redbox"}
NOISE_HOSTS = ("docs.copilotkit.ai", "google-analytics", "googletagmanager", "posthog", "sentry", "vercel",
               "intercom", "segment", "hotjar", "doubleclick", "fonts.g", "reo.dev", "scarf")
NOISE_TEXT = ("GL Driver Message", "GPU stall", "Download the Vue Devtools", "[vite]", "DevTools",
              "Third-party cookie", "was preloaded using link preload")


def rd(p, default=None):
    try:
        with open(p, encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError:
        return default


def rjson(p, default=None):
    s = rd(p)
    if s is None:
        return default
    try:
        return json.loads(s)
    except ValueError:
        return default


def fmt_t(t):
    t = max(0, float(t))
    return f"{int(t // 60)}:{int(t % 60):02d}"


def ffprobe_dur(p):
    try:
        out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p],
                             capture_output=True, text=True, timeout=60).stdout.strip()
        return float(out)
    except Exception:
        return None


def find_font():
    for f in ("C:/Windows/Fonts/consola.ttf", "C:/Windows/Fonts/arial.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
              "/usr/share/fonts/TTF/DejaVuSans.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf"):
        if os.path.exists(f):
            return f
    return None


FONT = find_font()


# ---------------------------------------------------------------- repo side (assignment, findings, config)

def load_repo(assignment_path):
    a = rjson(assignment_path) or {}
    root = os.path.dirname(os.path.abspath(assignment_path))
    by_clip = {}
    for p in a.get("pages", []):
        for ln in p.get("links") or []:
            if ln.get("clip"):
                by_clip[ln["clip"]] = (p, ln)
    findings = {}
    for m in re.finditer(r"^(?:- )?\*{0,2}#(\d+)\b\*{0,2}\s*(.+)$", rd(os.path.join(root, "FINDINGS.md"), ""), re.M):
        findings.setdefault(int(m.group(1)), m.group(2).replace("**", "").strip())
    cfg = "\n".join(rd(f, "") for f in sorted(glob.glob(os.path.join(root, "autorecorder", "config", "*.ts"))))
    acts = "\n".join(rd(f, "") for f in sorted(glob.glob(os.path.join(root, "autorecorder", "actions", "*.ts"))))
    return {"a": a, "root": root, "by_clip": by_clip, "findings": findings, "cfg": cfg, "acts": acts}


def ts_block(src, start):
    """Text of the {...} or [...] starting at src[start], skipping string literals."""
    open_c = src[start]
    close_c = {"{": "}", "[": "]"}[open_c]
    depth, i, q = 0, start, None
    while i < len(src):
        c = src[i]
        if q:
            if c == "\\":
                i += 2
                continue
            if c == q:
                q = None
        elif c in "'\"`":
            q = c
        elif c == open_c:
            depth += 1
        elif c == close_c:
            depth -= 1
            if depth == 0:
                return src[start:i + 1]
        i += 1
    return src[start:]


STR_RE = re.compile(r"'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\"|`((?:[^`\\]|\\.)*)`", re.S)


def ts_strings(s):
    return [next(g for g in m.groups() if g is not None).replace("\\'", "'").replace('\\"', '"') for m in STR_RE.finditer(s)]


def page_config(repo, slug):
    m = re.search(r"\bid:\s*['\"]" + re.escape(slug) + r"['\"]", repo["cfg"])
    if not m:
        return None
    start = repo["cfg"].rfind("{", 0, m.start())
    return ts_block(repo["cfg"], start) if start >= 0 else None


def cfg_field(block, name):
    m = re.search(r"\b" + name + r"\s*:\s*", block)
    if not m:
        return None
    i = m.end()
    if block[i] in "[{":
        return ts_block(block, i)
    sm = STR_RE.match(block, i)
    if sm:
        return ts_strings(sm.group(0))[0]
    nm = re.match(r"\d+", block[i:])
    return int(nm.group(0)) if nm else None


def ide_tabs(block):
    """[(file, start, end, [addedText...])] for ideFile + extraTabs/ideTabs."""
    tabs = []
    if not block:
        return tabs
    f = cfg_field(re.sub(r"extraTabs\s*:\s*\[.*", "", block, flags=re.S), "ideFile")
    if isinstance(f, str):
        added = cfg_field(block, "ideAddedText")
        added = ts_strings(added) if isinstance(added, str) and added.startswith("[") else ([added] if isinstance(added, str) else [])
        head = re.sub(r"extraTabs\s*:\s*\[.*", "", block, flags=re.S)
        tabs.append((f, cfg_field(head, "startLine") or 1, cfg_field(head, "endLine") or 9999, added))
    for key in ("extraTabs", "ideTabs"):
        arr = cfg_field(block, key)
        if not isinstance(arr, str) or not arr.startswith("["):
            continue
        i = 0
        while True:
            j = arr.find("{", i)
            if j < 0:
                break
            ob = ts_block(arr, j)
            i = j + len(ob)
            fp = cfg_field(ob, "filePath") or cfg_field(ob, "file")
            if not isinstance(fp, str):
                continue
            ad = cfg_field(ob, "addedText")
            ad = ts_strings(ad) if isinstance(ad, str) and ad.startswith("[") else ([ad] if isinstance(ad, str) else [])
            tabs.append((fp, cfg_field(ob, "startLine") or 1, cfg_field(ob, "endLine") or 9999, ad))
    return tabs


def finding_note(repo, slug):
    m = re.search(r"FINDING_NOTES[^=]*=\s*\{", repo["acts"])
    if not m:
        return None
    blk = ts_block(repo["acts"], m.end() - 1)
    km = re.search(r"\n\s*['\"]?" + re.escape(slug) + r"['\"]?\s*:\s*", blk)
    if not km:
        return None
    i = km.end()
    if blk[i] == "[":
        return "\n".join(ts_strings(ts_block(blk, i)))
    sm = STR_RE.match(blk, i)
    return ts_strings(sm.group(0))[0] if sm else None


def narration_script(repo, link, clip):
    p = link.get("narration") if link else None
    if isinstance(p, dict):
        return p.get("segments") or []
    cand = [os.path.join(repo["root"], p)] if p else []
    cand.append(os.path.join(repo["root"], "narration", "scripts", clip + ".json"))
    for c in cand:
        j = rjson(c)
        if j:
            return j.get("segments") or []
    return []


# ---------------------------------------------------------------- run side

def run_files(run_dir):
    if not os.path.isdir(os.path.join(run_dir, "videos")):
        subs = sorted(glob.glob(os.path.join(run_dir, "run-*")))
        if subs:
            run_dir = subs[-1]
    return run_dir


def record_sections(run_dir):
    """{page slug: text of its record.log section} over all shards."""
    out = {}
    for f in glob.glob(os.path.join(run_dir, "logs", "*", "record.log")) + glob.glob(os.path.join(run_dir, "logs", "record.log")):
        txt = rd(f, "")
        parts = re.split(r"\n(?=🎬 RECORDING: )", txt)
        for part in parts:
            m = re.match(r"🎬 RECORDING: .*\(([^()\s]+)\)\s*\n", part)
            if m:
                out[m.group(1)] = out.get(m.group(1), "") + part
    return out


def segment_spans(marks, dur):
    spans = []
    for i, m in enumerate(marks):
        end = marks[i + 1]["t"] if i + 1 < len(marks) else dur
        spans.append((m["label"], m["t"], end))
    return spans


def seg_at(spans, t):
    lab = None
    for l, a, b in spans:
        if a <= t:
            lab = l
    return lab


def demo_window(marks, dur):
    a = next((m["t"] for m in marks if m["label"] == "demo"), None)
    if a is None:
        return None
    b = next((m["t"] for m in marks if m["t"] > a and m["label"] in ("notepad", "failure", "end", "notepad-closed")), dur)
    return a, b


def is_noise(ev):
    txt = (ev.get("text") or "") + " " + (ev.get("url") or "") + " " + (ev.get("source") or "")
    if any(h in txt for h in NOISE_HOSTS) and "localhost" not in txt and "127.0.0.1" not in txt:
        return True
    return any(n in txt for n in NOISE_TEXT)


def event_errors(events, marks, dur):
    win = demo_window(marks, dur)
    seen, out = {}, []
    for e in events:
        k = e.get("kind")
        if k == "pageerror":
            txt = e.get("text") or e.get("message") or ""
        elif k == "console" and e.get("level") == "error":
            txt = e.get("text") or ""
        elif k == "network" and (e.get("error") or (e.get("status") or 0) >= 400):
            txt = f"{e.get('method', '')} {re.sub(r'[?#].*', '', e.get('url', ''))} -> {e.get('status') or e.get('error')}"
        elif k == "action" and e.get("ok") is False:
            txt = "action failed: " + (e.get("name") or e.get("label") or "") + " " + (e.get("error") or "")
        else:
            continue
        if is_noise(e) or (e.get("error") == "net::ERR_ABORTED"):
            continue
        t = e.get("t", 0)
        if win and not (win[0] - 1 <= t <= win[1] + 1) and k != "pageerror":
            continue
        key = re.sub(r"\d+", "#", txt)[:140]
        if key in seen:
            out[seen[key]][2] += 1
            continue
        seen[key] = len(out)
        out.append([t, k, 1, txt.strip().replace("\n", " ")[:220]])
    return out


def verdict_of(errlog):
    if not errlog:
        return None
    m = re.search(r"=== Recorder verdict ===\s*\n(.*)", errlog, re.S)
    return " ".join(m.group(1).split())[:400] if m else None


def cast_output(cast):
    if not cast:
        return ""
    out = []
    for line in cast.splitlines()[1:]:
        try:
            ev = json.loads(line)
            if ev[1] == "o":
                out.append(ev[2])
        except Exception:
            pass
    return re.sub(r"\x1b\[[0-9;?]*[a-zA-Z]", "", "".join(out))


# ---------------------------------------------------------------- free checks

def chk_reply_only(status, cps):
    decisive = [c for c in cps if c.get("label") not in HEALTH_CP]
    if status != "✅":
        return []
    if not decisive:
        return [(ATTENTION, "no-effect-checkpoint: no checkpoint decides this ✅ page, verify the UI effect in the sheet")]
    if all(c.get("label") == "reply" for c in decisive):
        return [(ATTENTION, "reply-only: only reply-text checkpoints decide this ✅ page, verify the UI effect in the sheet (not the agent's words)")]
    return []


STOP = set("""about after again agent answer answers asked asking because before being cant could didnt does doesnt
doing dont error every gave gives going isnt just log logs model never nothing other page really returns right says
shows should since still that their them then there these thing this those through turns under until when where which
while with without would yeah reply replies print prints printed output says show said with from your what""".split())


def claim_tokens(texts):
    toks = set()
    for t in texts:
        for m in re.finditer(r"[\"'`]([^\"'`]{3,60})[\"'`]", t):
            if not re.match(r"^(s|t|re|ve|ll|d|m)\b", m.group(1)):
                toks.add(("quote", m.group(1)))
        for m in re.finditer(r"\b([A-Z][A-Z0-9]*_[A-Z0-9_]+|[A-Za-z]+(?:Error|Exception)|[45]\d\d)\b", t):
            toks.add(("ident", m.group(1)))
        for m in re.finditer(r"\b(?:log|logs|error|console|terminal|traceback|server)\s+(?:says|said|shows|showed|reports|prints|gives|fails with|threw|throws)\s+([^.;\n]+)", t, re.I):
            words = [w for w in re.findall(r"[a-z][a-z_]{4,}", m.group(1).lower()) if w not in STOP]
            if words:
                toks.add(("claim", " ".join(words)))
    return toks


def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower())


def chk_claims(texts, hay):
    h = norm(hay)
    hz = h.replace(" ", "")
    bad = []
    for kind, tok in sorted(claim_tokens(texts)):
        if kind == "claim":
            miss = [w for w in tok.split() if norm(w).strip() not in h]
            if len(miss) * 2 >= len(tok.split()):  # most of the claim's words are absent from the take
                bad.append(f"'{tok}' (missing: {', '.join(miss)})")
        else:
            n = norm(tok).strip()
            if n and n not in h and n.replace(" ", "") not in hz:
                bad.append(f"'{tok}'")
    # (owner, 2026-11-25) not found is [attention]; [defect] only when a checkpoint or the UI timeline contradicts it (chk_contradiction)
    return [(ATTENTION, "claim-not-in-take: note/narration cites " + "; ".join(bad[:4]) + " but events, .error.log and terminal show none of it")] if bad else []


ABSENCE_RE = re.compile(r"\b(nothing|no (?:card|ui|buttons?|component|surface|widget|chart|image|panel|frame|iframe|approve)|"
                        r"never (?:renders?|shows?|appears?)|(?:doesn'?t|didn'?t|does not|did not) (?:render|show|appear)|"
                        r"(?:just|only) (?:a )?plain text|just text|blank)\b", re.I)
SHOWN_UI = ("buttons", "surface", "iframe", "canvas", "img", "svg", "input")


def chk_contradiction(texts, cps, ui_events, win, has_added=False):
    """[defect] when the note/narration says nothing showed but a ui: checkpoint passed or the UI timeline logged UI in the demo.
    [attention] instead when the page has added code: the demo may show it working on the harness addition (REVIEW.md §4a)."""
    said = [t for t in texts if ABSENCE_RE.search(t or "")]
    if not said:
        return []
    ok_ui = [c for c in cps if str(c.get("label", "")).startswith("ui:") and c.get("ok")]
    shown = [e for e in ui_events if e.get("ui") in SHOWN_UI and (not win or win[0] <= e.get("t", 0) <= win[1] + 1)]
    if not ok_ui and not shown:
        return []
    what = (f"checkpoint {ok_ui[0]['label']} ok at {fmt_t(ok_ui[0].get('t', 0))}" if ok_ui else
            f"UI timeline {fmt_t(shown[0].get('t', 0))} {shown[0].get('ui')}: {str(shown[0].get('text', ''))[:60]}")
    m = ABSENCE_RE.search(said[0])
    own = has_added or any(re.search(r"\b(my own|i added|added it myself|harness|showcase|by hand)\b", t or "", re.I) for t in texts)
    tier = ATTENTION if own else DEFECT
    extra = " (page has added code: the UI may be the harness addition working, check which part the claim is about)" if own else ""
    return [(tier, f"claim-contradicted: note/narration says '{m.group(0)}' but {what}{extra}")]


def rms_windows(mp4, win=0.25):
    """[(t, rms dB)] per `win` seconds of the mix (ffmpeg astats)."""
    sr = 8000
    try:
        out = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", mp4, "-vn", "-af",
                              f"aresample={sr},asetnsamples={int(sr * win)},astats=metadata=1:reset=1,"
                              "ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-", "-f", "null", "-"],
                             capture_output=True, text=True, timeout=300, encoding="utf-8", errors="replace").stdout
    except Exception:
        return []
    res, t = [], None
    for line in out.splitlines():
        m = re.search(r"pts:(\d+)", line)
        if m:
            t = int(m.group(1)) / sr
        m = re.search(r"RMS_level=(-?[\d.]+|-inf)", line)
        if m and t is not None:
            res.append((t, -120.0 if m.group(1) == "-inf" else float(m.group(1))))
    return res


def silences(mp4):
    """(stretches with no voice: RMS within 5 dB of the room tone, >= 1 s; room tone dB). Room tone = 20th percentile."""
    w = rms_windows(mp4)
    if not w:
        return [], None
    room = sorted(v for _, v in w)[len(w) // 5]
    out, st = [], None
    for t, v in w + [(1e9, 0.0)]:
        if v <= room + 5:
            st = t if st is None else st
        elif st is not None:
            if t - st >= 1.0:
                out.append((st, t))
            st = None
    return out, room


def has_audio(mp4):
    try:
        out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type",
                              "-of", "csv=p=0", mp4], capture_output=True, text=True, timeout=60).stdout
        return "audio" in out
    except Exception:
        return False


def chk_audio(mp4, fit, webm_dur):
    flags, info = [], {}
    if not os.path.exists(mp4):
        return flags, info
    if not has_audio(mp4):
        return [(DEFECT, "audio: narrated mp4 has no audio stream")], info
    d = ffprobe_dur(mp4)
    info["mp4_s"] = d
    if d and webm_dur and abs(d - webm_dur) > 2.5:
        flags.append((DEFECT, f"audio: mp4 {d:.1f}s vs webm {webm_dur:.1f}s"))
    lines = (fit or {}).get("lines") or []
    lead = (fit or {}).get("lead") or 0
    sil, room = silences(mp4)
    info["room_db"], info["silences"] = room, len(sil)
    bad = []
    for ln in lines:
        if ln.get("dropped"):  # mark not in this take: left out of the mix (owner, 2026-11-25)
            flags.append((ATTENTION, f"audio: line {ln.get('at')} dropped ({ln['dropped']}), check the take still says what it must"))
            continue
        if ln.get("flag"):
            bad.append(f"{ln.get('at')} fit={ln['flag']}")
        a = (ln.get("slotStart") or 0) + lead
        b = a + (ln.get("duration") or 0)
        if d and b > d + 0.3:
            bad.append(f"{ln.get('at')} ends {b:.1f}s after clip end {d:.1f}s")
        for s, e in sil:
            if min(b - 0.4, e) - max(a + 0.4, s) >= 1.5:
                bad.append(f"{ln.get('at')} silent {max(a, s):.1f}-{min(b, e):.1f}s inside its line")
                break
    if bad:
        flags.append((DEFECT, "audio: " + "; ".join(bad[:4])))
    return flags, info


def chk_evidence(section, cps):
    if not section:
        return []
    miss = re.findall(r"Text not on screen, not selecting: \"(.*?)\"", section)
    if not miss:
        return []
    ok = any(c.get("label") == "evidence" and c.get("ok") for c in cps)
    return [(DEFECT, f"evidence-not-selected: record log says text not on screen for {len(miss)} snippet(s) "
                     f"('{miss[0][:70]}')" + (" although the evidence checkpoint says ok" if ok else ""))]


ADDED_TAG = re.compile(r"(?://|#|/\*|<!--)\s*ADDED:|^\s*\*\s*ADDED:")


def added_blocks(lines):
    """Number of ADDED blocks in a file: runs of tagged lines (recorder core/code-tags.ts; follow lines don't change the count)."""
    n, prev = 0, False
    for ln in lines:
        hit = bool(ADDED_TAG.search(ln))
        if hit and not prev:
            n += 1
        prev = hit
    return n


def chk_added_code(repo, block, segs, status, marks=None, new_recorder=False):
    """(owner, 2026-11-25) Only `ADDED:` lines and legacy addedText count as added code; HARNESS / CHANGED: never raise it."""
    if status not in ("❌", "⚠️") or not block:
        return []
    out = []
    n_added, files = 0, []
    any_text = False
    for fp, a, b, added in ide_tabs(block):
        src = rd(os.path.join(repo["root"], fp))
        if src is None:
            continue
        k = added_blocks(src.splitlines())
        if k:
            n_added += k
            files.append(os.path.basename(fp))
        for want in added:
            any_text = True
            if want and want not in src:
                out.append((DEFECT, f"added-code: addedText not found in {os.path.basename(fp)} (recorder skips the highlight): '{want[:60]}'"))
            elif want and not any(ADDED_TAG.search(ln) for ln in src.splitlines() if want in ln):
                n_added += 1
    labels = [s.get("at") for s in segs]
    added_lines = [l for l in labels if str(l).split("#")[0] == "added"]
    ide_plus = any(labels[i] == "ide" and i + 1 < len(labels) and labels[i + 1] == "+" for i in range(len(labels)))
    voiced = bool(added_lines) or ide_plus  # `ide +` is the legacy form of the added-code line
    if segs and n_added and not voiced:
        out.append((DEFECT, f"added-code: {n_added} added block(s) ({', '.join(files) or 'addedText'}) but no `added` narration line saying it wasn't on the page"))
    if segs and added_lines and len(added_lines) > n_added:
        out.append((ATTENTION, f"added-code: {len(added_lines)} `added` narration line(s) for {n_added} added block(s): extra lines are dropped"))
    if marks is not None and new_recorder and n_added and not any(m.get("label") == "added" for m in marks):
        out.append((DEFECT, "added-code: ADDED code in the IDE tabs but no `added` mark in this take (not highlighted)"))
    if segs and ide_plus and not n_added and not added_lines and not out:
        out.append((ATTENTION, "added-code: narration has an `ide +` line but no ADDED block or addedText is set, check it isn't only wiring"))
    return out


def chk_stale(link, day):
    f = (link or {}).get("filmed")
    if f and day and f < day:
        return [(ATTENTION, f"stale-link: filmed today but links[].filmed is {f}, upload today's take")]
    return []


# ---------------------------------------------------------------- sheet

def tile_plan_legacy(marks, cps, dur):
    """Fixed demo tiles for takes without step/ui events (recorded before 2026-11-25)."""
    plan = []
    win = demo_window(marks, dur)
    if win:
        plan.append((win[0] + 2, "demo start", 3))
        act = next((m["t"] for m in marks if m["label"] in ("action", "click") and win[0] < m["t"] < win[1]), None)
        if act is not None and win[1] - act > 8:
            plan.append((act + 6, "demo after prompt/click", 3))
        dc = [c for c in cps if c.get("label") not in HEALTH_CP and win[0] <= c.get("t", 0) <= win[1] + 1]
        if dc and dc[-1]["t"] < win[1] - 2:
            plan.append((dc[-1]["t"] + 0.5, f"demo result (cp {dc[-1]['label']})", 2))
            plan.append((win[1] - 1, "demo end", 4))
        else:
            if win[1] - win[0] > 25:
                plan.append(((win[0] + win[1]) / 2, "demo mid", 5))
            plan.append((win[1] - 1, "demo result (demo end)", 2))
    return plan


def tile_plan(marks, cps, dur, status, events=None):
    """Key moments (owner, 2026-11-25), each (t, label) with a priority (lower = kept first):
    0 expected-UI checkpoints, 1 errors / failure, 2 first UI change after each prompt/click,
    3 clicks (before/after), reply finished, demo end, 4 one tile each for doc / evidence / ide (an
    `added` mark first) / notepad. Up to MAX_TILES; old takes without step/ui events get the fixed demo tiles."""
    events = events or []
    spans_next = lambda t: next((m["t"] for m in marks if m["t"] > t + 0.05), dur)
    win = demo_window(marks, dur)
    cand = []

    def add(t, label, pri, cap=None):
        t = min(max(0.2, t), (cap if cap is not None else dur) - 0.3, dur - 0.3)
        cand.append((round(t, 1), label[:62], pri))

    first = {m["label"]: m["t"] for m in reversed(marks)}
    # Segment tiles are reserved (priority -1): the cut to MAX_TILES never drops doc / evidence / ide / notepad.
    if "doc" in first:
        add(first["doc"] + 1.5, "doc", -1, spans_next(first["doc"]))
    evs = [m for m in marks if m["label"] == "evidence"]
    for i, m in enumerate(evs[:2]):
        add(m["t"] + 3, f"evidence{'#' + str(i + 1) if len(evs) > 1 else ''} (held)", -1 if i == 0 else 5, spans_next(m["t"]))
    added = [m for m in marks if m["label"] == "added"]
    for i, m in enumerate(added[:2]):
        add(m["t"] + 1.8, f"added: {str(m.get('detail', ''))[:48]}", -1 if i == 0 else 5, spans_next(m["t"]))
    if "ide" in first and not added:
        add(first["ide"] + 4, "ide", -1, spans_next(first["ide"]))
    if "notepad" in first:
        add(first["notepad"] + 4, "notepad", -1, spans_next(first["notepad"]))
    if "failure" in first:
        add(first["failure"] + 6, "failure terminal", -1, dur)

    key = [e for e in events if e.get("kind") in ("ui", "step", "step-missing", "click")]
    if win and key:
        lo, hi = win[0] - 1, win[1] + 1
        for c in cps:
            if str(c.get("label", "")).startswith("ui:") and lo <= c.get("t", 0) <= hi:
                add(c["t"] + 0.3, f"{c['label']} {'seen' if c.get('ok') else 'MISSING'}", 0, win[1])
        for t, k, cnt, txt in event_errors(events, marks, dur)[:2]:
            add(t + 0.5, f"error: {txt[:50]}", 1, win[1])
        for e in events:
            if e.get("kind") == "ui" and e.get("ui") == "error" and lo <= e.get("t", 0) <= hi:
                add(e["t"] + 0.4, f"ui: error {str(e.get('text', ''))[:44]}", 1, win[1])
                break
        triggers = [e["t"] for e in events if (e.get("kind") == "step" and e.get("label") == "prompt-sent") or e.get("kind") == "click"]
        uis = sorted((e for e in events if e.get("kind") == "ui" and lo <= e.get("t", 0) <= hi), key=lambda e: e["t"])
        used = set()
        for tr in triggers:
            nxt = next((e for e in uis if e["t"] > tr and id(e) not in used), None)
            if nxt is not None:
                used.add(id(nxt))
                add(nxt["t"] + 0.4, f"ui: {nxt.get('ui')} {str(nxt.get('text', ''))[:48]}", 2, win[1])
        for e in events:
            if e.get("kind") == "click" and lo <= e.get("t", 0) <= hi:
                tgt = str(e.get("target", "")).split(": ", 1)[-1][:40]
                add(e["t"] - 0.2, f"click {tgt}", 3, win[1])
                add(e["t"] + 0.8, f"after click {tgt}", 3, win[1])
            elif e.get("kind") == "step" and e.get("label") == "reply-finished":
                add(e["t"] + 0.5, "reply finished", 3, win[1])
            elif e.get("kind") == "step-missing":
                add(e["t"], f"step missing: {str(e.get('label', ''))[:40]}", 1, win[1])
        add(win[1] - 1, "demo end", 2, win[1])
    else:
        for t, l, pri in tile_plan_legacy(marks, cps, dur):
            add(t, l, pri, win[1] if win else None)
    add(dur - 0.6, "final", 6)
    # Keep the most important tile when two land within 1 s, then cut to MAX_TILES by priority.
    out = []
    for t, l, pri in sorted(cand, key=lambda x: (x[2], x[0])):
        if any(abs(t - s) < 1.0 for s, _, _ in out):
            continue
        out.append((t, l, pri))
    out = sorted(out, key=lambda x: (x[2], x[0]))[:MAX_TILES]
    return [(t, l) for t, l, _ in sorted(out, key=lambda x: x[0])]


def esc_filter_path(p):
    return p.replace("\\", "/").replace(":", "\\:")


def build_sheet(video, plan, out_jpg, tmp):
    """Tiles in chunks of PER_SHEET: <clip>.sheet.jpg (tiles 1-6), <clip>.sheet-2.jpg (7-12). Returns the paths written."""
    for old in [out_jpg] + [out_jpg[:-4] + f"-{k}.jpg" for k in range(2, 5)]:
        if os.path.exists(old):
            os.remove(old)
    paths = []
    for i, (t, label) in enumerate(plan):
        lf = os.path.join(tmp, f"l{i}.txt")
        with open(lf, "w", encoding="utf-8") as f:
            f.write(f"{fmt_t(t)}  {label}")
        tj = os.path.join(tmp, f"t{i:02d}.jpg")
        vf = f"scale={TILE_W}:{TILE_H}:force_original_aspect_ratio=decrease,pad={TILE_W}:{TILE_H}:(ow-iw)/2:(oh-ih)/2,pad={TILE_W}:{TILE_H + LABEL_H}:0:{LABEL_H}:0x202020"
        if FONT:
            vf += (f",drawtext=fontfile='{esc_filter_path(FONT)}':textfile='{esc_filter_path(lf)}':"
                   f"x=10:y=5:fontsize=20:fontcolor=0xFFE000")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(t), "-i", video, "-frames:v", "1", "-vf", vf, "-q:v", "2", tj],
                       capture_output=True, timeout=120)
        if not os.path.exists(tj):
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-sseof", "-1", "-i", video, "-frames:v", "1", "-vf", vf, "-q:v", "2", tj],
                           capture_output=True, timeout=120)
        paths.append(tj)
    out = []
    for k in range(0, len(paths), PER_SHEET):
        chunk = paths[k:k + PER_SHEET]
        d = os.path.join(tmp, f"s{k}")
        os.makedirs(d, exist_ok=True)
        for j, src in enumerate(chunk):
            if os.path.exists(src):
                shutil.copy(src, os.path.join(d, f"t{j:02d}.jpg"))
        n = len(chunk)
        if n % COLS:
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c=0x202020:s={TILE_W}x{TILE_H + LABEL_H}",
                            "-frames:v", "1", os.path.join(d, f"t{n:02d}.jpg")], capture_output=True, timeout=60)
            n += 1
        rows = (n + COLS - 1) // COLS
        dst = out_jpg if k == 0 else out_jpg[:-4] + f"-{k // PER_SHEET + 1}.jpg"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-start_number", "0", "-i", os.path.join(d, "t%02d.jpg"),
                        "-vf", f"tile={COLS}x{rows}:padding=4:color=0x000000", "-frames:v", "1", "-q:v", "3", dst],
                       capture_output=True, timeout=120)
        if os.path.exists(dst):
            out.append(dst)
    return out


# ---------------------------------------------------------------- one clip

def build_clip(clip, run_dir, repo, sections, out_dir, post_upload, run_label):
    t0 = time.time()
    vid = os.path.join(run_dir, "videos")
    tl = rjson(os.path.join(vid, clip + ".timeline.json"), {}) or {}
    marks = tl.get("marks") or []
    cps = tl.get("checkpoints") or []
    webm = os.path.join(vid, clip + ".webm")
    dur = tl.get("durationS") or ffprobe_dur(webm) or 0
    events = []
    for line in (rd(os.path.join(vid, clip + ".events.jsonl"), "") or "").splitlines():
        try:
            events.append(json.loads(line))
        except ValueError:
            pass
    page = tl.get("page") if isinstance(tl.get("page"), dict) else {}
    slug = page.get("slug") or ""
    pg, link = repo["by_clip"].get(clip, (None, None))
    status = (pg or {}).get("status") or "?"
    checks = rjson(os.path.join(run_dir, "checks", clip + ".checks.json"), {}) or {}
    errlog = rd(os.path.join(vid, "logs", slug + ".error.log")) if slug else None
    cast = cast_output(rd(os.path.join(vid, "logs", slug + ".error-terminal.cast"))) if slug else ""
    segs = narration_script(repo, link, clip) if status in ("❌", "⚠️") else []
    note = finding_note(repo, (pg or {}).get("id") or slug) or finding_note(repo, slug)
    block = page_config(repo, slug) or page_config(repo, (pg or {}).get("id") or "")
    section = sections.get(slug, "")
    narr_dir = os.path.join(run_dir, "narration")
    mp4 = os.path.join(narr_dir, clip + ".narrated.mp4")
    fit = rjson(os.path.join(narr_dir, clip + ".fit.json"))

    flags = []
    flags += chk_reply_only(status, cps)
    ui_events = [e for e in events if e.get("kind") == "ui"]
    new_recorder = any(e.get("kind") in ("step", "ui", "click") for e in events)
    if status in ("❌", "⚠️"):
        texts = [s.get("text", "") for s in segs if s.get("at") in ("demo", "notepad", "+")]
        if note:
            texts.append(note)
        # what the take itself showed: events before the Notepad (the typed note is an `input` event), logs, terminal
        np_t = next((m["t"] for m in marks if m["label"] == "notepad"), 1e9)
        take_ev = [e for e in events if e.get("kind") not in ("input", "mark", "action") and e.get("t", 0) < np_t]
        hay = "\n".join([json.dumps(take_ev, ensure_ascii=False), errlog or "", cast,
                         json.dumps([c for c in cps if c.get("label") != "evidence"], ensure_ascii=False)])
        flags += chk_claims(texts, hay)
        has_added = any(str(s.get("at", "")).split("#")[0] == "added" for s in segs) or bool(
            block and (re.search(r"\baddedText\s*:", block) or re.search(r"\bideAddedText\s*:", block)))
        flags += chk_contradiction(texts, cps, ui_events, demo_window(marks, dur), has_added)
    af, ainfo = chk_audio(mp4, fit, dur) if status in ("❌", "⚠️") or os.path.exists(mp4) else ([], {})
    if status in ("❌", "⚠️") and not os.path.exists(mp4):
        af.append((DEFECT, "audio: no narrated mp4 in this run for a ❌/⚠️ page"))
    flags += af
    flags += chk_evidence(section, cps)
    flags += chk_added_code(repo, block, segs, status, marks, new_recorder)
    if post_upload:
        flags += chk_stale(link, (tl.get("recordedAt") or "")[:10])
    for i in checks.get("issues") or []:  # "frozen to the end" is usually the post-reply hold: attention, not defect
        flags.append((ATTENTION if "to the end" in str(i) else DEFECT, "checks: " + str(i)[:160]))
    for s in checks.get("status_signals") or []:
        flags.append((ATTENTION, "checks signal: " + str(s)[:160]))
    if checks.get("look_at"):
        flags.append((ATTENTION, f"checks: {len(checks['look_at'])} red run(s) to look at: " +
                      ", ".join((f"{fmt_t(r.get('start', 0))}-{fmt_t(r.get('end', 0))} {r.get('segment', '')}" if isinstance(r, dict) else str(r)[:60]) for r in checks["look_at"][:3])))

    plan = tile_plan(marks, cps, dur, status, events)
    sheet = os.path.join(out_dir, clip + ".sheet.jpg")
    tmp = tempfile.mkdtemp(prefix="pkt-")
    try:
        sheets = build_sheet(webm, plan, sheet, tmp) if os.path.exists(webm) else []
        ok_sheet = bool(sheets)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    # ---- card
    L = [f"# {clip}", f"run {run_label} · {fmt_t(dur)} · page `{slug}` · doc {page.get('docUrl') or (pg or {}).get('docPath', '')}",
         f"**Expected status (read AFTER describing the demo): {status}**"]
    for n in (pg or {}).get("findings") or []:
        L.append(f"- finding #{n}: {repo['findings'].get(n, '?')[:160]}")
    for n in ((pg or {}).get("notes") or [])[:2]:
        L.append(f"- report note: {str(n)[:160]}")
    if note:
        L.append("- notepad note: " + " / ".join(x.strip() for x in note.splitlines() if x.strip())[:420])
    if segs:
        L.append("## Narration")
        for s in segs:
            L.append(f"- {s.get('at')}: {s.get('text', '')[:200]}")
    L.append("## Flags (treat every one)")
    for kind, f in flags:
        L.append(f"- [{kind}] {f}")
    if not flags:
        L.append("- none")
    L.append("## Sheet tiles")
    for k in range(0, len(plan), PER_SHEET):
        nm = os.path.basename(sheet) if k == 0 else os.path.basename(sheet)[:-4] + f"-{k // PER_SHEET + 1}.jpg"
        L.append(f"- {nm}: " + " · ".join(f"{fmt_t(t)} {l}" for t, l in plan[k:k + PER_SHEET]))
    if not ok_sheet:
        L.append("  (SHEET FAILED)")
    L.append("## Checkpoints")
    for c in cps[:8]:
        L.append(f"- {fmt_t(c.get('t', 0))} {c.get('label')} {'ok' if c.get('ok') else 'FAIL'}: "
                 f"expect {str(c.get('expect', ''))[:60]} | saw {str(c.get('observed', '')).strip()[:110]!r}")
    exp = [c for c in cps if str(c.get("label", "")).startswith("ui:")]
    if exp:
        L.append("## Expected UI")
        for c in exp[:6]:
            L.append(f"- {c['label'][3:]}: {'seen ' + fmt_t(c.get('t', 0)) + ' ' + repr(str(c.get('observed', ''))[:70]) if c.get('ok') else 'MISSING (checked ' + fmt_t(c.get('t', 0)) + ')'}")
    tl_rows = []
    dwin = demo_window(marks, dur)
    for e in events:
        if dwin and not (dwin[0] - 1 <= e.get("t", 0) <= dwin[1] + 1):
            continue
        k = e.get("kind")
        if k == "ui":
            tl_rows.append((e.get("t", 0), f"ui {e.get('ui')}: {str(e.get('text', ''))[:70]}"))
        elif k in ("step", "step-missing"):
            tl_rows.append((e.get("t", 0), f"{k} {e.get('label')}"))
        elif k == "click":
            tl_rows.append((e.get("t", 0), f"click {str(e.get('target', ''))[:60]}"))
    if tl_rows:
        L.append("## UI timeline")
        if len(tl_rows) > 10:  # keep the UI changes and clicks, then steps
            pri = lambda r: 0 if r[1].startswith(("ui ", "click", "step-missing")) else 1
            tl_rows = sorted(sorted(tl_rows, key=pri)[:10])
        for t, txt in tl_rows:
            L.append(f"- {fmt_t(t)} {txt}")
    errs = event_errors(events, marks, dur)
    L.append("## Errors (demo, docs noise removed)")
    for t, k, cnt, txt in errs[:6]:
        L.append(f"- {fmt_t(t)} {k}{' x' + str(cnt) if cnt > 1 else ''}: {txt[:180]}")
    if not errs:
        L.append("- none")
    v = verdict_of(errlog)
    if v:
        L.append(f"## Recorder verdict (.error.log, not on camera)\n{v}")
    L = [ln for ln in "\n".join(L).splitlines()][:CARD_LINES]
    with open(os.path.join(out_dir, clip + ".card.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    return {"clip": clip, "run": run_label, "status": status, "slug": slug,
            "sheet": os.path.basename(sheet) if ok_sheet else None, "sheets": [os.path.basename(x) for x in sheets],
            "card": clip + ".card.md", "sheet_kb": sum(round(os.path.getsize(x) / 1024) for x in sheets), "tiles": len(plan),
            "risk": [f for k, f in flags if k == DEFECT], "attention": [f for k, f in flags if k == ATTENTION],
            "seconds": round(time.time() - t0, 1), **({"audio": ainfo} if ainfo else {})}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("run_dir")
    ap.add_argument("--assignment", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--clips", help="comma list: only these clips")
    ap.add_argument("--post-upload", action="store_true", help="also flag stale links (links[].filmed older than the take)")
    ap.add_argument("--jobs", type=int, default=4)
    a = ap.parse_args(argv)
    run_dir = run_files(a.run_dir)
    os.makedirs(a.out, exist_ok=True)
    repo = load_repo(a.assignment)
    sections = record_sections(run_dir)
    clips = sorted(os.path.basename(p)[:-len(".timeline.json")] for p in glob.glob(os.path.join(run_dir, "videos", "*.timeline.json")))
    if a.clips:
        want = set(a.clips.split(","))
        clips = [c for c in clips if c in want]
    m = re.search(r"r(\d+)", a.run_dir.replace("\\", "/").split("/run-")[0].rstrip("/").split("/")[-1])
    run_label = m.group(1) if m else os.path.basename(os.path.normpath(a.run_dir))
    res = []
    with cf.ThreadPoolExecutor(max_workers=max(1, a.jobs)) as ex:
        futs = {ex.submit(build_clip, c, run_dir, repo, sections, a.out, a.post_upload, run_label): c for c in clips}
        for fu in cf.as_completed(futs):
            try:
                res.append(fu.result())
            except Exception as e:  # one bad clip never stops the batch
                res.append({"clip": futs[fu], "run": run_label, "error": repr(e), "risk": ["packet failed: " + repr(e)[:120]], "attention": []})
    res.sort(key=lambda r: r["clip"])
    idx = os.path.join(a.out, "index.json")
    old = rjson(idx, {}) or {}
    keep = [c for c in old.get("clips", []) if c.get("clip") not in {r["clip"] for r in res}]
    with open(idx, "w", encoding="utf-8") as f:
        json.dump({"repo": repo["a"].get("repo"), "clips": keep + res}, f, ensure_ascii=False, indent=1)
    print(f"{len(res)} packets -> {a.out} ({sum(1 for r in res if r.get('risk'))} with defect flags)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
