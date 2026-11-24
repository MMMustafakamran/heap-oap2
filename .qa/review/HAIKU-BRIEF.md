# Haiku packet review brief (owner, 2026-11-24)

You review **5 clips**. For each clip you get two files: `<clip>.sheet.jpg` (one contact sheet, each tile labelled `m:ss label`) and `<clip>.card.md`. Judge from those two files. Don't open videos, events, configs or other files. Edit nothing.

Per clip, in this order:

1. **Look at the sheet first.** Before you read the card's expected status, write `saw`: one sentence on what the demo tiles show (what was asked, what rendered or changed in the UI, any error card or overlay). Quote the on-screen element you used ("card 'Tokyo 18°C'", "chat shows only 'I've noted it'", "red 'Agent error' banner").
2. **Then read the card**: expected status, finding, Notepad note, narration, checkpoints, errors, recorder verdict, flags.
3. **✅ page:** the promised **UI effect** must be visible in a tile (card rendered, state changed, item marked done, tool UI shown). The agent's own words ("done", "I've updated it") are not evidence. Not visible → `new_failure`.
4. **❌/⚠️ page:** does the demo show the failure the finding and note describe? Same → `pass`. Different error → `finding_changed`. Works now → `finding_resolved`. ⚠️ where the main feature fails → `status_mismatch`.
5. **Treat every card flag.** `[defect]` flags (claim-not-in-take, audio, evidence-not-selected, added-code, checks issues) → `rerecord` unless the sheet clearly disproves it; say which. `[attention]` flags (reply-only, red runs, stale-link) → look at the tiles they point to and say what you saw.
6. **Glitch** (black or frozen tile, wrong page, server down / connection refused, take cut off before the result, a full ❌ clip missing doc-evidence-ide-demo-notepad tiles) → `rerecord`. Threads pages: 401/403 or "no key" is harness trouble → `rerecord`, never `new_failure`.
7. **Never flag** (REVIEW.md §4): the end-of-clip error terminal, Next.js error overlays, CopilotKit error cards, docs callouts, blue drag-selection.
8. Sheet unclear on the one point that decides the verdict? You may extract **at most 2 extra frames** per clip: `ffmpeg -ss <t> -i <run>/videos/<clip>.webm -frames:v 1 -vf scale=1280:-2 <scratch>/x.jpg` (the run path is the card's `run` id under the day's `runs/<repo>/`). Otherwise lower your confidence.

Verdicts, first match wins: `rerecord`, `new_failure`, `finding_resolved`, `finding_changed`, `status_mismatch`, `pass`.

**Output:** one JSON line per clip (JSON Lines, 5 lines, nothing else in the file):

```json
{"clip":"OAP-vue-23-SharedStateRendering","saw":"asked to mark prototype done; agent says done, canvas still shows prototype as todo","verdict":"new_failure","observed_status":"❌","evidence":"1:02 demo result","confidence":0.8,"flags":["reply-only: UI unchanged"]}
```

- `evidence` = the tile label (or extra-frame time) that decided it.
- `confidence` below 0.6 when the deciding tile is unreadable; say what would settle it in `flags`.
- No claim without a tile, a card line or an extra frame behind it.
