# Check meaning as well as mechanics

The recorded build used Linux Bash and Codex CLI. Later browser scenes use saved live-model output and automated keyboard input; they are not fresh inference or human usability tests. The app has no offline import route. The example export in this folder is an illustrative reading aid adapted to the current full-line evidence contract, not an importable fixture or an unchanged captured export. Its sample IDs, timestamps and manual-change provenance are illustrative. It does not promise identical nondeterministic model wording or the same manual edits in your run.

## Reproduce the useful result

Start the app using the README and the already available local model. Paste the supplied synthetic notes, save them, and extract candidates. Read the rejection list too. Actual extraction may differ from the recorded three candidates and two rejections.

Find a candidate whose original source is L0004 and whose quote is “Jordan agreed to verify the staging rollback steps; no deadline was set.”. Inspect the full line: no deadline was set. If your model does not propose this candidate, do not put this action on a different source card to force the example to match. Record the difference and inspect the candidates that were actually returned; an identical result is not guaranteed.

On the matching card, use the action “Verify the staging rollback steps”, owner “Jordan”, and a blank deadline. Save edits, then approve. Leave duplicate suggestions unapproved. Use Tab and Enter through the controls; after saving, focus should remain on Save edits, and after approval on Clear approval. Download JSON and Markdown. Inspect the actual files: only approved current-version tasks should appear, with the right source quote and manual-change provenance. Compare meaning, not random IDs or timestamps, with source-aligned-export.example.json.

Edit an approved task again and save it. Its approval must clear. Approve it again deliberately before exporting. Reload and restart to check persistence. Edit two cards and save one: the other unsaved draft must remain. Saving changed source notes invalidates old candidates and approvals.

## The failure our keyboard check missed

An earlier automated take assigned Jordan’s action to a card citing Maya’s L0007 quote. Keyboard focus and download mechanics passed, but the action and evidence did not agree. That take is not evidence of a source-supported task. The corrected teaching take selects L0004 and checks both action and evidence in the actual export.

The application validates source references and records manual changes. It does not semantically verify arbitrary manual edits. Before approval, read the action, owner, date and source quote together. A successful download and an exact quote match are insufficient checks of meaning.

## What the original HTTP failure establishes

The original terminal evidence records an assertion of 400 instead of 200, followed by a request-harness change from JSON string chunks to Buffer chunks. Current readJson combines chunks with Buffer.concat; the test harness now uses Buffer.from(JSON.stringify(body)). This supports a harness mismatch diagnosis, not a demonstrated production HTTP defect. The earlier test-process failure has no established cause in the selected evidence. Five original author tests later passed; browser and live-model checks were separate.

Corrections 01 and 02 lack visible source-edit footage. Their retained patches and browser results do not fill that recording gap. The partial rough cut, this guide and author checks are not independent acceptance or a completed viewer-path reproduction.
