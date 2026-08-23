import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useNotificationsCenter } from '@/hooks/useNotificationsCenter';
import { assessAiActionSafety } from '@/lib/aiSafety';
import { buildAIContextPayload, type AiSurfaceRole } from '@/lib/aiContext';
import { userMessageForAiAssistantFailure } from '@/lib/aiAssistantFailureMessage';
import { runAiAssistantSession, type AiChatMessage } from '@/lib/aiAgent';
import { executeAiTool, toolAllowedForRole, type AiExecutionContext } from '@/lib/aiAgentActions';
import { canSendAiRequest, recordAiRequest } from '@/lib/aiRateLimit';
import { loadAiChatMessages, saveAiChatMessages } from '@/lib/aiChatStorage';
import { trackHelpAnalytics } from '@/lib/helpAnalytics';
import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/types/user';

type ConfirmState = {
  name: string;
  input: Record<string, unknown>;
  resolve: (value: string) => void;
} | null;

interface Args {
  surfaceRole: AiSurfaceRole;
  userId: string;
  nurseryId: string | null;
  dbRole: UserRole;
}

export function useAiAssistantController({ surfaceRole, userId, nurseryId, dbRole }: Args) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [messages, setMessages] = useState<AiChatMessage[]>(() => loadAiChatMessages(userId));
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { data: notifications = [] } = useNotificationsCenter(userId);
  const unread = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const mediaPendingQuery = useQuery({
    queryKey: ['ai-admin-media-pending', nurseryId],
    queryFn: async () => {
      if (!nurseryId) return 0;
      const res = await supabase
        .from('media')
        .select('id', { count: 'exact', head: true })
        .eq('nursery_id', nurseryId)
        .eq('status', 'pending_approval');
      if (res.error) throw res.error;
      return res.count ?? 0;
    },
    enabled: surfaceRole === 'admin' && Boolean(nurseryId),
  });
  const pendingApprovals = surfaceRole === 'admin' ? (mediaPendingQuery.data ?? 0) : null;

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  useEffect(() => {
    setMessages(loadAiChatMessages(userId));
  }, [userId]);

  const execCtx: AiExecutionContext = useMemo(
    () => ({
      navigate: (path: string) => navigate(path),
      userId,
      surfaceRole,
      nurseryId,
    }),
    [navigate, userId, surfaceRole, nurseryId],
  );

  const runTool = useCallback(
    async (name: string, input: Record<string, unknown>): Promise<string> => {
      if (!toolAllowedForRole(name, surfaceRole)) {
        return t('ai.errors.toolDenied');
      }
      const assessment = assessAiActionSafety(name, input);
      if (assessment.needsConfirmation) {
        return await new Promise((resolve) => {
          setConfirm({ name, input, resolve });
        });
      }
      try {
        const out = await executeAiTool(name, input, execCtx);
        trackHelpAnalytics({
          type: 'ai_action_executed',
          actionType: name,
          success: true,
          timestamp: new Date().toISOString(),
        });
        return out;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'error';
        trackHelpAnalytics({
          type: 'ai_error_occurred',
          errorType: msg,
          timestamp: new Date().toISOString(),
        });
        trackHelpAnalytics({
          type: 'ai_action_executed',
          actionType: name,
          success: false,
          timestamp: new Date().toISOString(),
        });
        return msg;
      }
    },
    [execCtx, surfaceRole, t],
  );

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || loading) return;
    if (!online) {
      toast.error(t('ai.errors.offline'));
      return;
    }
    if (!canSendAiRequest(userId)) {
      toast.error(t('ai.errors.quota'));
      return;
    }

    const nextMsgs: AiChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(nextMsgs);
    saveAiChatMessages(userId, nextMsgs);
    setDraft('');
    setLoading(true);
    recordAiRequest(userId);
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
      let token = refreshData.session?.access_token;
      if (refreshErr || !token) {
        const { data: sessionData } = await supabase.auth.getSession();
        token = sessionData.session?.access_token ?? '';
      }
      if (!token) {
        toast.error(t('ai.errors.auth'));
        setLoading(false);
        return;
      }

      const context = buildAIContextPayload({
        surfaceRole,
        nurseryId,
        pathname: window.location.pathname,
        search: window.location.search,
        language: i18n.language.startsWith('ar') ? 'ar' : 'en',
        unreadNotifications: unread,
        pendingApprovals,
      });

      const { assistantText, rawError, errorHttpStatus } = await runAiAssistantSession({
        messages: nextMsgs,
        context,
        accessToken: token,
        onToolUse: runTool,
        signal: abortRef.current.signal,
      });

      if (rawError === 'ai_aborted') {
        return;
      }

      if (rawError) {
        trackHelpAnalytics({
          type: 'ai_error_occurred',
          errorType: rawError,
          timestamp: new Date().toISOString(),
        });
        const failMsg = userMessageForAiAssistantFailure(t, rawError, errorHttpStatus);
        toast.error(failMsg);
        const errReply: AiChatMessage = {
          role: 'assistant',
          content: failMsg,
        };
        const withErr = [...nextMsgs, errReply];
        setMessages(withErr);
        saveAiChatMessages(userId, withErr);
      } else {
        const reply: AiChatMessage = { role: 'assistant', content: assistantText || t('ai.emptyReply') };
        const finalMsgs = [...nextMsgs, reply];
        setMessages(finalMsgs);
        saveAiChatMessages(userId, finalMsgs);
      }

      trackHelpAnalytics({
        type: 'ai_message_sent',
        role: dbRole,
        hasTools: true,
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      console.error(e);
      trackHelpAnalytics({
        type: 'ai_error_occurred',
        errorType: 'send_failed',
        timestamp: new Date().toISOString(),
      });
      const failMsg = t('ai.errors.network');
      toast.error(failMsg);
      const withErr: AiChatMessage[] = [...nextMsgs, { role: 'assistant', content: failMsg }];
      setMessages(withErr);
      saveAiChatMessages(userId, withErr);
    } finally {
      setLoading(false);
    }
  }, [
    draft,
    loading,
    online,
    userId,
    messages,
    i18n.language,
    surfaceRole,
    nurseryId,
    unread,
    pendingApprovals,
    runTool,
    dbRole,
    t,
  ]);

  const onConfirmTool = async () => {
    if (!confirm) return;
    const { name, input, resolve } = confirm;
    setConfirm(null);
    try {
      const out = await executeAiTool(name, input, execCtx);
      trackHelpAnalytics({
        type: 'ai_action_executed',
        actionType: name,
        success: true,
        timestamp: new Date().toISOString(),
      });
      resolve(out);
    } catch (e) {
      resolve(e instanceof Error ? e.message : 'error');
    }
  };

  const onCancelConfirm = () => {
    if (!confirm) return;
    confirm.resolve(t('ai.errors.cancelled'));
    setConfirm(null);
  };

  return {
    online,
    messages,
    draft,
    setDraft,
    loading,
    send,
    confirm,
    onConfirmTool,
    onCancelConfirm,
  };
}
