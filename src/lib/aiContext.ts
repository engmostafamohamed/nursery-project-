import type { UserRole } from '@/types/user';

const RECENT_KEY = 'xo-ai-recent-routes-v1';
const MAX_RECENT = 12;

export type AiSurfaceRole = 'admin' | 'teacher' | 'parent';

export function mapProfileRoleToSurface(role: UserRole): AiSurfaceRole | null {
  if (role === 'branch_admin' || role === 'chain_super_admin') return 'admin';
  if (role === 'teacher') return 'teacher';
  if (role === 'parent') return 'parent';
  return null;
}

export function recordRouteVisit(pathname: string): void {
  if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) return;
  if (!pathname) return;
  try {
    const raw = globalThis.localStorage.getItem(RECENT_KEY);
    const prev = raw ? (JSON.parse(raw) as string[]) : [];
    const next = [pathname, ...prev.filter((p) => p !== pathname)].slice(0, MAX_RECENT);
    globalThis.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function getRecentRoutes(): string[] {
  if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) return [];
  try {
    const raw = globalThis.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]).slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export interface AIContextPayload {
  role: AiSurfaceRole;
  nurseryId: string | null;
  currentPage: string;
  language: string;
  recentActivity: string[];
  unreadNotifications: number;
  pendingApprovals: number | null;
}

export function buildAIContextPayload(input: {
  surfaceRole: AiSurfaceRole;
  nurseryId: string | null;
  pathname: string;
  search: string;
  language: string;
  unreadNotifications: number;
  pendingApprovals: number | null;
}): AIContextPayload {
  const currentPage = `${input.pathname}${input.search}`;
  return {
    role: input.surfaceRole,
    nurseryId: input.nurseryId,
    currentPage,
    language: input.language,
    recentActivity: getRecentRoutes(),
    unreadNotifications: input.unreadNotifications,
    pendingApprovals: input.pendingApprovals,
  };
}
