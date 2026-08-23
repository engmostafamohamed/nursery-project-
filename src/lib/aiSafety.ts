export type AiRiskKind = 'bulk' | 'broadcast' | 'delete' | 'child_status' | 'none';

export interface AiSafetyAssessment {
  needsConfirmation: boolean;
  kind: AiRiskKind;
  previewKey: string;
  previewParams?: Record<string, string | number>;
}

const BULK_THRESHOLD = 5;
const BROADCAST_THRESHOLD = 10;

function countItems(params: Record<string, unknown>): number {
  const ids = params.childIds ?? params.mediaIds ?? params.child_ids ?? params.media_ids;
  if (Array.isArray(ids)) return ids.length;
  const audience = params.audience;
  if (typeof audience === 'number') return audience;
  if (typeof audience === 'string') {
    const n = Number(audience);
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

export function assessAiActionSafety(
  toolName: string,
  params: Record<string, unknown>,
): AiSafetyAssessment {
  const name = toolName.toLowerCase();

  if (name.includes('delete') || name === 'delete_data') {
    return { needsConfirmation: true, kind: 'delete', previewKey: 'ai.safety.preview.delete' };
  }

  if (name.includes('child_status') || name.includes('change_child_status')) {
    return { needsConfirmation: true, kind: 'child_status', previewKey: 'ai.safety.preview.childStatus' };
  }

  if (name.includes('broadcast') || name.includes('send_broadcast')) {
    const n = countItems(params);
    const recipientHint = typeof params.audience === 'string' ? params.audience : '';
    if (n > BROADCAST_THRESHOLD || recipientHint === 'all_parents') {
      return {
        needsConfirmation: true,
        kind: 'broadcast',
        previewKey: 'ai.safety.preview.broadcast',
        previewParams: { count: n || BROADCAST_THRESHOLD },
      };
    }
  }

  if (
    name.includes('approve_media') ||
    name.includes('mark_present') ||
    name.includes('bulk') ||
    Array.isArray(params.childIds) ||
    Array.isArray(params.mediaIds)
  ) {
    const n = countItems(params);
    if (n > BULK_THRESHOLD) {
      return {
        needsConfirmation: true,
        kind: 'bulk',
        previewKey: 'ai.safety.preview.bulk',
        previewParams: { count: n, tool: toolName },
      };
    }
  }

  return { needsConfirmation: false, kind: 'none', previewKey: '' };
}

export function formatSafetyPreview(
  t: (key: string, opts?: Record<string, string | number>) => string,
  assessment: AiSafetyAssessment,
): string {
  if (!assessment.previewKey) return '';
  return t(assessment.previewKey, assessment.previewParams as Record<string, string | number> | undefined);
}
