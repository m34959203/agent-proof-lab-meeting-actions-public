import { MAX_NOTE_LINES, MAX_NOTES_CHARS, MAX_TASKS } from './config.js';

export class InputError extends Error {
  constructor(message, status = 400, code = 'invalid_request') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function makeLines(text) {
  return text.split(/\r?\n/).map((line, index) => ({
    id: `L${String(index + 1).padStart(4, '0')}`,
    number: index + 1,
    text: line
  }));
}

export function validateNotes(text) {
  if (typeof text !== 'string') throw new InputError('Notes must be text.');
  if (!text.trim()) throw new InputError('Enter meeting notes before saving.', 422, 'empty_notes');
  if (text.length > MAX_NOTES_CHARS) throw new InputError(`Notes exceed ${MAX_NOTES_CHARS.toLocaleString('en-US')} characters.`, 413, 'notes_too_large');
  const lines = makeLines(text);
  if (lines.length > MAX_NOTE_LINES) throw new InputError(`Notes exceed ${MAX_NOTE_LINES} lines.`, 413, 'too_many_lines');
  return lines;
}

function plainString(value, label, maximum = 500) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) {
    throw new InputError(`${label} must be non-empty text up to ${maximum} characters.`, 422);
  }
  return value.trim();
}

function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false;
  const parsed = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function nullableField(raw, line, label) {
  if (raw === null || raw === undefined) return { value: null, evidence: null, warning: null };
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new InputError(`${label} must be null or an object.`);
  const value = plainString(raw.value, `${label} value`, 120);
  const evidence = plainString(raw.evidence, `${label} evidence`, 300);
  if (!line.text.includes(evidence)) return { value: null, evidence: null, warning: `${label} was cleared because its evidence was not an exact source quote.` };
  if (!evidence.includes(value)) return { value: null, evidence: null, warning: `${label} was cleared because its value did not appear in its quoted evidence.` };
  if (label === 'Due date' && !calendarDate(value)) {
    return { value: null, evidence: null, warning: 'Due date was cleared because it was not a valid explicit YYYY-MM-DD calendar date.' };
  }
  return { value, evidence, warning: null };
}

export function validateModelPayload(payload, notes) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Array.isArray(payload.tasks)) {
    throw new InputError('Model response must be a JSON object with a tasks array.', 502, 'rejected_response');
  }
  if (payload.tasks.length > MAX_TASKS) throw new InputError(`Model returned more than ${MAX_TASKS} tasks.`, 502, 'rejected_response');
  const accepted = [];
  const rejected = [];
  for (let index = 0; index < payload.tasks.length; index += 1) {
    const raw = payload.tasks[index];
    try {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new InputError('Candidate is not an object.');
      for (const key of ['action', 'sourceLineId', 'sourceQuote', 'owner', 'dueDate']) {
        if (!Object.hasOwn(raw, key)) throw new InputError(`Candidate is missing ${key}.`);
      }
      const action = plainString(raw.action, 'Action', 500);
      const sourceLineId = plainString(raw.sourceLineId, 'Source line ID', 10);
      const sourceQuote = plainString(raw.sourceQuote, 'Source quote', 500);
      const line = notes.lines.find((item) => item.id === sourceLineId);
      if (!line) throw new InputError('Source line ID does not exist in this note version.');
      if (!line.text.includes(sourceQuote)) throw new InputError('Source quote is not an exact substring of the referenced line.');
      const owner = nullableField(raw.owner, line, 'Owner');
      const dueDate = nullableField(raw.dueDate, line, 'Due date');
      accepted.push({ action, sourceLineId, sourceQuote, owner: owner.value, ownerEvidence: owner.evidence, dueDate: dueDate.value, dueDateEvidence: dueDate.evidence, warnings: [owner.warning, dueDate.warning].filter(Boolean) });
    } catch (error) {
      rejected.push({ index: index + 1, reason: error.message });
    }
  }
  return { accepted, rejected };
}

export function validateManualCandidate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('Edit body must be an object.');
  if (body.dueDate !== null && body.dueDate !== '' && !calendarDate(body.dueDate)) throw new InputError('Due date must be a valid YYYY-MM-DD calendar date.', 422);
  return {
    action: plainString(body.action, 'Action', 500),
    owner: body.owner === null || body.owner === '' ? null : plainString(body.owner, 'Owner', 120),
    dueDate: body.dueDate === null || body.dueDate === '' ? null : plainString(body.dueDate, 'Due date', 120)
  };
}
