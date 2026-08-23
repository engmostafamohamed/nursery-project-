-- Migration 055: Add missing foreign key indexes for better query performance
-- These indexes will speed up JOIN operations and foreign key constraint checks

-- Applications & Documents
CREATE INDEX IF NOT EXISTS idx_application_documents_verified_by ON application_documents(verified_by);
CREATE INDEX IF NOT EXISTS idx_applications_inquiry_id ON applications(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_applications_reviewed_by ON applications(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_applications_child_id ON applications(child_id);

-- Attendance
CREATE INDEX IF NOT EXISTS idx_attendance_records_pickup_person_id ON attendance_records(pickup_person_id);

-- Bus & Transportation
CREATE INDEX IF NOT EXISTS idx_bus_routes_driver_id ON bus_routes(driver_id);
CREATE INDEX IF NOT EXISTS idx_bus_routes_matron_id ON bus_routes(matron_id);

-- Camera Access
CREATE INDEX IF NOT EXISTS idx_camera_access_granted_by ON camera_access(granted_by);

-- Documents
CREATE INDEX IF NOT EXISTS idx_child_documents_uploaded_by ON child_documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_child_health_documents_uploaded_by ON child_health_documents(uploaded_by);

-- Community
CREATE INDEX IF NOT EXISTS idx_community_posts_approved_by ON community_posts(approved_by);
CREATE INDEX IF NOT EXISTS idx_post_comments_author_id ON post_comments(author_id);

-- Inquiries
CREATE INDEX IF NOT EXISTS idx_inquiries_assigned_to ON inquiries(assigned_to);

-- Media
CREATE INDEX IF NOT EXISTS idx_media_approved_by ON media(approved_by);

-- Consents
CREATE INDEX IF NOT EXISTS idx_parental_consents_parent_id ON parental_consents(parent_id);

-- Payments
CREATE INDEX IF NOT EXISTS idx_payment_attempts_confirmed_by ON payment_attempts(confirmed_by);

-- Staff
CREATE INDEX IF NOT EXISTS idx_staff_payroll_paid_by ON staff_payroll(paid_by);
CREATE INDEX IF NOT EXISTS idx_staff_payroll_created_by ON staff_payroll(created_by);
CREATE INDEX IF NOT EXISTS idx_staff_schedules_nursery_id ON staff_schedules(nursery_id);

-- Pickup Codes
CREATE INDEX IF NOT EXISTS idx_temporary_pickup_codes_created_by ON temporary_pickup_codes(created_by);
CREATE INDEX IF NOT EXISTS idx_temporary_pickup_codes_used_by ON temporary_pickup_codes(used_by);

COMMENT ON INDEX idx_application_documents_verified_by IS 'Performance: Speeds up queries filtering by verifier';
COMMENT ON INDEX idx_applications_inquiry_id IS 'Performance: Speeds up joins between applications and inquiries';
COMMENT ON INDEX idx_attendance_records_pickup_person_id IS 'Performance: Speeds up pickup person queries';
COMMENT ON INDEX idx_media_approved_by IS 'Performance: Speeds up media approval queries';;
