# Clip review brief

Who reviews (owner, 2026-11-20): **new repo** first run: ✅ clips → Haiku, 5 per agent; ❌/⚠️ clips → Opus low, 7–10 per agent. **Retest day:** Haiku for every clip, 5 per agent, with §10 on top of this brief.

You are one of several independent reviewers. You get **5 recorded clips** from one CI run and
judge each one on its own. You never see the other agents' work and you never edit anything: you
only read and report. Claude Code decides from your verdicts; nothing you say is written to `FINDINGS.md`
or the report automatically ([QA-RULES.md](QA-RULES.md) §6).

Related: [QA-RULES.md](QA-RULES.md) (status criteria, verbatim code, HARNESS edits),
[AUTORECORDER.md](AUTORECORDER.md) (how clips are made), [VOICE.md](VOICE.md) (narration).
Background heuristics: `qa-kit/checks/haiku-review-notes.md`.

## 1. Where this sits

CI (no LLM): hold pages whose doc changed and resolve today's package versions ([DRIFT.md](DRIFT.md)) → record the other pages → re-attach saved narration to expected-failure clips at the new
marks (fit check flags lines that no longer fit) → `qa-kit/checks` → upload the run artifact.
Locally: Claude Code downloads the artifact and splits the clips 5 per Haiku agent (this brief)
→ Claude Code applies the verdicts (owner reviews afterwards) → clips go to `3-output/<date>/deliver/` → Loom links → HTML report.

## 2. Inputs per clip

| Input | Where | Use it for |
|---|---|---|
| Frames | `<clip>.frames/NNN-<label>.jpg` (recorder keyframes, one per mark and checkpoint) and `<clip>.checks/red-<t>s.jpg` (one per red run). Extract more with `ffmpeg -ss <t> -i <clip> -frames:v 1 -vf scale=1280:-2 f.jpg` when a segment has none or you need a closer look. | What is actually on screen |
| Timeline | `<clip>.timeline.json`: `marks` (segment starts), `checkpoints` (`expect` / `observed` / `ok`), `keyframes`, `durationS` | Which segment is where; what the recorder expected and read |
| Events | `<clip>.events.jsonl`: actions, console, `pageerror`, failed `network`, navigation | The exact error text and when it happened. The docs site logs its own errors: use the segment, not the raw count |
| Checks | `<clip>.checks.json` from `qa-kit/checks`: `issues`, `status_signals`, `look_at` (red runs), `freezes`, `black`, `events_summary` | Free facts: start here |
| Expected status | `assignment.json` → `pages[].status` (`✅` `⚠️` `❌`) for the page whose `links[].clip` is this clip | What the report currently says |
| Finding text | `assignment.json` → `pages[].findings` (numbers), `notes`, `block`; and those `#N` entries in the repo's `FINDINGS.md` | What the clip is supposed to show, including any HARNESS note |
| Narration script | `links[].narration` (`{clip, segments:[{at, text}]}`), plus the CI fit result (`<clip>.fit.json`, `lines[].flag`) | What the voice claims; lines CI flagged as not fitting |

Schema of timeline/events/frames: `qa-kit/recorder/SCHEMA.md`.

## 3. What a clip looks like

Segments in order, each starting at a mark:

| Segment | Marks | Shows |
|---|---|---|
| doc | `doc`, `doc2` | The docs page under test, wheel-scrolled, right framework selected in the sidebar. Opening line says the problem is being reported |
| evidence | `evidence` (one per snippet, inside the doc segment) | ❌/⚠️ full clips only. After the opening line, the faulty doc text drag-selected (normal blue selection) and held, before the IDE segment. Level-2 clips have none |
| ide | `ide`, `added` | VS Code with the doc's code (maybe `package.json` / versions). Each block of code the tester added (`ADDED:` tag, or legacy `addedText`) is drag-selected and held under its own `added` mark (owner, 2026-11-25) |
| demo | `demo`, `action`, `click`, `error` | The app on localhost; the feature used, the result visible. Long agent waits are normal |
| notepad | `notepad` | ❌/⚠️ full clips only. Notepad with the three-part note (doc says / happened / why it broke), casual text |
| outro | `notepad-closed`, `end` | Notepad closed, end of clip |
| terminal | `terminal`, `console` | Optional log window; red log text is normal |
| failure | `failure` | Failed takes only: the **end-of-clip error terminal** (see rule b) |

## 4. Two rules that override first impressions

