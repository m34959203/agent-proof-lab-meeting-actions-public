const elements = {
  notes: document.querySelector('#notes-input'), count: document.querySelector('#notes-count'), version: document.querySelector('#version'),
  save: document.querySelector('#save'), extract: document.querySelector('#extract'), status: document.querySelector('#status'),
  list: document.querySelector('#candidate-list'), empty: document.querySelector('#empty'), summary: document.querySelector('#summary'), rejected: document.querySelector('#rejected')
};
let state;
let busy = false;
const dirtyCandidates = new Set();

elements.notes.addEventListener('input', () => { updateCount(); renderTop(); });
elements.save.addEventListener('click', saveNotes);
elements.extract.addEventListener('click', extract);
document.querySelectorAll('.export').forEach((button) => button.addEventListener('click', () => exportFile(button.dataset.format)));

await refresh();

async function refresh() {
  try {
    state = await api('/api/state');
    elements.notes.value = state.notes.text;
    updateCount(); render();
  } catch (error) { showStatus(error.message, true); }
}

function updateCount() {
  const lineCount = elements.notes.value.split(/\r?\n/).length;
  elements.count.textContent = `${elements.notes.value.length.toLocaleString()} / 12,000 · ${lineCount} / 200 lines`;
}

function hasUnsavedNotes() { return Boolean(state) && elements.notes.value !== state.notes.text; }
function renderTop() {
  if (!state) return;
  elements.version.textContent = state.notes.version ? `Version ${state.notes.version}${hasUnsavedNotes() ? ' · unsaved edit' : ' · saved'}` : 'Version 0 · not saved';
  elements.save.disabled = busy || !hasUnsavedNotes();
  elements.extract.disabled = busy || hasUnsavedNotes() || !state.notes.text;
  elements.extract.firstChild.textContent = state.candidates.length ? 'Regenerate candidates ' : 'Extract candidates ';
}

function render() {
  renderTop();
  // Keep drafts only for candidates whose saved revision has not changed.
  // A successful save advances that card's revision; unrelated drafts survive.
  const drafts = new Map([...elements.list.querySelectorAll('.candidate-card')]
    .filter(card => dirtyCandidates.has(card.dataset.id))
    .map(card => [card.dataset.id, {
      revision: Number(card.dataset.revision),
      fields: Object.fromEntries([...card.querySelectorAll('input')].map(input => [input.name, input.value]))
    }]));
  dirtyCandidates.clear();
  elements.list.replaceChildren();
  state.candidates.forEach((candidate, index) => {
    const draft = drafts.get(candidate.id);
    elements.list.append(candidateCard(candidate, index, draft?.revision === candidate.revision ? draft.fields : null));
  });
  const approved = state.candidates.filter((candidate) => candidate.approved).length;
  elements.summary.textContent = state.candidates.length ? `${approved} approved · ${state.candidates.length - approved} awaiting review` : 'No candidates';
  elements.empty.hidden = state.candidates.length > 0;
  if (!state.candidates.length && state.extraction.status === 'no_tasks') {
    elements.empty.querySelector('h3').textContent = 'No tasks found';
    elements.empty.querySelector('p').textContent = 'The model returned an empty task list. Your saved notes are unchanged.';
  } else if (!state.candidates.length && state.extraction.status === 'rejected') {
    elements.empty.querySelector('h3').textContent = 'Response rejected';
    elements.empty.querySelector('p').textContent = 'No candidates passed exact source validation.';
  } else {
    elements.empty.querySelector('h3').textContent = 'No candidates yet';
    elements.empty.querySelector('p').textContent = state.notes.text ? 'Extract candidate actions when you are ready.' : 'Save your meeting notes, then extract candidate actions for review.';
  }
  renderRejected();
  if (state.extraction.partial) showStatus(state.extraction.message, true);
}

