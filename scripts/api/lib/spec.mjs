// Assembles one Swagger 2.0 document from the parts: auth, REST (tables + SQL functions) and
// server functions, with the headers every request needs.
import { AUTH_TAG, authPaths } from './auth-paths.mjs';
import { FUNCTIONS_TAGS, toFunctionPaths } from './edge-functions.mjs';
import { TAGS, toRestPaths } from './postgrest.mjs';

const DESCRIPTION = `The API the XO web app uses, for mobile and other clients. It is served by Supabase.

**Every request** sends two headers:
- \`apikey: <public anon key>\`
- \`Authorization: Bearer <access_token>\` (from **Auth → Sign in**)

Row-level security applies to every table: each user only sees and changes the rows their role allows (a parent sees only their own children).

Never put the service-role (secret) key in an app.`;

const TAG_LIST = [
  { name: AUTH_TAG, description: 'Sign in, refresh, sign out' },
  { name: TAGS.tables, description: 'Read and write rows (filter with ?column=eq.value, pick columns with ?select=)' },
  { name: TAGS.rpcUsed, description: 'SQL functions the web app calls. Money and attendance changes go through these.' },
  { name: FUNCTIONS_TAGS.app, description: 'Server functions the app calls' },
  { name: TAGS.rpcOther, description: 'Other SQL functions: access-rule helpers, jobs and functions only the server may call' },
  { name: FUNCTIONS_TAGS.internal, description: 'Called by the server or a schedule. Not for apps.' },
];

/**
 * @param {{ host: string, version: string, rest: any, rpcUsedByApp: Set<string>, deployed: Map<string, boolean | null> }} parts
 */
export function buildSpec({ host, version, rest, rpcUsedByApp, deployed }) {
  return {
    swagger: '2.0',
    info: { title: 'XO Platform API', version, description: DESCRIPTION },
    host,
    basePath: '/',
    schemes: ['https'],
    consumes: rest.consumes,
    produces: rest.produces,
    securityDefinitions: {
      apikey: { type: 'apiKey', in: 'header', name: 'apikey', description: "The project's public anon key" },
      bearer: { type: 'apiKey', in: 'header', name: 'Authorization', description: 'Bearer <access_token>' },
    },
    security: [{ apikey: [], bearer: [] }],
    tags: TAG_LIST,
    paths: {
      ...authPaths,
      ...toRestPaths(rest.paths, rpcUsedByApp),
      ...toFunctionPaths(deployed),
    },
    definitions: rest.definitions,
    parameters: rest.parameters,
  };
}

/** Counts shown in the summary and the README. */
export function summarize(spec) {
  const operations = Object.values(spec.paths).flatMap((ops) => Object.values(ops));
  const byTag = (tag) => Object.values(spec.paths).filter((ops) => Object.values(ops).some((op) => op.tags?.includes(tag))).length;
  return {
    paths: Object.keys(spec.paths).length,
    operations: operations.length,
    tables: byTag(TAGS.tables),
    rpcUsed: byTag(TAGS.rpcUsed),
    rpcOther: byTag(TAGS.rpcOther),
    functionsApp: byTag(FUNCTIONS_TAGS.app),
    functionsInternal: byTag(FUNCTIONS_TAGS.internal),
  };
}
