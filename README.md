# Meeting Action Board

A local, single-user review tool for turning non-sensitive meeting notes into evidence-linked candidate actions. A configured Ollama model proposes candidates; the user inspects exact source text, edits fields, explicitly approves rows, and exports only approved rows from the current note version.

This is a loopback review utility, not a hosted or collaborative service. Localhost is not authentication. Do not expose the port to a network.

## Requirements

- Node.js 22
- A separately installed Ollama service already running at exactly `http://127.0.0.1:11434`
- The already available model `gemma4:26b-a4b-it-qat`

The app installs no dependencies and does not download a model. Browser code cannot choose a model URL. The only outbound application request is the server's pinned loopback Ollama request.

## Start

```sh
cp .env.example .env
npm start
```

Open `http://127.0.0.1:4317`. To try the supplied original synthetic data, paste the contents of `fixtures/synthetic-notes.txt`, save the source version, then extract.

Environment values are optional. Security-sensitive model settings are validated: `OLLAMA_URL` must remain `http://127.0.0.1:11434` and `OLLAMA_MODEL` must remain `gemma4:26b-a4b-it-qat`. `PORT` controls the loopback port; `DATA_DIR` controls the runtime-state directory.

Runtime state defaults to `./data/state.json`. The directory is gitignored and is not part of a public kit. Saves use a same-directory temporary file, file sync, atomic rename, and directory sync. Stop and start the app to verify persistence.

## Review contract

1. Saving changed notes creates a new version with stable IDs (`L0001`, `L0002`, …) for that version. It invalidates earlier candidates and approvals.
2. Extraction sends one non-empty source line at a time to the pinned local model, requesting one nullable candidate tied to that exact full line and ID. Put each action on a separate line. Limits: 500 characters per line, 30 eligible lines, 60 calls total, 120 seconds overall, 15 seconds per call, 700 tokens initially and 450 on the one allowed shorter retry for invalid/incomplete output. Blank lines are ignored. Oversized, excess, failed and timed-out lines remain in the visible failure list. Partial results are not complete extraction; edit/split notes and save a new version before trying again.
3. A candidate is reviewable only when its source ID exists and its quote is an exact substring of that line. Invalid candidates stay in a separate rejection list. Exact matching is evidence for inspection, not proof that the interpretation is true.
4. Owner and date remain unknown unless supported by quoted text on the cited line. Dates must be valid calendar dates in explicit `YYYY-MM-DD` format; relative phrases such as “next week” are never resolved. Unsupported values are cleared with a warning.
5. Editing any candidate clears approval. Regeneration requires explicit replacement confirmation. A response arriving after any source or review change is discarded.
6. JSON and Markdown exports contain only approved candidates tied to the current source version, their original evidence, and manual-change provenance.

All UI text is inserted as text, not HTML. Writes require JSON and the exact loopback page origin, bodies are capped at 64 KiB, notes are capped at 12,000 characters/200 lines, static files use an allowlist, and arbitrary paths are never served.

## Tests

```sh
npm test
```

The tests cover atomic persistence/restart, pre-commit storage failure preservation and post-commit state reconciliation, note invalidation, evidence rejection and field clearing, duplicate preservation, empty and malformed model output, the pinned model request, write-origin and traversal rejection, edit/approval/export behavior, replacement confirmation, and stale in-flight results.

The model and fetch substitutes in tests are explicitly named test doubles. Tests do not claim live inference. To verify live inference separately, start the existing Ollama service and app, use only the synthetic fixture, extract once, and record the actual observed provider result without saving raw streams in source control.

## Limits

- No accounts, collaboration, uploads, microphone, integrations, messages, analytics, or autonomous deadline inference.
- No semantic correctness guarantee: every candidate requires human review.
- Author tests are not independent acceptance, human usability validation, production-readiness evidence, or publication.
- The controller's separate release review, view checks, and live-model verification remain outside this build.

## Draft companion scope and observed behavior

This is a local review candidate, not a published kit. Run the final checkpoint with the start command above. Bash was used for the recorded build. The optional copy command in PowerShell is `Copy-Item .env.example .env`; this alternative has not been tested in PowerShell. `npm start` uses the same Node script. If the required local model is absent, do not treat author tests as live extraction; the app will report provider unavailability. This kit does not provide an offline fixture-import user route.

A historical pre-correction synthetic-note run returned three candidates and two rejections. This is not evidence for the current line-extraction version. Two accepted suggestions had generic, identical action text; correct wording from the displayed source and approve only the useful entries. Leave duplicate or unsupported proposals unapproved. Missing dates stay blank; the app does not infer “next week.” Inspect each owner/date yourself before approval. JSON and Markdown exports include approved rows only.

Practical check: edit two cards, save the first, confirm the second draft survives, save the second, then approve one and export. Reload and restart to confirm saved changes persist. Changing the source invalidates all earlier approvals. Saving an edited candidate clears its approval.

See PROMPTS.md for real build inputs and disclosed footage gaps; CHANGELOG.md for repairs; TOOLS.md for versions and cost limits. The final film and independent video-plus-kit reproduction are still pending. This source kit alone is not proof of a complete build-along.

See [the source-alignment and keyboard checks](teaching/REVIEW-CHECKS.md) for the concrete review path and a preserved wrong-card testing failure. The example JSON is for inspection only; the app does not import it.

## Review corrections and provider recovery

The subsequent review found a save-boundary bug: a directory sync can fail after rename has committed new data. Before rename, an error preserves the previous state. After rename, the app now reports that the change committed but durability is uncertain, refreshes memory and the browser to the committed state, and closes open handles. Stop to check local storage if this occurs; power-loss durability was not demonstrated. Fault-injection tests cover both sides of the commit boundary and a subsequent successful save.

The exact installed model previously returned truncated JSON in two clean-kit browser attempts. This version replaces the whole-note response with bounded per-line requests. Each invalid or incomplete response gets at most one shorter retry; JSON is never repaired. Transport errors are not retried. Every failed line is retained with its source and reason, and any incomplete batch is marked Partial extraction, including after reload. Successful lines remain reviewable, but are not proof of complete extraction. Saving notes, editing and approval still use the original versioned commit boundary. The live main result and the exact video-plus-kit path require fresh verification; deterministic test doubles do not prove live success. No identical model output is promised.

Manual dates now reject impossible calendar dates. Unsupported model dates are cleared with a warning. These corrections are later than the recorded film; see the dated prompt/change ledger and retained review-corrections patch. Historical source-edit gaps remain disclosed.
