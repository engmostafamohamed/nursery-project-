-- Migration 015: Nursery Settings - Configuration-First Architecture
-- Date: March 27, 2026
-- Purpose: Store all configurable business rules per nursery (multi-tenant flexibility)

CREATE TABLE IF NOT EXISTS public.nursery_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id UUID NOT NULL REFERENCES public.nurseries(id) ON DELETE CASCADE,
  
  -- Attendance & Operations
  standard_start_time TIME DEFAULT '07:00',
  standard_end_time TIME DEFAULT '17:00',
  late_pickup_grace_minutes INTEGER DEFAULT 15,
  late_pickup_fee_per_hour NUMERIC(10,2) DEFAULT 50.00,
  absence_alert_time TIME DEFAULT '09:30',
  end_of_day_checklist_time TIME DEFAULT '17:00',
  
  -- Permissions & Events
  permission_deadline_default_hours INTEGER DEFAULT 24,
  event_cancellation_window_hours INTEGER DEFAULT 48,
  paid_event_refund_policy TEXT CHECK (paid_event_refund_policy IN ('full', 'partial', 'none')) DEFAULT 'none',
  
  -- Communication
  quiet_hours_start TIME DEFAULT '21:00',
  quiet_hours_end TIME DEFAULT '07:00',
  max_whatsapp_per_parent_per_day INTEGER DEFAULT 10,
  allow_parent_quiet_hours_override BOOLEAN DEFAULT true,
  
  -- Financial
  pricing_model TEXT CHECK (pricing_model IN ('fixed', 'per_child', 'hourly', 'hybrid')) DEFAULT 'fixed',
  monthly_rate NUMERIC(10,2),
  per_child_rate NUMERIC(10,2),
  hourly_rate NUMERIC(10,2),
  invoice_due_days INTEGER DEFAULT 7,
  late_payment_fee_percentage NUMERIC(5,2) DEFAULT 5.00,
  sibling_discount_2nd_child_percentage NUMERIC(5,2) DEFAULT 10.00,
  sibling_discount_3rd_child_percentage NUMERIC(5,2) DEFAULT 15.00,
  payment_methods_enabled JSONB DEFAULT '["paymob", "cash", "bank_transfer"]'::jsonb,
  
  -- Summer Pause
  summer_pause_enabled BOOLEAN DEFAULT true,
  summer_pause_min_weeks INTEGER DEFAULT 2,
  summer_pause_max_weeks INTEGER DEFAULT 16,
  summer_pause_auto_start_date DATE,
  summer_pause_auto_end_date DATE,
  summer_pause_charges_percentage NUMERIC(5,2) DEFAULT 0.00,
  
  -- Media & Privacy
  photo_approval_required BOOLEAN DEFAULT true,
  photo_auto_approve_after_hours INTEGER,
  video_enabled BOOLEAN DEFAULT false,
  max_photo_per_child_per_day INTEGER DEFAULT 10,
  
  -- CCTV
  cctv_enabled BOOLEAN DEFAULT false,
  cctv_stream_token_duration_minutes INTEGER DEFAULT 30,
  cctv_max_concurrent_viewers_per_camera INTEGER DEFAULT 5,
  cctv_recording_retention_days INTEGER DEFAULT 7,
  
  -- Loyalty Program
  loyalty_enabled BOOLEAN DEFAULT true,
  points_per_egp NUMERIC(5,2) DEFAULT 1.00,
  points_redemption_rate NUMERIC(5,2) DEFAULT 0.10,
  loyalty_tier_thresholds JSONB DEFAULT '{"silver": 0, "gold": 1000, "platinum": 5000}'::jsonb,
  
  -- Language & Localization
  default_language TEXT CHECK (default_language IN ('ar', 'en')) DEFAULT 'ar',
  timezone TEXT DEFAULT 'Africa/Cairo',
  currency TEXT DEFAULT 'EGP',
  date_format TEXT DEFAULT 'DD/MM/YYYY',
  
  -- Branding
  primary_color TEXT DEFAULT '#4F46E5',
  secondary_color TEXT DEFAULT '#06B6D4',
  accent_color TEXT DEFAULT '#F59E0B',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(nursery_id)
);

-- Enable RLS
ALTER TABLE public.nursery_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view settings for their nursery"
ON public.nursery_settings
FOR SELECT
USING (
  nursery_id IN (SELECT nursery_id FROM public.users WHERE id = auth.uid())
);

CREATE POLICY "Admins can update settings for their nursery"
ON public.nursery_settings
FOR UPDATE
USING (
  nursery_id IN (
    SELECT nursery_id FROM public.users 
    WHERE id = auth.uid() 
    AND role IN ('branch_admin', 'chain_super_admin', 'xo_super_admin')
  )
);

-- Auto-create settings row when nursery is created
CREATE OR REPLACE FUNCTION create_default_nursery_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.nursery_settings (nursery_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_default_nursery_settings
AFTER INSERT ON public.nurseries
FOR EACH ROW
EXECUTE FUNCTION create_default_nursery_settings();

-- Index
CREATE INDEX IF NOT EXISTS idx_nursery_settings_nursery_id ON public.nursery_settings(nursery_id);

-- Comment
COMMENT ON TABLE public.nursery_settings IS 'Configuration-first architecture: all business rules configurable per nursery for multi-tenant flexibility';
