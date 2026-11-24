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

TILE_W, TILE_H, LABEL_H, COLS, MAX_TILES = 800, 450, 30, 2, 8
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
    return [(DEFECT, "claim-not-in-take: note/narration cites " + "; ".join(bad[:4]) + " but events, .error.log and terminal show none of it")] if bad else []


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


ADDED_RE = re.compile(r"never (?:defined|shown|shows|given|named)|not (?:shown|on the page|given|defined)|isn'?t shown|"
                      r"stand-?ins?|copied (?:from|verbatim)|guessed|shows only|only shows|fragments?|imports? .{0,60} but|"
                      r"doc never|page never|has no |shows no|never shows|is empty|missing", re.I)
WIRING_RE = re.compile(r"runtimeUrl|runtime-url|agentId|agent id|\bport\b|\bagent=|use client|client component|see above|"
                       r"doc says \"/api|url", re.I)


def chk_added_code(repo, block, segs, status):
    if status not in ("❌", "⚠️") or not block:
        return []
    out = []
    tabs = ide_tabs(block)
    any_added = any(t[3] for t in tabs)
    real_added = any("HARNESS" not in x or ADDED_RE.search(x) and not (WIRING_RE.search(x) and not re.search(r"never (?:defined|shown)|stand-?in|copied", x, re.I))
                     for t in tabs for x in t[3])
    for fp, a, b, added in tabs:
        src = rd(os.path.join(repo["root"], fp))
        if src is None:
            continue
        lines = src.splitlines()
        for want in added:
            if want and want not in src:
                out.append((DEFECT, f"added-code: addedText not found in {os.path.basename(fp)} (recorder skips the highlight): '{want[:60]}'"))
        if added:
            continue
        hits = [ln.strip() for ln in lines  # whole file: added code outside the shown range isn't highlighted either
                if "HARNESS" in ln and ADDED_RE.search(ln) and not (WIRING_RE.search(ln) and not re.search(r"never|stand-?in|copied", ln, re.I))]
        if hits:
            out.append((DEFECT, f"added-code: {os.path.basename(fp)} has HARNESS added code with no addedText highlight: '{hits[0][:90]}'"))
    labels = [s.get("at") for s in segs]
    ide_plus = any(labels[i] == "ide" and i + 1 < len(labels) and labels[i + 1] == "+" for i in range(len(labels)))
    if segs and (real_added or out) and not ide_plus:
        out.append((DEFECT, "added-code: code is added (addedText/HARNESS) but the narration has no `ide +` line saying it wasn't on the page"))
    elif segs and any_added and not ide_plus:
        out.append((ATTENTION, "added-code: an addedText highlight looks like wiring and has no `ide +` line: check the highlight is needed added code"))
    if segs and ide_plus and not any_added and not out:
        out.append((ATTENTION, "added-code: narration has an `ide +` line but no addedText is set, check it isn't only wiring"))
    return out


def chk_stale(link, day):
    f = (link or {}).get("filmed")
    if f and day and f < day:
        return [(ATTENTION, f"stale-link: filmed today but links[].filmed is {f}, upload today's take")]
    return []


# ---------------------------------------------------------------- sheet

def tile_plan(marks, cps, dur, status):
    spans = segment_spans(marks, dur)
    nxt = lambda t: next((m["t"] for m in marks if m["t"] > t + 0.05), dur)
    plan = []

    def add(t, label, cap=None):
        t = min(max(0.2, t), (cap if cap is not None else dur) - 0.3, dur - 0.3)
        plan.append((round(t, 1), label))

    first = {m["label"]: m["t"] for m in reversed(marks)}
    if "doc" in first:
        add(first["doc"] + 1.5, "doc", nxt(first["doc"]))
    evs = [m for m in marks if m["label"] == "evidence"]
    for i, m in enumerate(evs[:2]):
        add(m["t"] + 3, f"evidence{'#' + str(i + 1) if len(evs) > 1 else ''} (held)", nxt(m["t"]))
    if "ide" in first:
        add(first["ide"] + 4, "ide", nxt(first["ide"]))
    win = demo_window(marks, dur)
    if win:
        add(win[0] + 2, "demo start", win[1])
        act = next((m["t"] for m in marks if m["label"] in ("action", "click") and win[0] < m["t"] < win[1]), None)
        if act is not None and win[1] - act > 8:
            add(act + 6, "demo after prompt/click", win[1])
        dc = [c for c in cps if c.get("label") not in HEALTH_CP and win[0] <= c.get("t", 0) <= win[1] + 1]
        if dc and dc[-1]["t"] < win[1] - 2:
            add(dc[-1]["t"] + 0.5, f"demo result (cp {dc[-1]['label']})", win[1])
            add(win[1] - 1, "demo end", win[1])
        else:
            if win[1] - win[0] > 25:
                add((win[0] + win[1]) / 2, "demo mid", win[1])
            add(win[1] - 1, "demo result (demo end)", win[1])
    if "notepad" in first:
        add(first["notepad"] + 4, "notepad", nxt(first["notepad"]))
    if "failure" in first:
        add(first["failure"] + 6, "failure terminal", dur)
    add(dur - 0.6, "final")
    seen, out = set(), []
    for t, l in sorted(plan, key=lambda x: x[0]):
        if any(abs(t - s) < 1.0 for s in seen):
            continue
        seen.add(t)
        out.append((t, l))
    while len(out) > MAX_TILES:
        out.pop(next(i for i, (_, l) in enumerate(out) if l in ("demo mid", "demo end", "doc", "final")))
    return out


