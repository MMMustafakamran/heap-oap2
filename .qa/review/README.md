# qa-kit/review: review packets (owner, 2026-11-24)

One command turns a day's CI runs into per-clip packets a Haiku reviewer judges from **2 files** (sheet + card), no exploring, no ffmpeg. Stdlib Python + ffmpeg/ffprobe, no LLM, CI-safe. Brief for the reviewer: [HAIKU-BRIEF.md](HAIKU-BRIEF.md). Rules: [REVIEW.md](../../instructions/REVIEW.md) §10.

```sh
# all downloaded runs of a day -> <day>/review/packets/<repo>/r<id>/ + batches.json (newest take per clip, 5 per batch)
python 2-shared/qa-kit/review/day.py 3-output/<date> [--repos heap-ntg1,...] [--at-run-commit] [--post-upload]
# one run
python 2-shared/qa-kit/review/packet.py <run-dir> --assignment <repo>/assignment.json --out <dir> [--clips a,b] [--post-upload]
# same doc page, different status across frameworks
python 2-shared/qa-kit/review/consistency.py 1-frameworks/*/*/assignment.json
```

`--at-run-commit` reads the repo (assignment, FINDINGS, config, actions, narration, frontend) as of the run's commit (`gh run view` headSha + `git archive`): use it for runs older than the repo's last edits. Without it the current repo is used (normal day: review before editing).

## Per clip

| File | Contents |
|---|---|
| `<clip>.sheet.jpg` | 2-column contact sheet, 800×450 tiles with a `m:ss label` strip: doc, each evidence mark +3 s (after the drag hold, max 2), ide +4 s, demo start, after the prompt/click, demo result (last demo checkpoint + 0.5 s, else demo end − 1 s), notepad +4 s, failure terminal, final frame. ≤ 8 tiles, 1604 px wide × 1448–1932 px (≤ 3.1 MP), ~100–240 KB |
| `<clip>.card.md` | ≤ 48 lines: expected status (to read after describing the sheet), finding one-liners, report notes, Notepad note (`FINDING_NOTES`), narration lines, tile list, checkpoints, demo-segment errors (deduped, docs-site noise removed), `.error.log` Recorder verdict, flags |
| `index.json` | per clip: `status`, `risk` (defect flags), `attention` flags, sheet size, seconds |

## Free checks (flags on the card)

| Flag | Tier | Rule |
|---|---|---|
| `reply-only` / `no-effect-checkpoint` | attention | ✅ page whose only deciding checkpoints are `reply` (or none): the reviewer must find the UI effect in a tile |
| `claim-not-in-take` | defect | ❌/⚠️: quoted strings, error names (`RUN_ERROR`, `…Error`, 4xx/5xx) and "log/error says X" claims in the note or the demo/notepad narration that appear nowhere in events, `.error.log`, the error-terminal cast, checkpoints or the record log |
| `audio` | defect | narrated mp4: audio stream present, mp4 ≈ webm (±2.5 s), each narration line ends before the clip end, no ≥ 1.5 s silence (`silencedetect -42 dB`) inside a line's window (fit.json), CI fit flags |
| `evidence-not-selected` | defect | record log says `Text not on screen, not selecting` for the page (whatever the evidence checkpoint says) |
| `added-code` | defect | ❌/⚠️: a shown IDE tab has a HARNESS comment that adds code (never shown / stand-in / copied / guessed…, wiring comments skipped) but no `addedText`; an `addedText` not found in its file; added code with no `ide +` narration line. Best effort: backend files not in the page's IDE tabs are not seen |
| `stale-link` | attention | `--post-upload` only: the page was filmed in this run but `links[].filmed` is older |
| `checks: …` | defect / attention | `qa-kit/checks` `issues` (defect), `status_signals` and red runs (attention) |

## Not done here (later, recorder core: REVIEW-BLINDSPOTS 2026-11-24 items 4–9)

- Keyframe after each drag-select hold and at "result settled"; `settled` mark; evidence checkpoint ok only when `getSelection()` holds the text (items 8, 9, 13).
- Log the successful agent run request (URL, agent id) and runtime `/info`, so a wrong agent/port can be flagged (item 4).
- Explicit `expect: fail` checkpoints on known-defect pages and an `effect` checkpoint on every UI-change page (items 1, 14).
