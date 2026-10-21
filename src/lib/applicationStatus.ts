/** Icon and colours for an application status; a draft is not yet with the nursery, so it stays neutral. */
export function applicationStatusUi(status: string) {
  if (status === 'approved') {
    return { icon: 'verified', className: 'bg-success/10 text-success border-success/30' };
  }
  if (status === 'rejected') {
    return { icon: 'cancel', className: 'bg-error/10 text-error border-error/30' };
  }
  if (status === 'documents_pending') {
    return { icon: 'upload_file', className: 'bg-warning/10 text-warning border-warning/30' };
  }
  if (status === 'submitted' || status === 'under_review') {
    return { icon: 'manage_search', className: 'bg-primary/10 text-primary border-primary/30' };
  }
  return { icon: 'edit_document', className: 'bg-surface-high text-on-surface-variant border-outline-variant' };
}