def esc_filter_path(p):
    return p.replace("\\", "/").replace(":", "\\:")


def build_sheet(video, plan, out_jpg, tmp):
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
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(t), "-i", video, "-frames:v", "1", "-vf", vf, "-q:v", "3", tj],
                       capture_output=True, timeout=120)
        if not os.path.exists(tj):
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-sseof", "-1", "-i", video, "-frames:v", "1", "-vf", vf, "-q:v", "3", tj],
                           capture_output=True, timeout=120)
        paths.append(tj)
    n = len(paths)
    if n % COLS:
        blank = os.path.join(tmp, f"t{n:02d}.jpg")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c=0x202020:s={TILE_W}x{TILE_H + LABEL_H}",
                        "-frames:v", "1", blank], capture_output=True, timeout=60)
        n += 1
    rows = (n + COLS - 1) // COLS
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-start_number", "0", "-i", os.path.join(tmp, "t%02d.jpg"),
                    "-vf", f"tile={COLS}x{rows}:padding=4:color=0x000000", "-frames:v", "1", "-q:v", "5", out_jpg],
                   capture_output=True, timeout=120)
    return os.path.exists(out_jpg)


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
    af, ainfo = chk_audio(mp4, fit, dur) if status in ("❌", "⚠️") or os.path.exists(mp4) else ([], {})
    if status in ("❌", "⚠️") and not os.path.exists(mp4):
        af.append((DEFECT, "audio: no narrated mp4 in this run for a ❌/⚠️ page"))
    flags += af
    flags += chk_evidence(section, cps)
    flags += chk_added_code(repo, block, segs, status)
    if post_upload:
        flags += chk_stale(link, (tl.get("recordedAt") or "")[:10])
    for i in checks.get("issues") or []:  # "frozen to the end" is usually the post-reply hold: attention, not defect
        flags.append((ATTENTION if "to the end" in str(i) else DEFECT, "checks: " + str(i)[:160]))
    for s in checks.get("status_signals") or []:
        flags.append((ATTENTION, "checks signal: " + str(s)[:160]))
    if checks.get("look_at"):
        flags.append((ATTENTION, f"checks: {len(checks['look_at'])} red run(s) to look at: " +
                      ", ".join((f"{fmt_t(r.get('start', 0))}-{fmt_t(r.get('end', 0))} {r.get('segment', '')}" if isinstance(r, dict) else str(r)[:60]) for r in checks["look_at"][:3])))

    plan = tile_plan(marks, cps, dur, status)
    sheet = os.path.join(out_dir, clip + ".sheet.jpg")
    tmp = tempfile.mkdtemp(prefix="pkt-")
    try:
        ok_sheet = build_sheet(webm, plan, sheet, tmp) if os.path.exists(webm) else False
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
    L.append("## Sheet tiles")
    L.append(" · ".join(f"{fmt_t(t)} {l}" for t, l in plan) + ("" if ok_sheet else "  (SHEET FAILED)"))
    L.append("## Checkpoints")
    for c in cps[:8]:
        L.append(f"- {fmt_t(c.get('t', 0))} {c.get('label')} {'ok' if c.get('ok') else 'FAIL'}: "
                 f"expect {str(c.get('expect', ''))[:60]} | saw {str(c.get('observed', '')).strip()[:110]!r}")
    errs = event_errors(events, marks, dur)
    L.append("## Errors (demo, docs noise removed)")
    for t, k, cnt, txt in errs[:6]:
        L.append(f"- {fmt_t(t)} {k}{' x' + str(cnt) if cnt > 1 else ''}: {txt[:180]}")
    if not errs:
        L.append("- none")
    v = verdict_of(errlog)
    if v:
        L.append(f"## Recorder verdict (.error.log, not on camera)\n{v}")
    L.append("## Flags (treat every one)")
    for kind, f in flags:
        L.append(f"- [{kind}] {f}")
    if not flags:
        L.append("- none")
    L = [ln for ln in "\n".join(L).splitlines()][:48]
    with open(os.path.join(out_dir, clip + ".card.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    return {"clip": clip, "run": run_label, "status": status, "slug": slug,
            "sheet": os.path.basename(sheet) if ok_sheet else None, "card": clip + ".card.md",
            "sheet_kb": round(os.path.getsize(sheet) / 1024) if ok_sheet else 0, "tiles": len(plan),
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
