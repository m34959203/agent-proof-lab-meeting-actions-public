# Producer validation — 2026-10-13

Eight test groups passed after a clean offline install, including actual disk faults before/after rename, handle closure, subsequent save and calendar/leap-year validation. Tests use labeled faults and model substitutes; they are not inference.

The real browser journey from a clean archive saved the supplied notes, then failed both allowed live extraction attempts with the installed exact model. No candidates were returned, so the main live edit/approve/export result was NOT reproduced in this pass. No private payload was injected as a substitute. Saved state survived both failures and a new store load.

A separate browser fault-injection check confirmed that post-rename directory-sync failure displays a committed-but-durability-uncertain warning, refreshes the source version and text, matches the file on disk, and permits a later successful save. This is not a power-loss simulation.

The model service itself was not modified or restarted. No new model, dependency or credential was installed. Independent exact-video-plus-kit reproduction remains blocked pending a working live provider response. This candidate is not release-approved.

Final follow-up: non-string date rejection was added and all eight test groups rerun from a fresh final archive. The live browser attempt above used the immediately preceding candidate; the only subsequent runtime change is the date-type guard. No additional live success or final exact-video-plus-kit acceptance is claimed.

## Current line-extraction candidate
Run npm test for deterministic regression checks. For live verification use fixtures/synthetic-notes.txt in a fresh app data directory. Save, extract, inspect Jordan’s actual source quote with an unknown deadline, edit action, save edits, approve, export JSON and Markdown, then reload and restart. Repeat from another clean extraction of this kit. An absent live candidate is BLOCK, not permission to substitute a fixture. Partial results must list every failed/skipped source line. Independent review and changed media are pending.

Observed producer result: the first per-line version returned parseable JSON but omitted Jordan in both clean-kit attempts. After the prompt clarification, two clean-kit browser runs returned the explicit Jordan action with exact source text and a null deadline; edit, approval, approved-only JSON/Markdown export and persisted state checks passed. A separately labeled test-double browser check verified a partial batch with one failed line, bounded retry and reload disclosure. These are producer checks on synthetic notes, not independent acceptance or a model-reliability estimate.

## Locale portability verification for kit 17.2
The prior kit failed one of 13 test groups under ru_RU.UTF-8. To verify this correction, extract the exact kit into two fresh directories. In one Bash session run `LANG=ru_RU.UTF-8 LC_ALL=ru_RU.UTF-8 npm ci --ignore-scripts` followed by `LANG=ru_RU.UTF-8 LC_ALL=ru_RU.UTF-8 npm test`; in the other use C.UTF-8 for both variables. The English error must read `Notes exceed 12,000 characters.` with status 413 and code notes_too_large. These are deterministic producer checks; they do not replace independent video-plus-kit reproduction or a live model test.

## Documentation correction verification for kit 17.3
The guide and illustrative export now use the entire exact L0004 line, with a null deadline. Duplicate correction sections were removed. Clean installs and all 13 deterministic test groups passed in each of ru_RU.UTF-8 and C.UTF-8 for this exact archive. No live inference was repeated for this documentation-only change. Fresh independent exact-bundle review remains required; prior reviews do not approve this archive.
