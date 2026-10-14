import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { extractWithOllama } from '../src/ollama.js';
import { createHandler } from '../src/server.js';
import { Store } from '../src/store.js';
import { validateModelPayload, validateNotes } from '../src/validation.js';

const notesText = 'Avery will publish the review guide by 2026-10-18.\nSomeone should check the labels next week.';

test('store versions source, invalidates review, persists approved edits across restart, and preserves state on failed writes', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'meeting-board-store-'));
  const store = new Store(directory);
  await store.init();
  await store.saveNotes(notesText, 0);
  await store.transact((next) => {
    next.candidates = [{ id: 'abc', sourceVersion: 1, revision: 1, action: 'Publish guide', owner: 'Avery', dueDate: '2026-10-18', sourceLineId: 'L0001', sourceQuote: 'Avery will publish the review guide by 2026-10-18.', ownerEvidence: 'Avery', dueDateEvidence: '2026-10-18', warnings: [], approved: true, approvedAt: '2026-10-10T00:00:00.000Z', manualFields: ['action'], modelOriginal: {} }];
  });
  const restarted = new Store(directory);
  await restarted.init();
  assert.equal(restarted.snapshot().candidates[0].approved, true);
  assert.deepEqual(restarted.snapshot().candidates[0].manualFields, ['action']);
  await restarted.saveNotes(`${notesText}\nA new source line.`, 1);
  assert.equal(restarted.snapshot().notes.version, 2);
  assert.deepEqual(restarted.snapshot().candidates, []);
  const before = restarted.snapshot();
  restarted.persist = async () => { throw new Error('test-double disk failure'); };
  await assert.rejects(restarted.saveNotes('A valid replacement.', 2), /test-double disk failure/);
  assert.deepEqual(restarted.snapshot(), before);
});

test('model validation separates bad references, clears unsupported fields, preserves duplicates, and accepts empty tasks', () => {
  const notes = { lines: [
    { id: 'L0001', text: 'Avery will publish the review guide by 2026-10-18.' },
    { id: 'L0002', text: 'Someone should check the labels next week.' }
  ] };
  const result = validateModelPayload({ tasks: [
    { action: 'Publish guide', sourceLineId: 'L0001', sourceQuote: 'publish the review guide', owner: { value: 'Avery', evidence: 'Avery' }, dueDate: { value: '2026-10-18', evidence: '2026-10-18' } },
    { action: 'Publish guide', sourceLineId: 'L0001', sourceQuote: 'publish the review guide', owner: { value: 'Avery', evidence: 'Avery' }, dueDate: { value: '2026-10-18', evidence: '2026-10-18' } },
    { action: 'Check labels', sourceLineId: 'L0002', sourceQuote: 'check the labels', owner: { value: 'Taylor', evidence: 'Someone' }, dueDate: { value: 'next week', evidence: 'next week' } },
    { action: 'Invented', sourceLineId: 'L9999', sourceQuote: 'Invented', owner: null, dueDate: null }
  ] }, notes);
  assert.equal(result.accepted.length, 3, 'duplicate suggestions remain visible');
  assert.equal(result.rejected.length, 1);
  assert.equal(result.accepted[2].owner, null);
  assert.equal(result.accepted[2].dueDate, null);
  assert.equal(result.accepted[2].warnings.length, 2);
  assert.deepEqual(validateModelPayload({ tasks: [] }, notes), { accepted: [], rejected: [] });
  assert.throws(() => validateModelPayload({ nope: [] }, notes), /tasks array/);
  assert.throws(() => validateModelPayload({ tasks: Array.from({ length: 31 }, () => ({})) }, notes), /more than 30/);
  assert.equal(validateNotes('x'.repeat(12_000))[0].text.length, 12_000);
  assert.throws(() => validateNotes('x'.repeat(12_001)), {
    message: 'Notes exceed 12,000 characters.',
    status: 413,
    code: 'notes_too_large'
  });
  assert.throws(() => validateNotes(Array.from({ length: 201 }, () => 'line').join('\n')), /200 lines/);
});

