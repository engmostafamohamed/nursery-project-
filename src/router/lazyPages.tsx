import { lazy } from 'react';

export const Dashboard = lazy(() => import('@/pages/admin/Dashboard').then((m) => ({ default: m.Dashboard })));
export const AdminEventCreatePage = lazy(() =>
  import('@/pages/admin/AdminEventCreatePage').then((m) => ({ default: m.AdminEventCreatePage })),
);
export const AdminAttendanceDashboardPage = lazy(() =>
  import('@/pages/admin/AdminAttendanceDashboardPage').then((m) => ({ default: m.AdminAttendanceDashboardPage })),
);
export const AdminAttendancePage = lazy(() =>
  import('@/pages/admin/AdminAttendancePage').then((m) => ({ default: m.AdminAttendancePage })),
);
export const AdminChildAttendanceReportPage = lazy(() =>
  import('@/pages/admin/AdminChildAttendanceReportPage').then((m) => ({ default: m.AdminChildAttendanceReportPage })),
);
export const AdminCalendarPage = lazy(() =>
  import('@/pages/admin/AdminCalendarPage').then((m) => ({ default: m.AdminCalendarPage })),
);
export const AdminCoursesListPage = lazy(() =>
  import('@/pages/admin/AdminCoursesListPage').then((m) => ({ default: m.AdminCoursesListPage })),
);
export const AdminCourseCreatePage = lazy(() =>
  import('@/pages/admin/AdminCourseFormPage').then((m) => ({ default: m.AdminCourseCreatePage })),
);
export const AdminCourseEditPage = lazy(() =>
  import('@/pages/admin/AdminCourseFormPage').then((m) => ({ default: m.AdminCourseEditPage })),
);
export const AdminCourseDetailPage = lazy(() =>
  import('@/pages/admin/AdminCourseDetailPage').then((m) => ({ default: m.AdminCourseDetailPage })),
);
export const TeacherCoursesPage = lazy(() =>
  import('@/pages/teacher/TeacherCoursesPage').then((m) => ({ default: m.TeacherCoursesPage })),
);
export const ParentCoursesPage = lazy(() =>
  import('@/pages/parent/ParentCoursesPage').then((m) => ({ default: m.ParentCoursesPage })),
);
export const AdminEventDetailsPage = lazy(() =>
  import('@/pages/admin/AdminEventDetailsPage').then((m) => ({ default: m.AdminEventDetailsPage })),
);
export const AdminEventsListPage = lazy(() =>
  import('@/pages/admin/AdminEventsListPage').then((m) => ({ default: m.AdminEventsListPage })),
);
export const AdminEventEditPage = lazy(() =>
  import('@/pages/admin/AdminEventEditPage').then((m) => ({ default: m.AdminEventEditPage })),
);
export const AdminInvoiceCreatePage = lazy(() =>
  import('@/pages/admin/AdminInvoiceCreatePage').then((m) => ({ default: m.AdminInvoiceCreatePage })),
);
export const AdminInvoiceDetailsPage = lazy(() =>
  import('@/pages/admin/AdminInvoiceDetailsPage').then((m) => ({ default: m.AdminInvoiceDetailsPage })),
);
export const AdminInvoicesPage = lazy(() =>
  import('@/pages/admin/AdminInvoicesPage').then((m) => ({ default: m.AdminInvoicesPage })),
);
export const AdminFinancialDashboardPage = lazy(() =>
  import('@/pages/admin/AdminFinancialDashboardPage').then((m) => ({ default: m.AdminFinancialDashboardPage })),
);
export const AdminFinancialReportsPage = lazy(() =>
  import('@/pages/admin/AdminFinancialReportsPage').then((m) => ({ default: m.AdminFinancialReportsPage })),
);
export const AdminQRCodesPage = lazy(() =>
  import('@/pages/admin/AdminQRCodesPage').then((m) => ({ default: m.AdminQRCodesPage })),
);
export const AdminPayrollPage = lazy(() =>
  import('@/pages/admin/AdminPayrollPage').then((m) => ({ default: m.AdminPayrollPage })),
);
export const AdminPayslipCreatePage = lazy(() =>
  import('@/pages/admin/AdminPayslipCreatePage').then((m) => ({ default: m.AdminPayslipCreatePage })),
);
export const AdminInquiriesPage = lazy(() =>
  import('@/pages/admin/AdminInquiriesPage').then((m) => ({ default: m.AdminInquiriesPage })),
);
export const AdminWaitlistPage = lazy(() =>
  import('@/pages/admin/AdminWaitlistPage').then((m) => ({ default: m.AdminWaitlistPage })),
);
export const AdminApplicationsPage = lazy(() =>
  import('@/pages/admin/AdminApplicationsPage').then((m) => ({ default: m.AdminApplicationsPage })),
);
export const AdminApplicationDetailPage = lazy(() =>
  import('@/pages/admin/AdminApplicationDetailPage').then((m) => ({ default: m.AdminApplicationDetailPage })),
);
export const AdminBulkImportPage = lazy(() =>
  import('@/pages/admin/AdminBulkImportPage').then((m) => ({ default: m.AdminBulkImportPage })),
);
export const AdminImportChildrenPage = lazy(() =>
  import('@/pages/admin/AdminImportChildrenPage').then((m) => ({ default: m.AdminImportChildrenPage })),
);
export const AdminImportReviewPage = lazy(() =>
  import('@/pages/admin/AdminImportReviewPage').then((m) => ({ default: m.AdminImportReviewPage })),
);
export const AdminImportProgressPage = lazy(() =>
  import('@/pages/admin/AdminImportProgressPage').then((m) => ({ default: m.AdminImportProgressPage })),
);
export const AdminLoyaltyPage = lazy(() =>
  import('@/pages/admin/AdminLoyaltyPage').then((m) => ({ default: m.AdminLoyaltyPage })),
);
export const AdminSurveysPage = lazy(() =>
  import('@/pages/admin/AdminSurveysPage').then((m) => ({ default: m.AdminSurveysPage })),
);
export const AdminInventoryPage = lazy(() =>
  import('@/pages/admin/AdminInventoryPage').then((m) => ({ default: m.AdminInventoryPage })),
);
export const AdminMealPlansPage = lazy(() =>
  import('@/pages/admin/AdminMealPlansPage').then((m) => ({ default: m.AdminMealPlansPage })),
);
export const AdminCommunityPage = lazy(() =>
  import('@/pages/admin/AdminCommunityPage').then((m) => ({ default: m.AdminCommunityPage })),
);
export const AdminContentLibraryPage = lazy(() =>
  import('@/pages/admin/AdminContentLibraryPage').then((m) => ({ default: m.AdminContentLibraryPage })),
);
export const AdminProfilePage = lazy(() =>
  import('@/pages/admin/AdminProfilePage').then((m) => ({ default: m.AdminProfilePage })),
);
export const AdminSettingsPage = lazy(() =>
  import('@/pages/admin/AdminSettingsPage').then((m) => ({ default: m.AdminSettingsPage })),
);
export const AdminPositionsPage = lazy(() =>
  import('@/pages/admin/settings/AdminPositionsPage').then((m) => ({ default: m.AdminPositionsPage })),
);
export const AdminFeaturesPage = lazy(() =>
  import('@/pages/admin/settings/AdminFeaturesPage').then((m) => ({ default: m.AdminFeaturesPage })),
);
export const AdminRolesPage = lazy(() =>
  import('@/pages/admin/settings/AdminRolesPage').then((m) => ({ default: m.AdminRolesPage })),
);
export const AdminTeacherRemindersPage = lazy(() =>
  import('@/pages/admin/AdminTeacherRemindersPage').then((m) => ({
    default: m.AdminTeacherRemindersPage,
  })),
);
export const AdminPackagesPage = lazy(() =>
  import('@/pages/admin/AdminPackagesPage').then((m) => ({ default: m.AdminPackagesPage })),
);
export const AdminDealsPage = lazy(() =>
  import('@/pages/admin/AdminDealsPage').then((m) => ({ default: m.AdminDealsPage })),
);
export const AdminReportsPage = lazy(() =>
  import('@/pages/admin/AdminReportsPage').then((m) => ({ default: m.AdminReportsPage })),
);
export const ParentQuarterlyReportsPage = lazy(() =>
  import('@/pages/parent/ParentQuarterlyReportsPage').then((m) => ({
    default: m.ParentQuarterlyReportsPage,
  })),
);
export const AdminBroadcastHistoryPage = lazy(() =>
  import('@/pages/admin/AdminBroadcastHistoryPage').then((m) => ({ default: m.AdminBroadcastHistoryPage })),
);
export const AdminBroadcastMessagePage = lazy(() =>
  import('@/pages/admin/AdminBroadcastMessagePage').then((m) => ({ default: m.AdminBroadcastMessagePage })),
);
export const AdminClassAnnouncementsPage = lazy(() =>
  import('@/pages/admin/AdminClassAnnouncementsPage').then((m) => ({ default: m.AdminClassAnnouncementsPage })),
);
export const AdminClassesListPage = lazy(() =>
  import('@/pages/admin/AdminClassesListPage').then((m) => ({ default: m.AdminClassesListPage })),
);
export const AdminClassDetailPage = lazy(() =>
  import('@/pages/admin/AdminClassDetailPage').then((m) => ({ default: m.AdminClassDetailPage })),
);
export const AdminMessagesPage = lazy(() =>
  import('@/pages/admin/AdminMessagesPage').then((m) => ({ default: m.AdminMessagesPage })),
);
export const AdminChatPage = lazy(() =>
  import('@/pages/admin/AdminChatPage').then((m) => ({ default: m.AdminChatPage })),
);
export const AdminNotificationsPage = lazy(() =>
  import('@/pages/admin/AdminNotificationsPage').then((m) => ({ default: m.AdminNotificationsPage })),
);
export const AdminInboxPage = lazy(() =>
  import('@/pages/admin/AdminInboxPage').then((m) => ({ default: m.AdminInboxPage })),
);
export const AdminMediaApprovalPage = lazy(() =>
  import('@/pages/admin/AdminMediaApprovalPage').then((m) => ({ default: m.AdminMediaApprovalPage })),
);
export const AdminMediaLibraryPage = lazy(() =>
  import('@/pages/admin/AdminMediaLibraryPage').then((m) => ({ default: m.AdminMediaLibraryPage })),
);
export const AdminMediaUploadPage = lazy(() =>
  import('@/pages/admin/AdminMediaUploadPage').then((m) => ({ default: m.AdminMediaUploadPage })),
);
export const AdminChildHealthProfilePage = lazy(() =>
  import('@/pages/admin/AdminChildHealthProfilePage').then((m) => ({ default: m.AdminChildHealthProfilePage })),
);
export const AdminChildRecordPage = lazy(() =>
  import('@/pages/admin/AdminChildRecordPage').then((m) => ({ default: m.AdminChildRecordPage })),
);
export const AdminChildrenListPage = lazy(() =>
  import('@/pages/admin/AdminChildrenListPage').then((m) => ({ default: m.AdminChildrenListPage })),
);
export const AdminHealthAlertsDashboardPage = lazy(() =>
  import('@/pages/admin/AdminHealthAlertsDashboardPage').then((m) => ({ default: m.AdminHealthAlertsDashboardPage })),
);
export const AdminStaffDirectoryPage = lazy(() =>
  import('@/pages/admin/AdminStaffDirectoryPage').then((m) => ({ default: m.AdminStaffDirectoryPage })),
);
export const AdminStaffOnboardingPage = lazy(() =>
  import('@/pages/admin/AdminStaffOnboardingPage').then((m) => ({ default: m.AdminStaffOnboardingPage })),
);
export const AdminStaffProfilePage = lazy(() =>
  import('@/pages/admin/AdminStaffProfilePage').then((m) => ({ default: m.AdminStaffProfilePage })),
);
export const AdminChildEnrollmentPage = lazy(() =>
  import('@/pages/admin/AdminChildEnrollmentPage').then((m) => ({ default: m.AdminChildEnrollmentPage })),
);
export const OnboardingWelcomePage = lazy(() =>
  import('@/pages/admin/OnboardingWelcomePage').then((m) => ({ default: m.OnboardingWelcomePage })),
);
export const OnboardingClassPage = lazy(() =>
  import('@/pages/admin/onboarding/OnboardingClassPage').then((m) => ({ default: m.OnboardingClassPage })),
);
export const OnboardingDetailsPage = lazy(() =>
  import('@/pages/admin/onboarding/OnboardingDetailsPage').then((m) => ({ default: m.OnboardingDetailsPage })),
);
export const OnboardingDonePage = lazy(() =>
  import('@/pages/admin/onboarding/OnboardingDonePage').then((m) => ({ default: m.OnboardingDonePage })),
);
export const OnboardingHoursPage = lazy(() =>
  import('@/pages/admin/onboarding/OnboardingHoursPage').then((m) => ({ default: m.OnboardingHoursPage })),
);
export const OnboardingInviteTeacherPage = lazy(() =>
  import('@/pages/admin/onboarding/OnboardingInviteTeacherPage').then((m) => ({ default: m.OnboardingInviteTeacherPage })),
);
export const LoginPage = lazy(() => import('@/pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })));
export const ParentSignUpPage = lazy(() =>
  import('@/pages/auth/ParentSignUpPage').then((m) => ({ default: m.ParentSignUpPage })),
);
export const SignupSuccessPage = lazy(() =>
  import('@/pages/auth/SignupSuccessPage').then((m) => ({ default: m.SignupSuccessPage })),
);
export const UnauthorizedPage = lazy(() =>
  import('@/pages/auth/UnauthorizedPage').then((m) => ({ default: m.UnauthorizedPage })),
);
export const HomeRedirect = lazy(() => import('@/pages/HomeRedirect').then((m) => ({ default: m.HomeRedirect })));
export const NotFoundPage = lazy(() => import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));
export const ParentAttendanceHistoryPage = lazy(() =>
  import('@/pages/parent/ParentAttendanceHistoryPage').then((m) => ({ default: m.ParentAttendanceHistoryPage })),
);
export const ParentChildProfilePage = lazy(() =>
  import('@/pages/parent/ParentChildProfilePage').then((m) => ({ default: m.ParentChildProfilePage })),
);
export const ParentProfilePage = lazy(() =>
  import('@/pages/parent/ParentProfilePage').then((m) => ({ default: m.ParentProfilePage })),
);
export const ParentChildHealthPage = lazy(() =>
  import('@/pages/parent/ParentChildHealthPage').then((m) => ({ default: m.ParentChildHealthPage })),
);
export const ParentChildrenPage = lazy(() =>
  import('@/pages/parent/ParentChildrenPage').then((m) => ({ default: m.ParentChildrenPage })),
);
export const ParentApplicationsPage = lazy(() =>
  import('@/pages/parent/ParentApplicationsPage').then((m) => ({ default: m.ParentApplicationsPage })),
);
export const ParentEventDetailsPage = lazy(() =>
  import('@/pages/parent/ParentEventDetailsPage').then((m) => ({ default: m.ParentEventDetailsPage })),
);
export const ParentEventCreatePage = lazy(() =>
  import('@/pages/parent/ParentEventCreatePage').then((m) => ({ default: m.ParentEventCreatePage })),
);
export const ParentEventsPage = lazy(() =>
  import('@/pages/parent/ParentEventsPage').then((m) => ({ default: m.ParentEventsPage })),
);
export const ParentPermissionsPage = lazy(() =>
  import('@/pages/parent/ParentPermissionsPage').then((m) => ({ default: m.ParentPermissionsPage })),
);
export const ParentQRCodePage = lazy(() =>
  import('@/pages/parent/ParentQRCodePage').then((m) => ({ default: m.ParentQRCodePage })),
);
export const ParentInvoiceDetailsPage = lazy(() =>
  import('@/pages/parent/ParentInvoiceDetailsPage').then((m) => ({ default: m.ParentInvoiceDetailsPage })),
);
export const ParentInvoicesPage = lazy(() =>
  import('@/pages/parent/ParentInvoicesPage').then((m) => ({ default: m.ParentInvoicesPage })),
);
export const ParentPaymentPage = lazy(() =>
  import('@/pages/parent/ParentPaymentPage').then((m) => ({ default: m.ParentPaymentPage })),
);
export const ParentPaymentRecordPage = lazy(() =>
  import('@/pages/parent/ParentPaymentRecordPage').then((m) => ({ default: m.ParentPaymentRecordPage })),
);
export const ParentMediaGalleryPage = lazy(() =>
  import('@/pages/parent/ParentMediaGalleryPage').then((m) => ({ default: m.ParentMediaGalleryPage })),
);
export const ParentDailyReportsPage = lazy(() =>
  import('@/pages/parent/ParentDailyReportsPage').then((m) => ({ default: m.ParentDailyReportsPage })),
);
export const ParentMilestonesPage = lazy(() =>
  import('@/pages/parent/ParentMilestonesPage').then((m) => ({ default: m.ParentMilestonesPage })),
);
export const ParentInboxPage = lazy(() =>
  import('@/pages/parent/ParentInboxPage').then((m) => ({ default: m.ParentInboxPage })),
);
export const ParentMessagesPage = lazy(() =>
  import('@/pages/parent/ParentMessagesPage').then((m) => ({ default: m.ParentMessagesPage })),
);
export const ParentNotificationsPage = lazy(() =>
  import('@/pages/parent/ParentNotificationsPage').then((m) => ({ default: m.ParentNotificationsPage })),
);
export const ParentHomePage = lazy(() =>
  import('@/pages/parent/ParentHomePage').then((m) => ({ default: m.ParentHomePage })),
);
export const ParentApplicationFormPage = lazy(() =>
  import('@/pages/parent/ParentApplicationFormPage').then((m) => ({ default: m.ParentApplicationFormPage })),
);
export const ParentRewardsPage = lazy(() =>
  import('@/pages/parent/ParentRewardsPage').then((m) => ({ default: m.ParentRewardsPage })),
);
export const ParentSurveysPage = lazy(() =>
  import('@/pages/parent/ParentSurveysPage').then((m) => ({ default: m.ParentSurveysPage })),
);
export const ParentMealsPage = lazy(() =>
  import('@/pages/parent/ParentMealsPage').then((m) => ({ default: m.ParentMealsPage })),
);
export const ParentCommunityPage = lazy(() =>
  import('@/pages/parent/ParentCommunityPage').then((m) => ({ default: m.ParentCommunityPage })),
);
export const ParentContentLibraryPage = lazy(() =>
  import('@/pages/parent/ParentContentLibraryPage').then((m) => ({ default: m.ParentContentLibraryPage })),
);
export const StaffPayslipsPage = lazy(() =>
  import('@/pages/staff/StaffPayslipsPage').then((m) => ({ default: m.StaffPayslipsPage })),
);
export const PublicInquiryFormPage = lazy(() =>
  import('@/pages/public/PublicInquiryFormPage').then((m) => ({ default: m.PublicInquiryFormPage })),
);
export const DatabasePendingPage = lazy(() =>
  import('@/pages/setup/DatabasePendingPage').then((m) => ({ default: m.DatabasePendingPage })),
);
export const TeacherHomePage = lazy(() =>
  import('@/pages/teacher/TeacherHomePage').then((m) => ({ default: m.TeacherHomePage })),
);
export const TeacherMessagesPage = lazy(() =>
  import('@/pages/teacher/TeacherMessagesPage').then((m) => ({ default: m.TeacherMessagesPage })),
);
export const TeacherAttendancePage = lazy(() =>
  import('@/pages/teacher/TeacherAttendancePage').then((m) => ({ default: m.TeacherAttendancePage })),
);
export const TeacherDailyReportEditorPage = lazy(() =>
  import('@/pages/teacher/TeacherDailyReportEditorPage').then((m) => ({ default: m.TeacherDailyReportEditorPage })),
);
export const TeacherDailyReportPage = lazy(() =>
  import('@/pages/teacher/TeacherDailyReportPage').then((m) => ({ default: m.TeacherDailyReportPage })),
);
export const TeacherMilestoneRecordPage = lazy(() =>
  import('@/pages/teacher/TeacherMilestoneRecordPage').then((m) => ({ default: m.TeacherMilestoneRecordPage })),
);
export const TeacherMilestonesListPage = lazy(() =>
  import('@/pages/teacher/TeacherMilestonesListPage').then((m) => ({ default: m.TeacherMilestonesListPage })),
);
export const TeacherMediaListPage = lazy(() =>
  import('@/pages/teacher/TeacherMediaListPage').then((m) => ({ default: m.TeacherMediaListPage })),
);
export const TeacherInboxPage = lazy(() =>
  import('@/pages/teacher/TeacherInboxPage').then((m) => ({ default: m.TeacherInboxPage })),
);
export const TeacherMediaUploadPage = lazy(() =>
  import('@/pages/teacher/TeacherMediaUploadPage').then((m) => ({ default: m.TeacherMediaUploadPage })),
);
export const TeacherClassAnnouncementsPage = lazy(() =>
  import('@/pages/teacher/TeacherClassAnnouncementsPage').then((m) => ({ default: m.TeacherClassAnnouncementsPage })),
);
export const TeacherClassesHubPage = lazy(() =>
  import('@/pages/teacher/TeacherClassesHubPage').then((m) => ({ default: m.TeacherClassesHubPage })),
);
export const TeacherPlaceholderPage = lazy(() =>
  import('@/pages/teacher/TeacherPlaceholderPage').then((m) => ({ default: m.TeacherPlaceholderPage })),
);
export const TeacherProfilePage = lazy(() =>
  import('@/pages/teacher/TeacherProfilePage').then((m) => ({ default: m.TeacherProfilePage })),
);
export const TeacherCommunityPage = lazy(() =>
  import('@/pages/teacher/TeacherCommunityPage').then((m) => ({ default: m.TeacherCommunityPage })),
);
export const QRScannerPage = lazy(() => import('@/pages/teacher/QRScanner').then((m) => ({ default: m.QRScannerPage })));
export const TeacherEventsPage = lazy(() =>
  import('@/pages/teacher/TeacherEventsPage').then((m) => ({ default: m.TeacherEventsPage })),
);
export const XoAdminHomePage = lazy(() =>
  import('@/pages/xo-admin/XoAdminHomePage').then((m) => ({ default: m.XoAdminHomePage })),
);
export const XoAdminNurseryDashboardPage = lazy(() =>
  import('@/pages/xo-admin/XoAdminNurseryDashboardPage').then((m) => ({ default: m.XoAdminNurseryDashboardPage })),
);
export const NurseryListPage = lazy(() =>
  import('@/pages/xo-admin/NurseryListPage').then((m) => ({ default: m.NurseryListPage })),
);
export const NurseryCreatePage = lazy(() =>
  import('@/pages/xo-admin/NurseryCreatePage').then((m) => ({ default: m.NurseryCreatePage })),
);
export const NurseryEditPage = lazy(() =>
  import('@/pages/xo-admin/NurseryEditPage').then((m) => ({ default: m.NurseryEditPage })),
);
export const NurseryDetailPage = lazy(() =>
  import('@/pages/xo-admin/NurseryDetailPage').then((m) => ({ default: m.NurseryDetailPage })),
);
export const AnalyticsPage = lazy(() =>
  import('@/pages/xo-admin/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })),
);
export const XoAdminPaymentsPage = lazy(() =>
  import('@/pages/xo-admin/XoAdminPaymentsPage').then((m) => ({ default: m.XoAdminPaymentsPage })),
);
export const XoAdminSettingsPage = lazy(() =>
  import('@/pages/xo-admin/XoAdminSettingsPage').then((m) => ({ default: m.XoAdminSettingsPage })),
);
export const HelpAiPreferencesPage = lazy(() =>
  import('@/pages/shared/HelpAiPreferencesPage').then((m) => ({ default: m.HelpAiPreferencesPage })),
);
export const RemindersPage = lazy(() =>
  import('@/pages/shared/RemindersPage').then((m) => ({ default: m.RemindersPage })),
);
