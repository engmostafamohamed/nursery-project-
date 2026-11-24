import { fetchAllRows } from '@/lib/fetchAllRows';
import { supabase } from '@/lib/supabase';

/** One parent–child link of a nursery, with the parent's name. */
export type NurseryFamilyLink = {
  child_id: string;
  parent_id: string;
  parent: { name_ar: string | null; name_en: string | null } | null;
};

type ChildWithLinks = {
  id: string;
  parent_children: Array<Omit<NurseryFamilyLink, 'child_id'>> | null;
};

/**
 * Every parent–child link of one nursery, all pages of them. Read from the nursery's children, each
 * with its links: never by a list of child ids (a few hundred make the request too long for the
 * server), and not from the links table filtered by nursery (that checks every link of every nursery).
 */
export async function fetchNurseryFamilyLinks(nurseryId: string): Promise<NurseryFamilyLink[]> {
  const children = await fetchAllRows<ChildWithLinks>((start, end) =>
    supabase
      .from('children')
      .select('id, parent_children(parent_id, parent:users!parent_children_parent_id_fkey(name_ar, name_en))')
      .eq('nursery_id', nurseryId)
      .order('id')
      .range(start, end)
      .returns<ChildWithLinks[]>(),
  );
  return children.flatMap((child) => (child.parent_children ?? []).map((link) => ({ ...link, child_id: child.id })));
}
