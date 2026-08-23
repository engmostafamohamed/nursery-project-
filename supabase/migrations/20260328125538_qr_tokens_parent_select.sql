-- Allow parents to read QR tokens for their children
-- This enables the parent QR code view page

CREATE POLICY "parents_can_read_qr_tokens_for_their_children"
ON qr_tokens
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM parent_children pc
    WHERE pc.parent_id = auth.uid()
      AND pc.child_id = qr_tokens.child_id
  )
);

COMMENT ON POLICY "parents_can_read_qr_tokens_for_their_children" ON qr_tokens IS
'Allows parents to view QR tokens for their children via the parent QR code page';;
