# tools/

CI steps shared by every repo (run from the repo root, from its synced `.qa/tools/`).

| Tool | Job | What it does |
|---|---|---|
| `drift.mjs` | plan | Doc drift vs `doc-snapshot/`; holds changed pages ([DRIFT.md](../../instructions/DRIFT.md)). |
| `versions.mjs` | plan | What a new reader installs today: `@copilotkit/*` / `@ag-ui/*` (npm) and `copilotkit` / `ag-ui-*` (PyPI) at latest, set in a CI copy of package.json / pyproject.toml; everything else re-resolved within its range. Writes `resolved/` (copied over each shard's checkout) and `versions.md` (committed vs installed vs latest). Skipped with `use_lockfile`. |
| `evidence_check.mjs` | plan, after drift | Every `FINDING_EVIDENCE` text (from `autorecorder/actions/*.ts`) must be in the live page's server-rendered HTML (scripts / RSC payload ignored: they hold code the reader never sees). Missing → page held; `plan-out/evidence.json`. Tool or fetch fault → warn, record anyway. `--dump=f.json` writes the page table for `gate.py`; `--evidence=t.json` tests the matcher. |
| `gate.py` | record, after Record | Finding clips (evidence or `demoMayError`) need `evidence` mark + all `evidence` checkpoints ok + `notepad` + `notepad-closed`. Failures retaken once, then `::warning::` + summary table. The `failure` mark is expected. |
| `ci_post.py` | record / report | Narration fit/mix + clip checks + run summary. |
| `probe.mts` | local | Fast probe (AUTORECORDER.md §0): runs each page through the repo's engine in fast mode (`RecordingEngine(root, { fast: true }).probePage`), one process per page, so the page's own action and checkpoints decide. `--repeat N` (pass / fail / flaky), `--warm`, `--health` (down → `setup-failed`, exit 3), `--parallel`, `--headed`, `--prompt`, `--route`, `--wait`. Writes `videos/probe/<id>/{final.png,failure.png,result.json,probe.log}` and `videos/probe/summary.{json,md}`. |
| `warm_graphs.py` | CI | Warms LangGraph graphs before recording. |