**(a) A demo running on showcase / HARNESS code is allowed** when the doc's code is incomplete and
the finding text or Notepad note says so (e.g. "the agent file never builds a graph, I added the
rest from the showcase"). That is the finding being demonstrated, **not a rerecord** and not a
status mismatch: the page is still ❌ because it doesn't work *as published*. Only flag it when
the clip hides that a harness addition was needed (no note, no narration, and the report says ✅).

**(b) The terminal window at the end of failure clips is intentional.** A failed take ends with a
window titled `Error console — <page-id>`: a real bash session where `ls logs/`, `tail -n 25
<log>` and `grep -n -i -E ... <log>` are typed and their real output shown. It shows the viewer the real terminal error.
**Never flag it**: not as an overlay, not as a glitch, not as "a harness failure on screen". Its
red text is not an overlay. Do read it, and read `logs/<page-id>.error.log`: its **Recorder verdict** section (not on camera) is the recorder's summary of the error.

Also never flag: a Next.js error overlay (real errors, evidence; the "N Issues" badge is turned off on purpose, `devIndicators: false`), a red
error card rendered by CopilotKit or the app, the docs site's own callouts (yellow "Not
available…", blue/purple "Not supported…"), blue drag-selection.

## 5. What to flag

**Blockers only** ([QA-RULES.md](QA-RULES.md) §8a): flag a page failure only when the main feature visibly fails (crash, nothing renders, no reply, error card). Missing imports, harness helpers, type errors, temperature, cosmetic gaps are *minor*: mention them in `observations` at most, never as a flag or a status change. A ✅ page that needed an obvious HARNESS fill-in is still ✅.


| Flag | Meaning |
|---|---|
| known failure now works | Expected ❌/⚠️, but the demo plainly does what the doc promises and no defect shows. Checks hint: `status_signals` "every checkpoint passed". |
| failure's error changed | Still failing, but the on-screen error / the `.error.log` Recorder verdict / the Notepad error differs from the finding text (another message, another place, another cause). |
| ✅ page now fails | Expected ✅, but the demo shows an error, nothing rendered, a failed checkpoint, or the failure terminal. |
| glitch | Black stretch, frozen screen past a plausible wait (`checks.freezes[].ok == false`), marks out of order or past the end, clip cut off, a step that clearly misfired (cursor clicking nothing, wrong page, stuck loading), harness trouble that isn't the doc's fault (server not running, connection refused, wrong port, recorder crash before the demo). |
| injected overlay | Anything drawn onto the page by the recorder: red boxes/outlines, caption pills with explanatory text, arrows, "FINDING" banners. Check every `checks.look_at` red run frame. |
| missing segment | Full ❌/⚠️ finding clip (level 1) missing one of: doc with evidence (drag-select) → ide → demo → Notepad. **Added code check (owner, 2026-11-13, narrowed 2026-11-20):** only for code that had to be added to make the page run at all (a missing helper, file or stand-in): the `ide` segment must show it drag-selected and the voice must say it wasn't on the page; if either is absent, flag it. Other HARNESS changes (agent ids, runtime URLs, ports, wiring) are shown only by their `HARNESS` comment while the code scrolls: never flag them for a missing highlight or voice line. **(owner, 2026-11-25)** Added code = `ADDED:`-tagged lines (and legacy `addedText`) only: each needs an `added` mark (selection) and an `added` / `added#n` voice line (legacy `ide +`). `CHANGED:` and plain `HARNESS` lines never count. Level-2 pages (`KNOWN_ISSUE`: doc opening line → ide → demo, end after the demo on purpose: not missing); ✅ clip with a Notepad (except the temperature-only case, [QA-RULES.md](QA-RULES.md) §7). |
| formal Notepad | Headings, numbered/bulleted lists, ALL-CAPS title, long `https://` URLs. Casual lowercase with small typos is correct. |
| audio-fit | CI's fit flagged a narration line (`overlap`, `gap`, `past-end`): the saved line no longer fits the new marks. Report the line and the flag; never rewrite it (rewrites are local only). An `overlap` now means the recorder's wait for the line failed: verdict `rerecord` (owner, 2026-11-18). |
| status honesty | ⚠️ is only for "main feature works, minor defect". If the main feature fails, the right status is ❌: flag it. If in doubt whether the main feature works, it is ❌. |

## 6. Verdict per clip (first match wins)

| Verdict | When |
|---|---|
| `rerecord` | Injected overlay, glitch, missing segment, formal Notepad, harness trouble. The clip can't be delivered as is. |
| `new_failure` | Expected ✅, the page now fails. |
| `finding_resolved` | Expected ❌/⚠️, the known failure now works. |
| `finding_changed` | Still failing, but the error differs from the finding text. |
| `status_mismatch` | The clip is valid, but the expected status is wrong for what it shows (e.g. ⚠️ where the main feature fails; ❌ where the page works as published and no doc defect shows). |
| `pass` | Valid clip, consistent with the expected status and finding text. |

Audio-fit flags don't change the verdict on their own (except `overlap` → `rerecord`, §5): report them in `audio_fit`.

## 7. Output

One JSON object per clip, in a JSON array of 5:

```json
{
 "clip": "LANGGRAPH-react-04-UseInterrupt",
 "expected_status": "❌",
 "verdict": "pass",
 "observed_status": "❌",
 "observations": [
  {"t": 41.5, "segment": "demo", "text": "interrupt picker shows 'Tomorrow 2:00 PM'; demo uses the showcase graph (harness note in finding #7)"},
  {"t": 88.0, "segment": "evidence", "text": "'Not supported on LangGraph (TypeScript)' drag-selected"}
 ],
 "on_screen_errors": ["exact quote of an error on screen (or in the .error.log Recorder verdict, marked as such), with t"],
 "notepad_text": "exact quote of the Notepad note (best effort)",
 "audio_fit": [{"at": "demo2", "flag": "overlap"}],
 "flags": ["injected overlay 126-140s"],
 "confidence": 0.8
}
```

- `observations`: what you saw, each with a time in seconds and the segment, most important first.
- Quote on-screen errors and Notepad text **exactly** (they are compared with the finding text).
- `flags`: short strings from §5; empty for a clean pass.
- `confidence` 0–1. Below 0.6 when frames are unreadable, a segment has no frames, or you
  inferred instead of saw. Say what would settle it.
- Don't invent problems. Each claim needs a frame, an event, or a checks field behind it.

## 8. Calibration (2026-11-07)

A single Haiku agent at high effort over 5 known clips got **3/5 right**:

- It wrongly said **rerecord** for UseInterrupt because the demo ran on showcase code. That is
  allowed (rule a); the finding text said so. Fix: read the finding text before judging the demo.
- It flagged **Reasoning ⚠️ as really ❌** (main feature not working). That flag was **correct**:
  ⚠️ means the main feature works. Keep raising it.

## 9. Acting on the verdicts (owner, 2026-11-13)

The reviewers stay read-only; the agent that dispatched them must act on **every** verdict before upload ([WORKFLOW.md](WORKFLOW.md) A7-8, B5):

| Verdict | Action |
|---|---|
| `pass` | Upload. |
| `rerecord` | Fix the cause (recorder action, harness, server), refilm (CI `-f pages=<ids>`, or one local take for a page that keeps failing in CI), review the new take. |
| `new_failure` / `finding_resolved` / `finding_changed` / `status_mismatch` | Probe the page (1 run; 2 if it fails). Confirmed → update status, `FINDINGS.md`, evidence, Notepad note, narration (+ audio), then edit the clip if it stays natural, else refilm ([WORKFLOW.md](WORKFLOW.md) A8); review again. Not confirmed → refilm once; still differs → treat as confirmed and say so. |
| audio-fit flag | Shorten the line, regenerate it locally, re-mix. |

At most 3 refilm rounds per page. Then tell the owner: every status, finding or narration change (old → new, why), and what is still bad.

## 10. Packet review (Haiku, every clip; owner, 2026-11-24)

Supersedes the inputs of §2 and the output of §7 when packets are used (every retest day, and the ✅ clips of a new repo).

1. **Supervisor:** `python 2-shared/qa-kit/review/day.py 3-output/<date>` builds per clip a contact sheet (`<clip>.sheet.jpg`, ≤ 12 labelled tiles at the take's key moments, owner 2026-11-25) and a card (`<clip>.card.md`, ≤ 60 lines: expected status, finding, Notepad note, narration, checkpoints, errors, Recorder verdict, free-check flags), plus `review/packets/batches.json` (newest take per clip, 5 per batch). The supervisor hands each Haiku agent one batch and [qa-kit/review/HAIKU-BRIEF.md](../qa-kit/review/HAIKU-BRIEF.md); it never reads packets itself.
2. **Reviewer gets 5 (sheet, card) pairs** and judges from those two files only: no exploring, no ffmpeg, except **at most 1–2 extra frames** per clip when the sheet can't settle the deciding point.
3. **Describe the demo before reading the expected status** (`saw`), quoting the on-screen element used. A ✅ needs the promised **UI effect** in a tile, never only the agent's words.
4. **Treat every card flag:** `[defect]` (claim-contradicted, audio, evidence-not-selected, added-code, checks issues) → `rerecord` unless the sheet clearly disproves it; `[attention]` (claim-not-in-take, reply-only, red runs, stale-link, dropped narration lines) → look at the tiles and say what was seen. **(owner, 2026-11-25)** `claim-not-in-take` is `[attention]` unless a checkpoint or the UI timeline contradicts the claim (`claim-contradicted`, `[defect]`). The added-code flag only counts `ADDED:` lines and legacy `addedText`.
4a. **Key-moment sheet (owner, 2026-11-25):** the sheet (≤ 12 tiles) is built from the take's key moments: expected-UI checkpoints (`ui:<name> seen / MISSING`), errors, the first UI change after each prompt or click, each click (before / after), reply finished, demo end, plus one tile each for doc, evidence, ide (an `added` block first) and Notepad. Each tile label says what happened (`1:31 ui: buttons Approve, Reject`, `1:33 click Approve`). The card adds **UI timeline** (≤ 10 lines: t, kind, text) and **Expected UI** (seen / missing with t). Use them before asking for extra frames. Takes recorded before 2026-11-25 have no such events and get the old fixed demo tiles.
5. §4 still applies (never flag the failure terminal, overlays, CopilotKit error cards, callouts, drag-selection); threads 401/403 → `rerecord` (§9a of QA-RULES); verdicts as §6.
6. **Output:** one compact JSON line per clip: `{"clip","saw","verdict","observed_status","evidence" (tile label or frame time),"confidence","flags"}`.
