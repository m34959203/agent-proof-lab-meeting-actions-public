# Meeting Action Board — frozen original brief

For an independent builder reviewing their own non-sensitive meeting notes: extract candidate actions, inspect each original source line, correct, approve, save and export a reviewed list. All included notes are original synthetic US-English data. This is a single-user loopback application, not a collaborative or production-ready service.

Use Node 22 built-ins and browser HTML/CSS/JavaScript. No runtime package downloads. Call only the existing explicitly configured loopback Ollama model. Keep inference and manual review separate; a deterministic fixture is never labeled live AI. Do not send any external messages.

Required: versioned note text and stable line IDs; model task proposals with exact source quotes; nullable owner/date with exact supporting text; validate references and reject invented quotes; show uncertainty rather than promise semantic correctness. Do not infer relative dates or owner names. A review action is required before export. Manual changes clear approval. Regeneration offers replacement only with explicit confirmation and cannot overwrite edits from a stale response. Changing notes invalidates old proposals/approvals. Preserve saved state across restart using atomic local JSON writes. Export only approved current-version tasks as JSON and Markdown. Include original evidence and distinguish manual changes from model suggestions.

Visible states: empty notes, extracting, candidate review, unsaved edit, approved, no tasks, rejected response, provider unavailable, storage failure. Escape all text. Bind server to loopback; validate origin/content type/body limits on writes, deny traversal, expose no arbitrary model URL or filesystem path. Input limits: 12,000 characters, 200 lines, 30 tasks; reject oversize without losing saved state. No accounts; localhost is not authentication, never expose this app as a hosted service.

No microphone, transcript import service, calendar, Slack, email, webhooks, analytics collection, uploaded personal data, paid APIs or downloaded models. No identical-model-output, hallucination-proof, offline-everywhere, production-ready or commercial-demand promise.

Actual coding prompts and context/checkpoints must be recorded from the first implementation change. No source code is included in this preflight. Keep all raw model streams private. Source-page case provenance stays in internal research; product and viewer brief are original.
