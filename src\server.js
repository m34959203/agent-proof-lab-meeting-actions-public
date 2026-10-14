import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BODY_LIMIT, DATA_DIR, HOST, PORT } from './config.js';
import { extractWithOllama } from './ollama.js';
import { Store } from './store.js';
import { InputError, validateManualCandidate, validateModelPayload } from './validation.js';

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const STATIC_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']]
]);

export function createHandler({ store, extractor = extractWithOllama, port = PORT }) {
  return async function handler(request, response) {
    setSecurityHeaders(response);
    let url;
    try { url = new URL(request.url, `http://${HOST}:${port}`); } catch { return sendError(response, new InputError('Invalid URL.')); }
    try {
      if (url.pathname.startsWith('/api/')) {
        if (!['GET', 'HEAD'].includes(request.method)) validateWriteRequest(request, port);
        return await routeApi(request, response, url, store, extractor);
      }
      if (!['GET', 'HEAD'].includes(request.method)) throw new InputError('Method not allowed.', 405, 'method_not_allowed');
      const entry = STATIC_FILES.get(url.pathname);
      if (!entry || url.search || url.pathname.includes('..')) throw new InputError('Not found.', 404, 'not_found');
      const body = await fs.readFile(path.join(PUBLIC_DIR, entry[0]));
      response.writeHead(200, { 'content-type': entry[1], 'content-length': body.length, 'cache-control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) { sendError(response, error); }
  };
}

async function routeApi(request, response, url, store, extractor) {
  if (request.method === 'GET' && url.pathname === '/api/state') return sendJson(response, 200, publicState(store.snapshot()));
  if (request.method === 'PUT' && url.pathname === '/api/notes') {
    const body = await readJson(request);
    await store.saveNotes(body.text, body.expectedVersion);
    return sendJson(response, 200, publicState(store.snapshot()));
  }
  if (request.method === 'POST' && url.pathname === '/api/extractions') {
    const body = await readJson(request);
    const start = store.snapshot();
    if (!start.notes.text) throw new InputError('Save notes before extracting.', 422, 'empty_notes');
    if (body.sourceVersion !== start.notes.version) throw new InputError('The requested note version is stale.', 409, 'stale_result');
    if (start.candidates.length && body.replaceConfirmed !== true) {
      throw new InputError('Existing candidates require explicit replacement confirmation.', 409, 'replace_confirmation_required');
    }
    const modelPayload = await extractor(start.notes);
    const checked = validateModelPayload(modelPayload, start.notes);
    await store.transact((next) => {
      if (next.revision !== start.revision || next.notes.version !== start.notes.version) {
        throw new InputError('The source or review changed while extraction was running. The late result was discarded.', 409, 'stale_result');
      }
      next.candidates = checked.accepted.map((candidate) => ({
        id: crypto.randomUUID(), sourceVersion: next.notes.version, revision: 1, ...candidate,
        approved: false, approvedAt: null, manualFields: [], modelOriginal: structuredClone(candidate)
      }));
      const failures = (modelPayload.lineResults || []).filter(line => line.status === 'failed');
      next.rejectedCandidates = [...checked.rejected, ...failures];
      next.extraction = {
        lineResults: modelPayload.lineResults || [], calls: modelPayload.calls ?? null,
        partial: failures.length > 0,
        status: failures.length ? 'partial' : checked.accepted.length ? 'review' : checked.rejected.length ? 'rejected' : 'no_tasks',
        message: failures.length ? `Partial extraction: ${checked.accepted.length} candidates; ${failures.length} source lines failed or were skipped. Inspect the line failures below; this is not a complete extraction.` : checked.accepted.length ? `${checked.accepted.length} candidate${checked.accepted.length === 1 ? '' : 's'} ready for review.` : checked.rejected.length ? 'No supported candidates remained after evidence validation.' : 'The model returned no task candidates.',
        sourceVersion: next.notes.version, completedAt: new Date().toISOString()
      };
    });
    return sendJson(response, 200, publicState(store.snapshot()));
  }
  const editMatch = url.pathname.match(/^\/api\/candidates\/([0-9a-f-]+)$/);
  if (request.method === 'PUT' && editMatch) {
    const body = await readJson(request);
    const values = validateManualCandidate(body);
    await store.transact((next) => {
      const candidate = currentCandidate(next, editMatch[1], body);
      const manualFields = ['action', 'owner', 'dueDate'].filter((field) => values[field] !== candidate.modelOriginal[field]);
      candidate.action = values.action;
      candidate.owner = values.owner;
      candidate.dueDate = values.dueDate;
      if (manualFields.includes('owner')) candidate.ownerEvidence = null;
      if (manualFields.includes('dueDate')) candidate.dueDateEvidence = null;
      candidate.manualFields = manualFields;
      candidate.approved = false;
      candidate.approvedAt = null;
      candidate.revision += 1;
    });
    return sendJson(response, 200, publicState(store.snapshot()));
  }
  const approveMatch = url.pathname.match(/^\/api\/candidates\/([0-9a-f-]+)\/approval$/);
  if (request.method === 'PUT' && approveMatch) {
    const body = await readJson(request);
    await store.transact((next) => {
      const candidate = currentCandidate(next, approveMatch[1], body);
      if (typeof body.approved !== 'boolean') throw new InputError('approved must be true or false.');
      candidate.approved = body.approved;
      candidate.approvedAt = body.approved ? new Date().toISOString() : null;
      candidate.revision += 1;
    });
    return sendJson(response, 200, publicState(store.snapshot()));
  }
  if (request.method === 'GET' && (url.pathname === '/api/export.json' || url.pathname === '/api/export.md')) {
    const format = url.pathname.endsWith('.json') ? 'json' : 'markdown';
    const exported = buildExport(store.snapshot(), format);
    if (!exported.count) throw new InputError('Nothing to export. Approve at least one current-version candidate.', 409, 'empty_export');
    response.writeHead(200, {
      'content-type': format === 'json' ? 'application/json; charset=utf-8' : 'text/markdown; charset=utf-8',
      'content-disposition': `attachment; filename="meeting-actions.${format === 'json' ? 'json' : 'md'}"`,
      'cache-control': 'no-store'
    });
    return response.end(exported.body);
  }
  throw new InputError('Not found.', 404, 'not_found');
}

function currentCandidate(state, id, body) {
  const candidate = state.candidates.find((item) => item.id === id);
  if (!candidate) throw new InputError('Candidate not found.', 404, 'not_found');
  if (body.sourceVersion !== state.notes.version || candidate.sourceVersion !== state.notes.version) throw new InputError('This candidate belongs to an old note version.', 409, 'stale_result');
  if (body.candidateRevision !== candidate.revision) throw new InputError('This candidate changed. Reload before continuing.', 409, 'version_conflict');
  return candidate;
}

function buildExport(state, format) {
  const tasks = state.candidates.filter((task) => task.approved && task.sourceVersion === state.notes.version).map((task) => ({
    id: task.id, action: task.action, owner: task.owner, dueDate: task.dueDate,
    evidence: { lineId: task.sourceLineId, quote: task.sourceQuote, ownerQuote: task.ownerEvidence, dueDateQuote: task.dueDateEvidence },
    provenance: { sourceVersion: task.sourceVersion, modelSuggested: true, manuallyChangedFields: task.manualFields, approvedAt: task.approvedAt }
  }));
  if (format === 'json') return { count: tasks.length, body: `${JSON.stringify({ exportedAt: new Date().toISOString(), sourceVersion: state.notes.version, tasks }, null, 2)}\n` };
  const safe = (value) => value === null ? 'Unknown' : String(value).replace(/[|\r\n]/g, (char) => char === '|' ? '\\|' : ' ');
  const rows = tasks.map((task) => `| ${safe(task.action)} | ${safe(task.owner)} | ${safe(task.dueDate)} | ${safe(task.evidence.lineId)}: “${safe(task.evidence.quote)}” | ${task.provenance.manuallyChangedFields.length ? `Manual: ${task.provenance.manuallyChangedFields.join(', ')}` : 'Model suggestion, reviewed'} |`);
  return { count: tasks.length, body: `# Reviewed meeting actions\n\nSource version: ${state.notes.version}\n\n| Action | Owner | Due | Original evidence | Provenance |\n|---|---|---|---|---|\n${rows.join('\n')}\n` };
}

function validateWriteRequest(request, port) {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new InputError('Writes require application/json.', 415, 'unsupported_media_type');
  const origin = request.headers.origin;
  if (origin !== `http://${HOST}:${port}`) throw new InputError('Cross-origin or missing-origin write rejected.', 403, 'origin_rejected');
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw new InputError(`Request body exceeds ${BODY_LIMIT} bytes.`, 413, 'body_too_large');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new InputError('Request body is not valid JSON.'); }
}

function publicState(state) { return state; }
function sendJson(response, status, value) { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); response.end(JSON.stringify(value)); }
function sendError(response, error) {
  const known = error instanceof InputError;
  sendJson(response, known ? error.status : 500, { error: { code: known ? error.code : 'internal_error', message: known ? error.message : 'Unexpected server error.' }, ...(known && error.committedState ? { committedState: error.committedState } : {}) });
}
function setSecurityHeaders(response) {
  response.setHeader('content-security-policy', "default-src 'self'; connect-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('referrer-policy', 'no-referrer');
}

export async function start() {
  const store = new Store(DATA_DIR);
  await store.init();
  const server = http.createServer(createHandler({ store, port: PORT }));
  server.listen(PORT, HOST, () => console.log(`Meeting Action Board: http://${HOST}:${PORT}`));
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  start().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
