import { Suspense } from 'react';
import { Navigate, Route, Routes, useParams, useSearchParams } from 'react-router-dom';

import { ServiceWorkerNavigateBridge } from '@/components/shared/ServiceWorkerNavigateBridge';
import { PageRouteSkeleton } from '@/components/shared/PageRouteSkeleton';
import { RootLayout } from '@/components/layout/RootLayout';
import { AdminLayout } from '@/components/layouts/AdminLayout';
import { ParentLayout } from '@/components/layouts/ParentLayout';
import { StaffLayout } from '@/components/layouts/StaffLayout';
import { TeacherLayout } from '@/components/layouts/TeacherLayout';
import { XoAdminLayout } from '@/components/layouts/XoAdminLayout';
import * as P from '@/router/lazyPages';
import { ProtectedRoute } from '@/router/ProtectedRoute';

function LegacyAdminEventNewRedirect() {
  const [searchParams] = useSearchParams();
  const qs = searchParams.toString();
  return <Navigate to={qs ? `/admin/events/create?${qs}` : '/admin/events/create'} replace />;
}

function LegacyXoNurseryEventNewRedirect() {
  const [searchParams] = useSearchParams();
  const qs = searchParams.toString();
  return <Navigate to={qs ? `/xo-admin/nursery/events/create?${qs}` : '/xo-admin/nursery/events/create'} replace />;
}

function LegacyParentPayRedirect() {
  const { invoiceId } = useParams();
  return <Navigate to={invoiceId ? `/parent/invoices/${invoiceId}/pay` : '/parent/invoices'} replace />;
}

