import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { InputError, validateNotes } from './validation.js';

export function emptyState() {
  return {
    schemaVersion: 1,
    revision: 0,
    notes: { version: 0, text: '', lines: [], updatedAt: null },
    candidates: [],
    rejectedCandidates: [],
    extraction: { status: 'idle', message: null, sourceVersion: null, completedAt: null }
  };
}

export class Store {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, 'state.json');
    this.state = emptyState();
    this.queue = Promise.resolve();
  }

  async init() {
    await fs.mkdir(this.dataDir, { recursive: true, mode: 0o700 });
    try {
      const parsed = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (parsed?.schemaVersion !== 1 || !parsed.notes || !Array.isArray(parsed.candidates)) throw new Error('unsupported state schema');
      this.state = parsed;
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error(`Could not load saved state: ${error.message}`);
      await this.persist(this.state);
    }
  }

  snapshot() { return structuredClone(this.state); }

  async transact(change) {
    const operation = this.queue.then(async () => {
      const next = structuredClone(this.state);
      const result = await change(next);
      next.revision = this.state.revision + 1;
      try { await this.persist(next); }
      catch (error) {
        if (error.code === 'storage_durability_uncertain') {
          this.state = next;
          error.committedState = this.snapshot();
        }
        throw error;
      }
      this.state = next;
      return result === undefined ? this.snapshot() : result;
    });
    this.queue = operation.catch(() => {});
    return operation;
  }

  async persist(value) {
    const temporary = path.join(this.dataDir, `.state-${process.pid}-${crypto.randomUUID()}.tmp`);
    let handle, directory;
    let committed = false;
    try {
      handle = await fs.open(temporary, 'wx', 0o600);
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
      await handle.sync();
      await handle.close();
      handle = null;
      await fs.rename(temporary, this.file);
      committed = true;
      directory = await fs.open(this.dataDir, 'r');
      await directory.sync();
      await directory.close();
      directory = null;
    } catch (error) {
      if (handle) await handle.close().catch(() => {});
      if (directory) await directory.close().catch(() => {});
      await fs.unlink(temporary).catch(() => {});
      if (committed) throw new InputError('The change was committed, but disk durability could not be confirmed. Current state has been refreshed. Check storage before continuing; survival of a power loss is not guaranteed.', 507, 'storage_durability_uncertain');
      throw new InputError('Storage failed before commit; the last saved state was preserved.', 507, 'storage_failure');
    }
  }

  async saveNotes(text, expectedVersion) {
    const lines = validateNotes(text);
    return this.transact((next) => {
      if (expectedVersion !== next.notes.version) throw new InputError('Notes changed in another request. Reload before saving.', 409, 'version_conflict');
      if (text === next.notes.text) return;
      next.notes = { version: next.notes.version + 1, text, lines, updatedAt: new Date().toISOString() };
      next.candidates = [];
      next.rejectedCandidates = [];
      next.extraction = { status: 'idle', message: 'Previous candidates were invalidated by the source change.', sourceVersion: next.notes.version, completedAt: null };
    });
  }
}