function candidateCard(candidate, index, draft = null) {
  const card = node('article', 'candidate-card');
  card.dataset.id = candidate.id;
  card.dataset.revision = candidate.revision;
  card.setAttribute('aria-labelledby', `candidate-title-${candidate.id}`);
  const head = node('div', 'candidate-head');
  const number = node('span', 'candidate-number', `Candidate ${String(index + 1).padStart(2, '0')}`);
  number.id = `candidate-title-${candidate.id}`;
  head.append(number, node('span', `state-chip${candidate.approved ? ' approved' : ''}`, candidate.approved ? 'Approved' : 'Needs review'));
  const body = node('div', 'candidate-body');
  const fields = node('div', 'candidate-fields');
  const action = field('Action', candidate.action, 'action');
  const owner = field('Owner · blank means unknown', candidate.owner ?? '', 'owner');
  const due = field('Due date · blank means unknown', candidate.dueDate ?? '', 'dueDate');
  const chip = head.querySelector('.state-chip');
  const trackEdit = () => {
    const changed = action.input.value !== candidate.action || (owner.input.value || null) !== candidate.owner || (due.input.value || null) !== candidate.dueDate;
    if (changed) dirtyCandidates.add(candidate.id); else dirtyCandidates.delete(candidate.id);
    chip.textContent = changed ? 'Unsaved edit' : candidate.approved ? 'Approved' : 'Needs review';
    chip.classList.toggle('approved', !changed && candidate.approved);
  };
  [action.input, owner.input, due.input].forEach((input) => input.addEventListener('input', trackEdit));
  if (draft) {
    [action.input, owner.input, due.input].forEach(input => { input.value = draft[input.name]; });
    trackEdit();
  }
  fields.append(action.wrap, owner.wrap, due.wrap);
  const line = state.notes.lines.find((item) => item.id === candidate.sourceLineId);
  const source = node('aside', 'source-box');
  source.append(node('strong', '', `Original source · ${candidate.sourceLineId}`), node('blockquote', '', candidate.sourceQuote), node('small', '', line ? `Full line: ${line.text}` : 'Source line unavailable'));
  body.append(fields, source);
  card.append(head, body);
  candidate.warnings.forEach((warning) => card.append(node('div', 'warning', warning)));
  const controls = node('div', 'candidate-actions');
  const provenance = candidate.manualFields.length ? `Manually changed: ${candidate.manualFields.join(', ')}` : 'Unchanged model suggestion';
  const buttons = node('div');
  const save = button('Save edits', 'secondary');
  save.dataset.action = 'save';
  save.addEventListener('click', async () => {
    await mutate(`/api/candidates/${candidate.id}`, 'PUT', { action: action.input.value, owner: owner.input.value || null, dueDate: due.input.value || null, sourceVersion: state.notes.version, candidateRevision: candidate.revision }, 'Edits saved. Approval is cleared whenever a candidate changes.');
  });
  const approve = button(candidate.approved ? 'Clear approval' : 'Approve', candidate.approved ? 'danger' : 'primary');
  approve.dataset.action = 'approve';
  approve.addEventListener('click', () => !blockUnsaved() && mutate(`/api/candidates/${candidate.id}/approval`, 'PUT', { approved: !candidate.approved, sourceVersion: state.notes.version, candidateRevision: candidate.revision }, candidate.approved ? 'Approval cleared.' : 'Candidate approved for export.'));
  buttons.append(save, approve); controls.append(node('span', 'provenance', provenance), buttons); card.append(controls);
  return card;
}

function field(labelText, value, name) {
  const wrap = node('div', 'field');
  const label = node('label', '', labelText);
  const input = document.createElement('input');
  input.name = name; input.value = value; input.maxLength = name === 'action' ? 500 : 120;
  const id = `${name}-${crypto.randomUUID()}`; input.id = id; label.htmlFor = id;
  wrap.append(label, input); return { wrap, input };
}

