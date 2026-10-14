// Finds the SQL functions the web app calls, so the description can tell a mobile developer
// which ones are part of the real product and which are internal helpers.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const RPC_CALL = /\.rpc\(\s*['"`]([a-z0-9_]+)['"`]/g;

/**
 * @param {string} srcDir
 * @returns {Set<string>}
 */
export function findRpcNamesUsedByApp(srcDir) {
  const names = new Set();
  for (const file of listSourceFiles(srcDir)) {
    for (const match of readFileSync(file, 'utf8').matchAll(RPC_CALL)) names.add(match[1]);
  }
  return names;
}

function listSourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listSourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}
