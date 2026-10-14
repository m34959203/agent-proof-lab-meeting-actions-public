# Changes

2026-10-10: initial Node/browser implementation from the frozen brief.

2026-10-13: prevent approval/export/regeneration from bypassing unsaved edits; disable conflicting controls during mutations. Correct the resulting multi-card save deadlock by preserving unrelated drafts by candidate revision. Record live model limitations and additional producer acceptance checks. No source changes in the third acceptance pass.

## 2026-10-13 keyboard focus correction
Save and approval restore focus to the corresponding card control after re-render. Source, review and export rules unchanged. Automated keyboard downloads verified; no accessibility conformance claim.

## Companion teaching clarification — 2026-10-13

Documented the wrong-card failure and source-aligned review checklist; added the real synthetic example export as a reading aid. Clarified original HTTP harness evidence and limits. Application, tests and frozen prompt/context are unchanged. No new inference, offline import feature or independent acceptance is claimed.

## 2026-10-13 — Independent-review corrections

Reconcile committed storage state and report uncertain durability; close file/directory handles on errors. Add fault-injection and calendar-date tests. Reject incomplete provider output with explicit bounded recovery guidance. Supply the exact missing historical unsaved-edit patch. Live model reproduction remains a separately checked release requirement.

## October 14 — bounded line extraction
Replaced whole-note generation with sequential line requests, exact full-line binding, one shorter invalid-response retry and explicit persisted partial status/failures. Preserved duplicate source lines, nullable dates, edits, approvals and exports. Added line/call/time/concurrency and malformed-response regressions. Live outcome must be checked separately; earlier media and PASS scopes do not cover this change.

## October 14 — locale portability correction (kit 17.2)
The English notes-limit error now explicitly uses en-US formatting. The boundary test checks acceptance at 12,000 characters and the exact message, status 413 and notes_too_large code above the limit. This later kit-only correction does not change extraction, the model, or review/export behavior.

## October 14 — teaching documentation correction (kit 17.3)
Align the guide and illustrative export with the full L0004 source line while keeping the deadline null. Clarify that the adapted example does not promise identical model wording or manual-change provenance. Remove duplicated line-extraction sections from PROMPTS, VALIDATION and this changelog; retain the portability correction and historical failures. No runtime or media change.
