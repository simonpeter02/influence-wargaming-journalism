import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Load repo-root .env (optional; stub mode works without it)
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

export const APP_PORT = Number(process.env.APP_PORT || 3002);
export const API_KEY = process.env.OPENAI_API_KEY;
export const GAME_MODEL = process.env.GAME_MODEL || 'gpt-4.1';
export const DEMO_MODEL = process.env.DEMO_MODEL || 'gpt-4.1-mini';
export const USE_STUB = process.env.LLM_STUB === '1' || !API_KEY || API_KEY.startsWith('sk-...');

export const DATA_DIR = path.join(ROOT, 'server', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
