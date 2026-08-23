import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

type CommunityPostView = Record<string, unknown> & {
  comments: Array<Record<string, unknown>>;
};

export function useCommunity(nurseryId?: string, userId?: string) {
  const qc = useQueryClient();

  const postsQuery = useQuery({
    queryKey: ['community-posts', nurseryId],
    queryFn: async () => {
      if (!nurseryId) return [];
      const postsRes = await supabase
        .from('posts')
        .select('*')
        .eq('nursery_id', nurseryId)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false });
      if (postsRes.error) throw postsRes.error;
      const posts = (postsRes.data ?? []) as Array<Record<string, unknown>>;
      const postIds = posts.map((p) => String(p.id));
      const commentsRes = postIds.length
        ? await supabase.from('post_comments').select('*').in('post_id', postIds).order('created_at', { ascending: true })
        : { data: [], error: null };
      if (commentsRes.error) throw commentsRes.error;
      const comments = (commentsRes.data ?? []) as Array<Record<string, unknown>>;
      const byPost = comments.reduce<Record<string, Array<Record<string, unknown>>>>((acc, c) => {
        const id = String(c.post_id);
        const arr = acc[id] ?? [];
        arr.push(c);
        acc[id] = arr;
        return acc;
      }, {});
      return posts.map((p) => ({ ...p, comments: byPost[String(p.id)] ?? [] })) as CommunityPostView[];
    },
    enabled: Boolean(nurseryId),
  });

  const createPost = useMutation({
    mutationFn: async (payload: { nursery_id: string; author_id: string; post_type: 'announcement' | 'tip' | 'question'; title: string; content: string; pinned?: boolean }) => {
      const res = await supabase.from('posts').insert({
        ...payload,
        pinned: Boolean(payload.pinned),
      } as never);
      if (res.error) throw res.error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['community-posts'] }),
  });

  const updatePost = useMutation({
    mutationFn: async (payload: { id: string; updates: Record<string, unknown> }) => {
      const res = await supabase.from('posts').update(payload.updates as never).eq('id', payload.id);
      if (res.error) throw res.error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['community-posts'] }),
  });

  const addComment = useMutation({
    mutationFn: async (payload: { post_id: string; content: string }) => {
      if (!userId) throw new Error('Missing user');
      const res = await supabase.from('post_comments').insert({
        post_id: payload.post_id,
        author_id: userId,
        content: payload.content,
      } as never);
      if (res.error) throw res.error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['community-posts'] }),
  });

  return {
    posts: postsQuery.data ?? [],
    isLoading: postsQuery.isLoading,
    createPost: createPost.mutateAsync,
    updatePost: updatePost.mutateAsync,
    addComment: addComment.mutateAsync,
  };
}
