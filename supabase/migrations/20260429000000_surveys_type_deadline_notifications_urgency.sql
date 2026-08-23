-- Surveys can now be either a free-form questionnaire OR a yes/no permission slip.
-- A permission with a deadline triggers a high-urgency notification to parents.
-- Notifications gain an `urgency` column so the parent app can render them distinctly.

BEGIN;

-- 1. Surveys: add type + deadline.
ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'questionnaire';

ALTER TABLE public.surveys
  DROP CONSTRAINT IF EXISTS surveys_type_check;
ALTER TABLE public.surveys
  ADD CONSTRAINT surveys_type_check CHECK (type IN ('questionnaire', 'permission'));

ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS deadline timestamptz;

COMMENT ON COLUMN public.surveys.type IS
  'questionnaire = free-form Q&A; permission = single yes/no with optional note (parent approves or declines).';
COMMENT ON COLUMN public.surveys.deadline IS
  'Optional deadline. Required by app when type = permission. Powers high-urgency notifications and reminders.';

CREATE INDEX IF NOT EXISTS idx_surveys_deadline ON public.surveys (deadline)
  WHERE deadline IS NOT NULL;

-- 2. Notifications: add urgency tier so the parent UI can flag time-sensitive items.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS urgency text NOT NULL DEFAULT 'normal';

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_urgency_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_urgency_check CHECK (urgency IN ('low', 'normal', 'high'));

COMMENT ON COLUMN public.notifications.urgency IS
  'low | normal | high. Permission notifications with a deadline are sent as high.';

CREATE INDEX IF NOT EXISTS idx_notifications_urgency_user
  ON public.notifications (user_id, urgency)
  WHERE urgency = 'high';

COMMIT;
