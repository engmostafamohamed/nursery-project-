// The tables, views and SQL functions (RPC) of the public schema, as described by Supabase's
// REST layer (PostgREST). The description is only served to the secret key; it contains the
// schema, never data or keys.

export const REST_PREFIX = '/rest/v1';

export const TAGS = {
  tables: 'Tables & views',
  rpcUsed: 'SQL functions · used by the app',
  rpcOther: 'SQL functions · other',
};

/**
 * Downloads the Swagger 2.0 description of the REST API.
 * @param {{ url: string, secretKey: string }} project
 */
export async function fetchPostgrestSpec({ url, secretKey }) {
  const response = await fetch(`${url}${REST_PREFIX}/`, {
    headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}`, Accept: 'application/openapi+json' },
  });
  if (!response.ok) throw new Error(`REST description request failed: HTTP ${response.status}`);
  return response.json();
}

/**
 * Re-roots every path under /rest/v1 (PostgREST does not know it sits behind that prefix)
 * and tags each one so the viewer groups tables apart from functions.
 * @param {Record<string, object>} paths
 * @param {Set<string>} rpcUsedByApp
 */
export function toRestPaths(paths, rpcUsedByApp) {
  const result = {};
  for (const [route, operations] of Object.entries(paths)) {
    if (route === '/') continue; // the description endpoint itself
    const tag = tagFor(route, rpcUsedByApp);
    result[`${REST_PREFIX}${route}`] = withTag(operations, tag);
  }
  return result;
}

function tagFor(route, rpcUsedByApp) {
  if (!route.startsWith('/rpc/')) return TAGS.tables;
  return rpcUsedByApp.has(route.slice('/rpc/'.length)) ? TAGS.rpcUsed : TAGS.rpcOther;
}

function withTag(operations, tag) {
  return Object.fromEntries(
    Object.entries(operations).map(([method, operation]) => [method, { ...operation, tags: [tag] }]),
  );
}
