// Exports the XO Platform API description (OpenAPI / Swagger 2.0) to docs/api/.
//
//   npm run api:openapi
//
// Reads the REST description with SUPABASE_SERVICE_ROLE_KEY from .env (read-only; the output
// contains the schema, never data or keys), adds auth and the server functions, and writes:
//   docs/api/openapi.json   the description
//   docs/api/index.html     a browser viewer
//   docs/api/README.md      how to call the API
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findRpcNamesUsedByApp } from './lib/app-usage.mjs';
import { checkDeployedFunctions } from './lib/deployment.mjs';
import { EDGE_FUNCTIONS } from './lib/edge-functions.mjs';
import { readEnv, requireValue } from './lib/env.mjs';
import { fetchPostgrestSpec } from './lib/postgrest.mjs';
import { renderReadme } from './lib/readme.mjs';
import { buildSpec, summarize } from './lib/spec.mjs';
import { renderViewerPage } from './lib/viewer-page.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outputDir = path.join(projectRoot, 'docs', 'api');

async function main() {
  const env = readEnv(projectRoot);
  const url = requireValue(env, 'VITE_SUPABASE_URL');
  const secretKey = requireValue(env, 'SUPABASE_SERVICE_ROLE_KEY');
  const host = new URL(url).host;
  const version = `${readPackageVersion()} · ${new Date().toISOString().slice(0, 10)}`;

  console.log(`Reading the REST description of ${host} ...`);
  const rest = await fetchPostgrestSpec({ url, secretKey });

  console.log('Finding the SQL functions the app uses ...');
  const rpcUsedByApp = findRpcNamesUsedByApp(path.join(projectRoot, 'src'));

  console.log('Checking which server functions are deployed (preflight only) ...');
  const deployed = await checkDeployedFunctions({
    url,
    functionsDir: path.join(projectRoot, 'supabase', 'functions'),
    names: EDGE_FUNCTIONS.map((fn) => fn.name),
  });

  const spec = buildSpec({ host, version, rest, rpcUsedByApp, deployed });
  const counts = summarize(spec);

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(path.join(outputDir, 'openapi.json'), `${JSON.stringify(spec, null, 2)}\n`);
  writeFileSync(path.join(outputDir, 'index.html'), renderViewerPage(spec));
  writeFileSync(path.join(outputDir, 'README.md'), renderReadme({ host, version, counts, deployed }));

  printSummary(counts, deployed);
}

function readPackageVersion() {
  return JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8')).version;
}

function printSummary(counts, deployed) {
  const state = (value) => (value === true ? 'deployed' : value === false ? 'NOT deployed' : 'not checked');
  console.log(`\nWrote docs/api/ (openapi.json, index.html, README.md): ${counts.paths} paths, ${counts.operations} operations`);
  console.log(`  tables & views ${counts.tables} · SQL functions used by the app ${counts.rpcUsed} · other ${counts.rpcOther}`);
  console.log(`  server functions: ${counts.functionsApp} for apps, ${counts.functionsInternal} internal`);
  console.log('  deployment:');
  for (const [name, value] of deployed) console.log(`    ${name.padEnd(30)} ${state(value)}`);
}

main().catch((error) => {
  console.error(`api:openapi failed: ${error.message}`);
  process.exit(1);
});