function renderRejected() {
  elements.rejected.replaceChildren();
  elements.rejected.hidden = !state.rejectedCandidates.length;
  if (!state.rejectedCandidates.length) return;
  elements.rejected.append(node('h3', '', 'Source-line failures and rejected candidates'));
  const list = document.createElement('ul');
  state.rejectedCandidates.forEach((item) => list.append(node('li', '', ` ${item.sourceLineId || `Candidate ${item.index}`}: ${item.reason}${item.sourceQuote ? ` Source: ${item.sourceQuote}` : ""}`)));
  elements.rejected.append(list);
}

async function saveNotes() {
  if (dirtyCandidates.size) { showStatus('Save candidate edits before changing the source.', true); return; }
  await mutate('/api/notes', 'PUT', { text: elements.notes.value, expectedVersion: state.notes.version }, 'New source version saved. Earlier candidates and approvals were invalidated.');
}

async function extract() {
  if (blockUnsaved()) return;
  let replaceConfirmed = false;
  if (state.candidates.length) {
    replaceConfirmed = window.confirm('Replace all current candidates? This discards their edits and approvals. Your saved notes remain unchanged.');
    if (!replaceConfirmed) { showStatus('Regeneration cancelled; current review was preserved.'); return; }
  }
  setBusy(true); showStatus('Extracting one source line at a time (up to 120 seconds; one shorter retry for invalid output)…');
  try {
    state = await api('/api/extractions', { method: 'POST', body: { sourceVersion: state.notes.version, replaceConfirmed } });
    render(); showStatus(state.extraction.message);
  } catch (error) { showStatus(error.message, true); }
  finally { setBusy(false); }
}

async function mutate(url, method, body, success) {
  const focused = document.activeElement;
  const cardId = focused.closest('.candidate-card')?.dataset.id;
  const controlAction = focused.dataset.action;
  setBusy(true);
  try { state = await api(url, { method, body }); render(); showStatus(success); }
  catch (error) { showStatus(error.message, true); }
  finally {
    setBusy(false);
    // Rebuilt controls need focus restored; do not steal it if the user moved.
    if (cardId && controlAction &&
        (document.activeElement === document.body || document.activeElement === focused)) {
      const card = [...elements.list.children].find(item => item.dataset.id === cardId);
      card?.querySelector(`[data-action="${controlAction}"]`)?.focus();
    }
  }
}

async function exportFile(format) {
  if (blockUnsaved()) return;
  try {
    const response = await fetch(`/api/export.${format}`);
    if (!response.ok) throw await responseError(response);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `meeting-actions.${format}`; anchor.click(); URL.revokeObjectURL(url);
    showStatus(`Approved current-version candidates exported as ${format.toUpperCase()}.`);
  } catch (error) { showStatus(error.message, true); }
}

async function api(url, options = {}) {
  const init = { ...options, headers: options.body ? { 'content-type': 'application/json' } : undefined };
  if (options.body) init.body = JSON.stringify(options.body);
  const response = await fetch(url, init);
  if (!response.ok) throw await responseError(response);
  return response.json();
}
async function responseError(response) {
  const value = await response.json().catch(() => null);
  if (value?.error?.code === 'storage_durability_uncertain' && value.committedState) {
    state = value.committedState;
    elements.notes.value = state.notes.text;
    updateCount(); render();
  }
  return new Error(value?.error?.message || `Request failed (${response.status}).`);
}
function blockUnsaved() {
  if (!dirtyCandidates.size && !hasUnsavedNotes()) return false;
  showStatus('Save unsaved edits before approving, regenerating, or exporting.', true);
  return true;
}
function setBusy(value) {
  busy = value;
  document.querySelectorAll('#notes-input, .candidate-card input, .candidate-card button, .export').forEach(control => { control.disabled = value; });
  renderTop();
}
function showStatus(message, error = false) { elements.status.hidden = false; elements.status.textContent = message; elements.status.classList.toggle('error', error); }
function node(tag, className = '', text = '') { const item = document.createElement(tag); if (className) item.className = className; if (text) item.textContent = text; return item; }
function button(text, style) { const item = node('button', `button ${style}`, text); item.type = 'button'; return item; }