test('HTTP workflow rejects cross-origin/traversal, requires replacement, clears approval on edit, and exports reviewed current tasks', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'meeting-board-http-'));
  const store = new Store(directory); await store.init();
  const extractorTestDouble = async () => ({ lineResults: [{sourceLineId:'L0002',sourceQuote:'Someone should check the labels next week.',status:'failed',reason:'Provider returned invalid output.',attempts:2}], calls:3, tasks: [{ action: 'Publish the review guide', sourceLineId: 'L0001', sourceQuote: 'Avery will publish the review guide by 2026-10-18.', owner: { value: 'Avery', evidence: 'Avery' }, dueDate: { value: '2026-10-18', evidence: '2026-10-18' } }] });
  const handler = createHandler({ store, extractor: extractorTestDouble, port: 0 });
  const write = (pathname, method, body, origin = 'http://127.0.0.1:0') => invoke(handler, { pathname, method, body, origin });
  assert.equal((await write('/api/notes', 'PUT', { text: notesText, expectedVersion: 0 }, 'https://attacker.invalid')).status, 403);
  assert.equal((await invoke(handler, { pathname: '/../BRIEF.md' })).status, 404);
  const saved = await write('/api/notes', 'PUT', { text: notesText, expectedVersion: 0 });
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  let response = await write('/api/extractions', 'POST', { sourceVersion: 1, replaceConfirmed: false });
  assert.equal(response.status, 200);
  let current = response.json;
  assert.equal(current.extraction.status, 'partial');
  assert.equal(current.extraction.partial, true);
  assert.match(current.extraction.message, /1 source lines failed/);
  assert.equal(current.rejectedCandidates[0].sourceLineId, 'L0002');
  const candidate = current.candidates[0];
  response = await write(`/api/candidates/${candidate.id}/approval`, 'PUT', { approved: true, sourceVersion: 1, candidateRevision: 1 });
  current = response.json;
  assert.equal(current.candidates[0].approved, true);
  response = await write(`/api/candidates/${candidate.id}`, 'PUT', { action: 'Publish final guide', owner: '', dueDate: '', sourceVersion: 1, candidateRevision: 2 });
  current = response.json;
  assert.equal(current.candidates[0].approved, false);
  assert.deepEqual(current.candidates[0].manualFields.sort(), ['action', 'dueDate', 'owner']);
  assert.equal((await invoke(handler, { pathname: '/api/export.json' })).status, 409);
  await write(`/api/candidates/${candidate.id}/approval`, 'PUT', { approved: true, sourceVersion: 1, candidateRevision: 3 });
  const exported = (await invoke(handler, { pathname: '/api/export.json' })).json;
  assert.equal(exported.tasks.length, 1);
  assert.equal(exported.tasks[0].action, 'Publish final guide');
  assert.deepEqual(exported.tasks[0].provenance.manuallyChangedFields.sort(), ['action', 'dueDate', 'owner']);
  response = await write('/api/extractions', 'POST', { sourceVersion: 1, replaceConfirmed: false });
  assert.equal(response.status, 409);
  assert.equal(response.json.error.code, 'replace_confirmation_required');
});

test('late extraction test double cannot overwrite a newer source version', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'meeting-board-stale-'));
  const store = new Store(directory); await store.init(); await store.saveNotes(notesText, 0);
  let release;
  const extractorTestDouble = () => new Promise((resolve) => { release = resolve; });
  const handler = createHandler({ store, extractor: extractorTestDouble, port: 0 });
  const write = (pathname, body) => invoke(handler, { pathname, method: pathname === '/api/notes' ? 'PUT' : 'POST', body });
  const pending = write('/api/extractions', { sourceVersion: 1, replaceConfirmed: false });
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await write('/api/notes', { text: `${notesText}\nNew decision.`, expectedVersion: 1 })).status, 200);
  release({ tasks: [] });
  const late = await pending;
  assert.equal(late.status, 409);
  assert.equal(late.json.error.code, 'stale_result');
  assert.equal(store.snapshot().notes.version, 2);
  assert.deepEqual(store.snapshot().candidates, []);
});

function invoke(handler, { pathname, method = 'GET', body, origin = 'http://127.0.0.1:0' }) {
  const request = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  request.url = pathname;
  request.method = method;
  request.headers = body === undefined ? {} : { 'content-type': 'application/json', origin };
  return new Promise((resolve, reject) => {
    const headers = {};
    const chunks = [];
    const response = {
      setHeader(name, value) { headers[name] = value; },
      writeHead(status, values = {}) { this.statusCode = status; Object.assign(headers, values); },
      end(chunk) {
        if (chunk) chunks.push(Buffer.from(chunk));
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        if (headers['content-type']?.startsWith('application/json')) json = JSON.parse(text);
        resolve({ status: this.statusCode, headers, text, json });
      }
    };
    Promise.resolve(handler(request, response)).catch(reject);
  });
}
