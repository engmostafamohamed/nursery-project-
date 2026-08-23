-- Parents can read QR token rows for their linked children (parent QR hub).
CREATE POLICY qr_tokens_parent_select
  ON public.qr_tokens
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND EXISTS (
      SELECT 1
      FROM public.parent_children pc
      WHERE pc.parent_id = auth.uid()
        AND pc.child_id = qr_tokens.child_id
    )
  );
