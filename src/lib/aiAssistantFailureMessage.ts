import type { TFunction } from 'i18next';

/** Maps HTTP status / internal codes to i18n text (no raw server bodies). */
export function userMessageForAiAssistantFailure(
  t: TFunction,
  rawError: string | undefined,
  errorHttpStatus?: number,
): string {
  if (errorHttpStatus === 404) return t('ai.errors.functionNotFound');
  if (errorHttpStatus === 401 || errorHttpStatus === 403) return t('ai.errors.sessionRejected');
  if (errorHttpStatus === 503) return t('ai.errors.aiNotConfigured');
  if (errorHttpStatus === 400) return t('ai.errors.badRequest');
  if (errorHttpStatus === 429) return t('ai.errors.rateLimited');
  if (errorHttpStatus !== undefined && errorHttpStatus >= 500) return t('ai.errors.providerError');
  if (
    errorHttpStatus !== undefined &&
    errorHttpStatus >= 400 &&
    errorHttpStatus < 500
  ) {
    return t('ai.errors.clientHttp', { status: errorHttpStatus });
  }
  if (rawError === 'max_tool_rounds') return t('ai.errors.maxToolRounds');
  if (rawError === 'fetch_failed') return t('ai.errors.network');
  if (rawError === 'missing_vite_supabase_url' || rawError === 'missing_vite_anon_key') {
    return t('ai.errors.misconfiguredClient');
  }
  if (rawError === 'missing_access_token') return t('ai.errors.auth');
  return t('ai.errors.tryAgainOrHelp');
}
