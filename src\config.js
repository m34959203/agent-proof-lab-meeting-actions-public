import path from 'node:path';

export const HOST = '127.0.0.1';
export const PORT = numberEnv('PORT', 4317, 1, 65535);
export const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
export const OLLAMA_URL = exactLoopbackUrl(process.env.OLLAMA_URL || 'http://127.0.0.1:11434');
export const OLLAMA_MODEL = exactModel(process.env.OLLAMA_MODEL || 'gemma4:26b-a4b-it-qat');
export const OLLAMA_TIMEOUT_MS = numberEnv('OLLAMA_TIMEOUT_MS', 120_000, 1_000, 120_000);
export const BODY_LIMIT = 64 * 1024;
export const MAX_NOTES_CHARS = 12_000;
export const MAX_NOTE_LINES = 200;
export const MAX_TASKS = 30;

function numberEnv(name, fallback, minimum, maximum) {
  const value = process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function exactLoopbackUrl(value) {
  if (value !== 'http://127.0.0.1:11434') {
    throw new Error('OLLAMA_URL must be exactly http://127.0.0.1:11434');
  }
  return value;
}

function exactModel(value) {
  if (value !== 'gemma4:26b-a4b-it-qat') {
    throw new Error('OLLAMA_MODEL must be exactly gemma4:26b-a4b-it-qat');
  }
  return value;
}
