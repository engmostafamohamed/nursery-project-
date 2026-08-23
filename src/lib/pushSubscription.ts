import { supabase } from '@/lib/supabase';

export async function upsertPushSubscription(
  userId: string,
  subscription: PushSubscription,
): Promise<{ error: Error | null }> {
  try {
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('nursery_id')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      return { error: profileError };
    }

    const nurseryId =
      profile && typeof profile === 'object' && 'nursery_id' in profile
        ? (profile as { nursery_id: string | null }).nursery_id
        : null;

    const subscriptionJson = subscription.toJSON();
    const row = {
      user_id: userId,
      nursery_id: nurseryId,
      endpoint: subscription.endpoint,
      subscription_json: subscriptionJson,
    };
    const { error } = await supabase.from('user_push_subscriptions').upsert(row as never, {
      onConflict: 'user_id,endpoint',
    });

    if (error) {
      return { error };
    }
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error('push_subscription_failed') };
  }
}
