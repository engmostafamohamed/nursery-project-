// Finds which server functions are deployed, without running any of them.
// It sends a CORS preflight (OPTIONS) only to functions whose code answers OPTIONS before doing
// any work; a deployed function answers 200, a missing one 404. Others are reported as unchecked.
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Matches both `if (req.method === 'OPTIONS') return …` and the braced form with return on the next line.
const EARLY_OPTIONS_RETURN = /if\s*\(\s*req\.method\s*===\s*'OPTIONS'\s*\)\s*\{?\s*return/;

/**
 * @param {{ url: string, functionsDir: string, names: string[] }} input
 * @returns {Promise<Map<string, boolean | null>>}
 */
export async function checkDeployedFunctions({ url, functionsDir, names }) {
  const result = new Map();
  for (const name of names) {
    result.set(name, answersOptionsSafely(functionsDir, name) ? await isDeployed(url, name) : null);
  }
  return result;
}

function answersOptionsSafely(functionsDir, name) {
  const source = readFileSync(path.join(functionsDir, name, 'index.ts'), 'utf8');
  return EARLY_OPTIONS_RETURN.test(source);
}

async function isDeployed(url, name) {
  const response = await fetch(`${url}/functions/v1/${name}`, {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost', 'Access-Control-Request-Method': 'POST' },
  });
  if (response.status === 404) return false;
  return response.ok ? true : null;
}
