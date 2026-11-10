/*
 * An edge function that fails answers with a JSON body such as { error: 'code', error_message }.
 * supabase-js does not put that body on the error it throws, only the response, so this reads it.
 */

export type EdgeFunctionErrorBody = { error: string | null; errorMessage: string | null };

/** The function's error body, or null when there is no response or it is not JSON. */
export async function edgeFunctionErrorBody(error: unknown): Promise<EdgeFunctionErrorBody | null> {
  const context = (error as { context?: unknown } | null)?.context;
  // supabase-js keeps the Response as `context` (older versions as `context.response`).
  const response = context instanceof Response ? context : (context as { response?: unknown } | undefined)?.response;
  if (!(response instanceof Response)) return null;
  try {
    const body = (await response.clone().json()) as { error?: unknown; error_message?: unknown };
    return {
      error: typeof body.error === 'string' && body.error ? body.error : null,
      errorMessage: typeof body.error_message === 'string' && body.error_message ? body.error_message : null,
    };
  } catch {
    return null;
  }
}
