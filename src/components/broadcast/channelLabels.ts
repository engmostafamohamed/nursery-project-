import type { BroadcastChannel } from '@/types/tables/batch3';

/** Locale key for each broadcast channel's label. */
export const CHANNEL_LABEL_KEY: Record<BroadcastChannel, string> = {
  in_app: 'broadcastPage.channelInApp',
  whatsapp: 'broadcastPage.channelWhatsapp',
  sms: 'broadcastPage.channelSms',
  email: 'broadcastPage.channelEmail',
};
