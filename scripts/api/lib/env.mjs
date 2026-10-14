// Reads KEY=value pairs from the project's .env file.
// Values already set in the shell win, so a different project can be targeted without editing .env.
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * @param {string} projectRoot
 * @returns {Record<string, string>}
 */
export function readEnv(projectRoot) {
  const values = {};
  const text = readFileSync(path.join(projectRoot, '.env'), 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return { ...values, ...pickDefined(process.env) };
}

/**
 * @param {Record<string, string>} env
 * @param {string} name
 */
export function requireValue(env, name) {
  const value = env[name];
  if (!value) throw new Error(`${name} is missing from .env`);
  return value;
}

function pickDefined(source) {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined && value !== ''));
}
