# Workflow (owner, 2026-11-13): read this first

Two flows. **A** when a framework is assigned that has no harness yet. **B** for every testing day (Mon–Fri) on frameworks that already have one. The other rule files say *how* to do each step; this file says *which steps, in which order*.

## Two GitHub repos per framework (owner, 2026-11-12/13)

| | Main repo | Peer repo |
|---|---|---|
| Name | `heap-<code><digit>`: a deliberately vague, software-sounding name so it isn't obviously CopilotKit. Code = framework (lgh LangGraph, ntg Antigravity, gdk Google ADK, gtw AG2, gno Agno, dpg DeepAgents, qks Quickstarts, oap OpenAI Agents Python; new framework → a new 3-letter code), digit = UI (1 React, 2 Vue, 3 Angular) | `copilotkit-<fw>-<ui>` (e.g. `copilotkit-agno-angular`) |
| Visibility | public | public |
| Contents | the whole project: harness, `.github/workflows` CI/CD, voice narration (scripts, audio, `narrate`), recorder, `.qa/`, review tooling | the harness only. **No CI/CD, no voice narration, no automated pipeline, and no mention of them** (no workflow files, narration, `.qa/`, AI-tool files, words like CI/shard/pipeline/Claude in text). Produced only by `handoff.sh`, whose guards (key scan, env files, word scan, tsc, core manifest) must all pass |
| Collaborator | none | **MalaikaAbb** (push access; `handoff.sh --init` invites her) |
| Who writes | agents commit and push here | only `bash 2-shared/handoff.sh <fw>/<ui>` writes it; never edit or push it by hand |

- Create the peer once: `PYTHONIOENCODING=utf-8 bash 2-shared/handoff.sh <fw>/<ui> --init MMMustafakamran/copilotkit-<fw>-<ui>`. Per-repo extra excludes or allowed words: `2-shared/handoff/rules/<fw>-<ui>.py` / `.allow.txt`.
- Re-export after every pushed change to the main repo (end of A and B): `PYTHONIOENCODING=utf-8 bash 2-shared/handoff.sh <fw>/<ui>`.
- The peer repo is what other people see: if a guard fails, fix the main repo or the rules, never skip the guard.

## Standing permissions

Agents may (owner, 2026-11-13): create both repos above, set the main repo's CI secrets with `python 4-private/set-secrets.py <repo>` (prints only ok/FAIL), push, dispatch CI, upload clips to Loom and build the Google Docs. No owner OK is needed for findings, statuses or narration ([QA-RULES.md](QA-RULES.md) §6). Report what changed afterwards. Note: helper agents get blocked by the safety check on `gh repo create` even with this rule; then the main session creates the repo (the owner approved it) and hands the rest back.

## A. New framework (no harness yet) (owner, 2026-11-20)