export function AppRouter() {
  return (
    <>
      <ServiceWorkerNavigateBridge />
      <Suspense fallback={<PageRouteSkeleton />}>
      <Routes>
        <Route element={<RootLayout />}>
          <Route path="/login" element={<P.LoginPage />} />
          <Route path="/signup" element={<P.ParentSignUpPage />} />
          <Route path="/signup/success" element={<P.SignupSuccessPage />} />
          <Route path="/public/inquiry/:nurseryId" element={<P.PublicInquiryFormPage />} />
          <Route path="/" element={<P.HomeRedirect />} />
          <Route path="/error" element={<P.DatabasePendingPage />} />
          <Route path="/setup/database" element={<Navigate to="/error" replace />} />
          <Route path="/unauthorized" element={<P.UnauthorizedPage />} />

          <Route element={<ProtectedRoute allowedRoles={['branch_admin', 'chain_super_admin', 'manager', 'xo_super_admin', 'teacher']} />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<P.Dashboard />} />
              <Route path="onboarding" element={<P.OnboardingWelcomePage />} />
              <Route path="onboarding/details" element={<P.OnboardingDetailsPage />} />
              <Route path="onboarding/hours" element={<P.OnboardingHoursPage />} />
              <Route path="onboarding/class" element={<P.OnboardingClassPage />} />
              <Route path="onboarding/invite" element={<P.OnboardingInviteTeacherPage />} />
              <Route path="onboarding/done" element={<P.OnboardingDonePage />} />
              <Route path="children" element={<P.AdminChildrenListPage />} />
              <Route path="children/enroll" element={<P.AdminChildEnrollmentPage />} />
              <Route path="children/:childId/health" element={<P.AdminChildHealthProfilePage />} />
              <Route path="children/:childId" element={<P.AdminChildRecordPage />} />
              <Route path="events" element={<P.AdminEventsListPage />} />
              <Route path="events/create" element={<P.AdminEventCreatePage />} />
              <Route path="events/new" element={<LegacyAdminEventNewRedirect />} />
              <Route path="events/:eventId" element={<P.AdminEventDetailsPage />} />
              <Route path="events/:eventId/edit" element={<P.AdminEventEditPage />} />
              <Route path="courses" element={<P.AdminCoursesListPage />} />
              <Route path="courses/new" element={<P.AdminCourseCreatePage />} />
              <Route path="courses/:courseId" element={<P.AdminCourseDetailPage />} />
              <Route path="courses/:courseId/edit" element={<P.AdminCourseEditPage />} />
              <Route path="invoices" element={<P.AdminInvoicesPage />} />
              <Route path="invoices/new" element={<P.AdminInvoiceCreatePage />} />
              <Route path="invoices/:invoiceId" element={<P.AdminInvoiceDetailsPage />} />
              <Route path="financial/dashboard" element={<P.AdminFinancialDashboardPage />} />
              <Route path="reports/financial" element={<P.AdminFinancialReportsPage />} />
              <Route path="staff/payroll/new" element={<P.AdminPayslipCreatePage />} />
              <Route path="staff/payroll" element={<P.AdminPayrollPage />} />
              <Route path="payroll" element={<Navigate to="/admin/staff/payroll" replace />} />
              <Route path="payroll/new" element={<Navigate to="/admin/staff/payroll/new" replace />} />
              <Route path="admissions" element={<Navigate to="/admin/admissions/applications" replace />} />
              <Route path="admissions/inquiries" element={<P.AdminInquiriesPage />} />
              <Route path="admissions/waitlist" element={<P.AdminWaitlistPage />} />
              <Route path="admissions/applications" element={<P.AdminApplicationsPage />} />
              <Route path="admissions/applications/:id" element={<P.AdminApplicationDetailPage />} />
              <Route path="admissions/import" element={<P.AdminImportChildrenPage />} />
              <Route path="inquiries" element={<Navigate to="/admin/admissions/inquiries" replace />} />
              <Route path="import" element={<P.AdminImportChildrenPage />} />
              <Route path="import/review/:jobId" element={<P.AdminImportReviewPage />} />
              <Route path="import/progress/:jobId" element={<P.AdminImportProgressPage />} />
              <Route path="loyalty" element={<P.AdminLoyaltyPage />} />
              <Route path="surveys" element={<P.AdminSurveysPage />} />
              <Route path="inventory" element={<P.AdminInventoryPage />} />
              <Route path="meals" element={<P.AdminMealPlansPage />} />
              <Route path="community" element={<P.AdminCommunityPage />} />
              <Route path="library" element={<P.AdminContentLibraryPage />} />
              <Route path="media/upload" element={<P.AdminMediaUploadPage />} />
              <Route path="media/approval" element={<P.AdminMediaApprovalPage />} />
              <Route path="media" element={<P.AdminMediaLibraryPage />} />
              <Route path="profile" element={<P.AdminProfilePage />} />
              <Route path="settings" element={<P.AdminSettingsPage />} />
              <Route path="teacher-reminders" element={<P.AdminTeacherRemindersPage />} />
              <Route path="reminders" element={<P.RemindersPage />} />
              <Route path="packages" element={<P.AdminPackagesPage />} />
              <Route path="reports" element={<P.AdminReportsPage />} />
              <Route path="reports/quarterly" element={<P.AdminReportsPage />} />
              <Route path="staff/onboarding" element={<P.AdminStaffOnboardingPage />} />
              <Route path="staff/new" element={<Navigate to="/admin/staff/onboarding" replace />} />
              <Route path="staff" element={<P.AdminStaffDirectoryPage />} />
              <Route path="staff/:staffId" element={<P.AdminStaffProfilePage />} />
              <Route path="attendance/dashboard" element={<P.AdminAttendanceDashboardPage />} />
              <Route path="attendance/child/:childId" element={<P.AdminChildAttendanceReportPage />} />
              <Route path="attendance" element={<P.AdminAttendancePage />} />
              <Route path="health/alerts" element={<P.AdminHealthAlertsDashboardPage />} />
              <Route path="qr-codes" element={<P.AdminQRCodesPage />} />
              <Route path="calendar" element={<P.AdminCalendarPage />} />
              <Route path="inbox" element={<P.AdminInboxPage />} />
              <Route path="messages" element={<P.AdminMessagesPage />} />
              <Route path="chat" element={<P.ParentMessagesPage />} />
              <Route path="messages/broadcast" element={<P.AdminBroadcastMessagePage />} />
              <Route path="messages/broadcasts" element={<P.AdminBroadcastHistoryPage />} />
              <Route path="classes" element={<P.AdminClassesListPage />} />
              <Route path="classes/new" element={<P.AdminClassDetailPage />} />
              <Route path="classes/:classId" element={<P.AdminClassDetailPage />} />
              <Route path="classes/:classId/announcements" element={<P.AdminClassAnnouncementsPage />} />
              <Route path="notifications" element={<P.AdminNotificationsPage />} />
              <Route path="settings/positions" element={<P.AdminPositionsPage />} />
              <Route path="settings/features" element={<P.AdminFeaturesPage />} />
              <Route path="settings/roles" element={<P.AdminRolesPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['parent']} />}>
            <Route path="/parent" element={<ParentLayout />}>
              <Route index element={<P.ParentHomePage />} />
              <Route path="events" element={<P.ParentEventsPage />} />
              <Route path="events/create" element={<P.ParentEventCreatePage />} />
              <Route path="events/:eventId" element={<P.ParentEventDetailsPage />} />
              <Route path="permissions" element={<P.ParentPermissionsPage />} />
              <Route path="qr-code" element={<P.ParentQRCodePage />} />
              <Route path="invoices" element={<P.ParentInvoicesPage />} />
              <Route path="payment-record" element={<P.ParentPaymentRecordPage />} />
              <Route path="invoices/:invoiceId" element={<P.ParentInvoiceDetailsPage />} />
              <Route path="invoices/:invoiceId/pay" element={<P.ParentPaymentPage />} />
              <Route path="pay/:invoiceId" element={<LegacyParentPayRedirect />} />
              <Route path="inbox" element={<P.ParentInboxPage />} />
              <Route path="messages" element={<P.ParentMessagesPage />} />
              <Route path="chat" element={<P.AdminChatPage />} />
              <Route path="notifications" element={<P.ParentNotificationsPage />} />
              <Route path="daily-reports" element={<P.ParentDailyReportsPage />} />
              <Route path="quarterly-reports" element={<P.ParentQuarterlyReportsPage />} />
              <Route path="reports" element={<Navigate to="/parent/daily-reports" replace />} />
              <Route path="children" element={<P.ParentChildrenPage />} />
              <Route path="milestones" element={<P.ParentMilestonesPage />} />
              <Route path="media" element={<P.ParentMediaGalleryPage />} />
              <Route path="attendance" element={<P.ParentAttendanceHistoryPage />} />
              <Route path="profile" element={<P.ParentProfilePage />} />
              <Route path="children/:childId/health" element={<P.ParentChildHealthPage />} />
              <Route path="child/:childId/qr" element={<P.ParentChildProfilePage />} />
              <Route path="applications" element={<P.ParentApplicationsPage />} />
              <Route path="applications/:id" element={<P.ParentApplicationFormPage />} />
              <Route path="rewards" element={<P.ParentRewardsPage />} />
              <Route path="surveys" element={<P.ParentSurveysPage />} />
              <Route path="courses" element={<P.ParentCoursesPage />} />
              <Route path="meals" element={<P.ParentMealsPage />} />
              <Route path="community" element={<P.ParentCommunityPage />} />
              <Route path="library" element={<P.ParentContentLibraryPage />} />
              <Route path="settings" element={<P.HelpAiPreferencesPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['teacher']} />}>
            <Route path="/teacher" element={<TeacherLayout />}>
              <Route index element={<P.TeacherHomePage />} />
              <Route path="attendance" element={<P.TeacherAttendancePage />} />
              <Route path="daily-reports" element={<P.TeacherDailyReportPage />} />
              <Route path="daily-reports/:childId/:date" element={<P.TeacherDailyReportEditorPage />} />
              <Route path="reports" element={<Navigate to="/teacher/daily-reports" replace />} />
              <Route path="reports/create" element={<Navigate to="/teacher/daily-reports" replace />} />
              <Route path="milestones" element={<P.TeacherMilestonesListPage />} />
              <Route path="milestones/record" element={<P.TeacherMilestoneRecordPage />} />
              <Route path="inbox" element={<P.TeacherInboxPage />} />
              <Route path="messages" element={<P.TeacherMessagesPage />} />
              <Route path="chat" element={<P.AdminChatPage />} />
              <Route path="media" element={<P.TeacherMediaListPage />} />
              <Route path="media/upload" element={<P.TeacherMediaUploadPage />} />
              <Route path="scanner" element={<P.QRScannerPage />} />
              <Route path="classes" element={<P.TeacherClassesHubPage />} />
              <Route path="classes/:classId/announcements" element={<P.TeacherClassAnnouncementsPage />} />
              <Route path="events" element={<P.TeacherEventsPage />} />
              <Route path="courses" element={<P.TeacherCoursesPage />} />
              <Route path="community" element={<P.TeacherCommunityPage />} />
              <Route path="reminders" element={<P.RemindersPage />} />
              <Route path="profile" element={<P.TeacherProfilePage />} />
              <Route path="settings" element={<P.HelpAiPreferencesPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['teacher']} />}>
            <Route path="/staff" element={<StaffLayout />}>
              <Route path="payslips" element={<P.StaffPayslipsPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['xo_super_admin']} />}>
            <Route path="/xo-admin" element={<XoAdminLayout />}>
              <Route index element={<P.XoAdminHomePage />} />
              <Route path="nurseries" element={<P.NurseryListPage />} />
              <Route path="nurseries/new" element={<P.NurseryCreatePage />} />
              <Route path="nurseries/:id" element={<P.NurseryDetailPage />} />
              <Route path="nurseries/:id/edit" element={<P.NurseryEditPage />} />
              <Route path="analytics" element={<P.AnalyticsPage />} />
              <Route path="payments" element={<P.XoAdminPaymentsPage />} />
              <Route path="settings" element={<P.XoAdminSettingsPage />} />
              <Route path="nursery" element={<P.XoAdminNurseryDashboardPage />} />
              <Route path="nursery/onboarding" element={<P.OnboardingWelcomePage />} />
              <Route path="nursery/onboarding/details" element={<P.OnboardingDetailsPage />} />
              <Route path="nursery/onboarding/hours" element={<P.OnboardingHoursPage />} />
              <Route path="nursery/onboarding/class" element={<P.OnboardingClassPage />} />
              <Route path="nursery/onboarding/invite" element={<P.OnboardingInviteTeacherPage />} />
              <Route path="nursery/onboarding/done" element={<P.OnboardingDonePage />} />
              <Route path="nursery/children" element={<P.AdminChildrenListPage />} />
              <Route path="nursery/children/enroll" element={<P.AdminChildEnrollmentPage />} />
              <Route path="nursery/children/:childId/health" element={<P.AdminChildHealthProfilePage />} />
              <Route path="nursery/children/:childId" element={<P.AdminChildRecordPage />} />
              <Route path="nursery/events" element={<P.AdminEventsListPage />} />
              <Route path="nursery/events/create" element={<P.AdminEventCreatePage />} />
              <Route path="nursery/events/new" element={<LegacyXoNurseryEventNewRedirect />} />
              <Route path="nursery/events/:eventId" element={<P.AdminEventDetailsPage />} />
              <Route path="nursery/events/:eventId/edit" element={<P.AdminEventEditPage />} />
              <Route path="nursery/courses" element={<P.AdminCoursesListPage />} />
              <Route path="nursery/courses/new" element={<P.AdminCourseCreatePage />} />
              <Route path="nursery/courses/:courseId" element={<P.AdminCourseDetailPage />} />
              <Route path="nursery/courses/:courseId/edit" element={<P.AdminCourseEditPage />} />
              <Route path="nursery/invoices" element={<P.AdminInvoicesPage />} />
              <Route path="nursery/invoices/new" element={<P.AdminInvoiceCreatePage />} />
              <Route path="nursery/invoices/:invoiceId" element={<P.AdminInvoiceDetailsPage />} />
              <Route path="nursery/financial/dashboard" element={<P.AdminFinancialDashboardPage />} />
              <Route path="nursery/reports/financial" element={<P.AdminFinancialReportsPage />} />
              <Route path="nursery/staff/payroll/new" element={<P.AdminPayslipCreatePage />} />
              <Route path="nursery/staff/payroll" element={<P.AdminPayrollPage />} />
              <Route path="nursery/payroll" element={<Navigate to="/xo-admin/nursery/staff/payroll" replace />} />
              <Route path="nursery/payroll/new" element={<Navigate to="/xo-admin/nursery/staff/payroll/new" replace />} />
              <Route path="nursery/admissions" element={<Navigate to="/xo-admin/nursery/admissions/applications" replace />} />
              <Route path="nursery/admissions/inquiries" element={<P.AdminInquiriesPage />} />
              <Route path="nursery/admissions/waitlist" element={<P.AdminWaitlistPage />} />
              <Route path="nursery/admissions/applications" element={<P.AdminApplicationsPage />} />
              <Route path="nursery/admissions/applications/:id" element={<P.AdminApplicationDetailPage />} />
              <Route path="nursery/admissions/import" element={<P.AdminImportChildrenPage />} />
              <Route path="nursery/inquiries" element={<Navigate to="/xo-admin/nursery/admissions/inquiries" replace />} />
              <Route path="nursery/import" element={<P.AdminImportChildrenPage />} />
              <Route path="nursery/import/review/:jobId" element={<P.AdminImportReviewPage />} />
              <Route path="nursery/import/progress/:jobId" element={<P.AdminImportProgressPage />} />
              <Route path="nursery/loyalty" element={<P.AdminLoyaltyPage />} />
              <Route path="nursery/surveys" element={<P.AdminSurveysPage />} />
              <Route path="nursery/inventory" element={<P.AdminInventoryPage />} />
              <Route path="nursery/meals" element={<P.AdminMealPlansPage />} />
              <Route path="nursery/community" element={<P.AdminCommunityPage />} />
              <Route path="nursery/library" element={<P.AdminContentLibraryPage />} />
              <Route path="nursery/media/upload" element={<P.AdminMediaUploadPage />} />
              <Route path="nursery/media/approval" element={<P.AdminMediaApprovalPage />} />
              <Route path="nursery/media" element={<P.AdminMediaLibraryPage />} />
              <Route path="nursery/profile" element={<P.AdminProfilePage />} />
              <Route path="nursery/settings" element={<P.AdminSettingsPage />} />
              <Route path="nursery/teacher-reminders" element={<P.AdminTeacherRemindersPage />} />
              <Route path="nursery/reminders" element={<P.RemindersPage />} />
              <Route path="nursery/packages" element={<P.AdminPackagesPage />} />
              <Route path="nursery/reports" element={<P.AdminReportsPage />} />
              <Route path="nursery/reports/quarterly" element={<P.AdminReportsPage />} />
              <Route path="nursery/staff/onboarding" element={<P.AdminStaffOnboardingPage />} />
              <Route path="nursery/staff/new" element={<Navigate to="/xo-admin/nursery/staff/onboarding" replace />} />
              <Route path="nursery/staff" element={<P.AdminStaffDirectoryPage />} />
              <Route path="nursery/staff/:staffId" element={<P.AdminStaffProfilePage />} />
              <Route path="nursery/attendance/dashboard" element={<P.AdminAttendanceDashboardPage />} />
              <Route path="nursery/attendance/child/:childId" element={<P.AdminChildAttendanceReportPage />} />
              <Route path="nursery/attendance" element={<P.AdminAttendancePage />} />
              <Route path="nursery/health/alerts" element={<P.AdminHealthAlertsDashboardPage />} />
              <Route path="nursery/qr-codes" element={<P.AdminQRCodesPage />} />
              <Route path="nursery/calendar" element={<P.AdminCalendarPage />} />
              <Route path="nursery/inbox" element={<P.AdminInboxPage />} />
              <Route path="nursery/messages" element={<P.AdminMessagesPage />} />
              <Route path="nursery/chat" element={<P.AdminChatPage />} />
              <Route path="nursery/messages/broadcast" element={<P.AdminBroadcastMessagePage />} />
              <Route path="nursery/messages/broadcasts" element={<P.AdminBroadcastHistoryPage />} />
              <Route path="nursery/classes" element={<P.AdminClassesListPage />} />
              <Route path="nursery/classes/new" element={<P.AdminClassDetailPage />} />
              <Route path="nursery/classes/:classId" element={<P.AdminClassDetailPage />} />
              <Route path="nursery/classes/:classId/announcements" element={<P.AdminClassAnnouncementsPage />} />
              <Route path="nursery/notifications" element={<P.AdminNotificationsPage />} />
              <Route path="nursery/settings/positions" element={<P.AdminPositionsPage />} />
              <Route path="nursery/settings/features" element={<P.AdminFeaturesPage />} />
              <Route path="nursery/settings/roles" element={<P.AdminRolesPage />} />
            </Route>
          </Route>

          <Route path="*" element={<P.NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
    </>
  );
}
