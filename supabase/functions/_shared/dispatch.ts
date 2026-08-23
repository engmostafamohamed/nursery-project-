import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

type Channel = 'whatsapp' | 'sms' | 'email' | 'push';
type Language = 'ar' | 'en';

interface LogPayload {
  supabase: SupabaseClient;
  nurseryId: string | null;
  userId: string;
  triggerType: string;
  channel: Channel;
  language: Language;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
}

export function pickLanguage(input: string | undefined): Language {
  return input === 'en' ? 'en' : 'ar';
}

export function pickText(language: Language, arText: string, enText: string): string {
  return language === 'ar' ? arText : enText;
}

export async function logNotification({
  supabase,
  nurseryId,
  userId,
  triggerType,
  channel,
  titleAr,
  titleEn,
  bodyAr,
  bodyEn,
}: LogPayload) {
  const { error } = await supabase.from('notifications').insert({
    nursery_id: nurseryId,
    user_id: userId,
    type: triggerType,
    title_ar: titleAr,
    title_en: titleEn,
    body_ar: bodyAr,
    body_en: bodyEn,
    channel,
    read: false,
    sent_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(`Failed to log notification: ${error.message}`);
  }
}

export async function countChannelToday(
  supabase: SupabaseClient,
  userId: string,
  channel: Channel,
) {
  const now = new Date();
  const startUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('channel', channel)
    .gte('sent_at', startUtc.toISOString());

  if (error) {
    throw new Error(`Failed to count daily messages: ${error.message}`);
  }
  return count ?? 0;
}

export function isAtLeastFiveMinutesAgo(iso: string): boolean {
  const elapsed = Date.now() - new Date(iso).getTime();
  return elapsed >= 5 * 60 * 1000;
}