1. **Scaffold.** New folder `1-frameworks/<fw>/<ui>/`, copied from the closest existing repo with the same frontend (React → `google-adk/react`, Vue → `google-adk/vue`, Angular → `ag2/angular`). Free ports (never 3000/8000). `bash 2-shared/qa-kit/sync.sh <fw>/<ui>`. Crawl the docs section's sidebar plus in-content links ([QA-RULES.md](QA-RULES.md) §9), one route per page, doc code verbatim, HARNESS edits only. Parallel agents (Opus low, balanced: ~3) may build page groups once the quickstart base runs; one agent owns `assignment.json`, `FINDINGS.md`, servers and commits.
2. **Doc-first audit (rendered page, headless browser).** Click every tab (language, framework, Demo/Code), read every Code-tab file, open every collapsed section, follow every "see X" / "get it from" link and redirect. If the piece is reachable anywhere a reader can click to, it is not a finding. **False ❌ are penalised:** ❌ only for real major blockers (a whole agent/server/frontend nobody gives, guesswork, wrong-framework only, visible failure). Renames, missing imports, helpers, install steps, ports, keys → ✅ + `Note:` or nothing. Threads pages: valid Intelligence key ([QA-RULES.md](QA-RULES.md) §9a). A missed big bug (team ✅, ours a real blocker) is penalised too.
3. **Probe:** `npx tsx ../.qa/tools/probe.mts <ids>` (headless). Pages expected to work: 1 run. Suspected failing pages: 2 runs; both must fail to keep ❌, 1 of 2 = flaky (probe again). A harness failure (server down, wrong port, prompt never sent) is fixed, never a finding.
4. **Statuses and plan the ❌ clips:** statuses (§8/§8a, team doc as anchor, `quickstartBlocked` if §8b), `FINDINGS.md`, `FINDING_EVIDENCE` (checked on the rendered page), Notepad notes, narration scripts and their audio (`narrate.py tts`, local only). Local filming only to diagnose one unclear page (`npm run record -- <id>`).
5. **GitHub:** create the main repo, set its secrets, push. Adapt `.github/workflows/daily.yml` (ports, start commands).
6. **CI films every page:** `gh workflow run daily.yml -R MMMustafakamran/<repo> -f scope=all`. Download the run to `3-output/<date>/runs/<repo>/r<runid>`.
7. **Review ([REVIEW.md](REVIEW.md)):** ✅ clips → Haiku agents, 5 per agent. ❌/⚠️ clips → Opus low agents, 7–10 per agent: does the clip show the expected error?
8. **Act on each verdict ([REVIEW.md](REVIEW.md) §9):** mismatch → re-probe (1 run working, 2 failing); confirmed → update status, finding, evidence, note, narration + audio. Then **edit the clip** (trim, cut the contradicting part, re-mix audio) if it stays natural; **refilm** (`-f pages=<ids>`) only when the edits would be major or complicated. Bad take → fix the recorder, refilm. At most 3 rounds, then report what is still bad.
9. **Upload** every final clip to Loom (❌ narrated mp4, ✅ webm) with **Haiku agents (high effort), 4–5 clips per agent** (owner, 2026-11-20). Each agent uploads its clips and returns `{clip id: share URL}`; it never edits `assignment.json`. The main agent merges the results, runs `apply_loom.py --dry-run` and checks the count against `deliver/manifest.json`, title = clip id exactly, uploaded today, right file (❌ mp4); any mismatch → re-upload that clip, nothing written. Then write the links (`links[].loom`, `links[].filmed` = date), commit, push.
10. **Google Doc:** `build.py` → HTML ([REPORT.md](REPORT.md)) → a **new** Google Doc for the day (REPORT.md §0). Then create the peer repo (see *Two GitHub repos* above).
11. **Report to the owner:** per page status, new findings, new big bugs (team ✅ but ours ❌), Loom count, doc link, open problems.

## B. Testing day (existing framework) (owner, 2026-11-20)

0. **Pending status changes:** if [2-shared/PENDING-STATUS.md](../PENDING-STATUS.md) has rows for an assigned repo, verify and apply them as that file says (before filming), move each to its *Done* table, include them in the report.
1. **Read the docs first, drifted pages first.** `node .qa/tools/drift.mjs --out=drift` per repo; for every drifted page read the rendered page (all tabs, Code tab, links), apply the change to the harness verbatim ([DRIFT.md](DRIFT.md) §3), update expected status, finding, evidence, note, narration + audio by the A2 rules, `drift.mjs --sync=<docPath>`, commit, push.
2. **CI films every page, no probe run:** `gh workflow run daily.yml -R MMMustafakamran/<repo> -f scope=all` (drift on, latest versions; never `ignore_drift` or `use_lockfile` on a normal day, [DRIFT.md](DRIFT.md) §1). Download that day's run(s) only.
3. **Review:** Haiku agents review **every** clip, 5 per agent, with the retest brief ([REVIEW.md](REVIEW.md) §10).
4. **Act on each verdict:** same as A8 (re-probe 1 run working / 2 failing, edit before refilm). A page that newly fails gets its note + audio, then a refilm.
5. **Upload** to Loom only the clips filmed today, same way as A9 (Haiku high, 4–5 clips per agent, main agent checks), overwrite those pages' links, set `links[].filmed`.
6. **Google Doc:** rebuild the HTML from the committed `assignment.json` files, upload as a **new** Google Doc for the day (REPORT.md §0). Re-export the peer repos (`handoff.sh <fw>/<ui>`).
7. **Report:** version change yes/no, drift pages and what was applied, status changes, new big bugs, Loom count, doc links.

## Rules that apply to both

- Never print or commit keys or `.env`. Never ports 3000/8000; port 8000 runs the owner's own app.
- Never hide or fix a doc defect ([QA-RULES.md](QA-RULES.md) §1).
- Don't kill processes you didn't start. A helper agent that is denied a permission reports it to the owner; nobody does it for them.
- Briefs given to sub-agents must point at this file and must not contradict it (no local full filming, no `ignore_drift` on a normal day).
