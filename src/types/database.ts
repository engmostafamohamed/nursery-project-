import type {
  AcademicCalendarsRow,
  AdmissionDocumentsRow,
  AdmissionsRow,
  AttendanceRecordsRow,
  AuthorizedPickupsRow,
  BroadcastMessagesRow,
  BusAttendanceRow,
  BusRoutesRow,
  CameraAccessRow,
  CamerasRow,
  ChainsRow,
  ChildAllergiesRow,
  ChildChronicConditionsRow,
  ChildHealthAlertDismissalsRow,
  ChildHealthDocumentsRow,
  ChildHealthRecordsRow,
  ChildHealthUpdateRequestsRow,
  ChildMedicationsRow,
  ChildVaccinationsRow,
  ChildrenRow,
  ClassesRow,
  ClassStaffRow,
  ClassStaffRole,
  StaffNationalIdsRow,
  CommunityCommentsRow,
  CommunityPostsRow,
  ComplianceDocsRow,
  DailyReportsRow,
  EventsRow,
  EventInvoicesRow,
  EventAttendeesRow,
  PaymentAttemptsRow,
  QrTokensRow,
  FoodMenusRow,
  HealthArticlesRow,
  HealthRecordsRow,
  InventoryRow,
  InvoicesRow,
  LoyaltyPointsRow,
  LoyaltyRedemptionsRow,
  LoyaltyRewardsRow,
  MediaRow,
  MediaChildrenRow,
  MediaVisibilityRow,
  ReportReactionsRow,
  ApplicationsRow,
  ApplicationDocumentsRow,
  LoyaltyTransactionsRow,
  StaffPayrollRow,
  InquiriesRow,
  StaffProfilesRow,
  StaffSchedulesRow,
  WaitlistRow,
  MessagesRow,
  MilestonesRow,
  NotificationsRow,
  NpsRatingsRow,
  NurserySettingsRow,
  NurseriesRow,
  ParentChildrenRow,
  PaymentsRow,
  PayrollRow,
  PermissionsRow,
  StaffAttendanceRow,
  StaffRow,
  SubscriptionInvoicesRow,
  SurveyResponsesRow,
  SurveysRow,
  MealPlansRow,
  PostsRow,
  PostCommentsRow,
  ContentLibraryRow,
  UsersRow,
  UserPushSubscriptionsRow,
} from './tables';

type TableModel<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

type ReadonlyViewModel<Row> = {
  Row: Row;
  Insert: never;
  Update: never;
  Relationships: [];
};

/** Supabase-style database shape for typed `createClient<Database>()` */
export type Database = {
  public: {
    Tables: {
      academic_calendars: TableModel<AcademicCalendarsRow>;
      admission_documents: TableModel<AdmissionDocumentsRow>;
      admissions: TableModel<AdmissionsRow>;
      attendance_records: TableModel<AttendanceRecordsRow>;
      authorized_pickups: TableModel<AuthorizedPickupsRow>;
      broadcast_messages: TableModel<BroadcastMessagesRow>;
      bus_attendance: TableModel<BusAttendanceRow>;
      bus_routes: TableModel<BusRoutesRow>;
      camera_access: TableModel<CameraAccessRow>;
      cameras: TableModel<CamerasRow>;
      chains: TableModel<ChainsRow>;
      child_allergies: TableModel<ChildAllergiesRow>;
      child_chronic_conditions: TableModel<ChildChronicConditionsRow>;
      child_health_alert_dismissals: TableModel<ChildHealthAlertDismissalsRow>;
      child_health_documents: TableModel<ChildHealthDocumentsRow>;
      child_health_records: TableModel<ChildHealthRecordsRow>;
      child_health_update_requests: TableModel<ChildHealthUpdateRequestsRow>;
      child_medications: TableModel<ChildMedicationsRow>;
      child_vaccinations: TableModel<ChildVaccinationsRow>;
      children: TableModel<ChildrenRow>;
      classes: TableModel<ClassesRow>;
      class_staff: TableModel<ClassStaffRow>;
      staff_national_ids: TableModel<StaffNationalIdsRow>;
      community_comments: TableModel<CommunityCommentsRow>;
      community_posts: TableModel<CommunityPostsRow>;
      compliance_docs: TableModel<ComplianceDocsRow>;
      daily_reports: TableModel<DailyReportsRow>;
      events: TableModel<EventsRow>;
      event_attendees: TableModel<EventAttendeesRow>;
      event_invoices: TableModel<EventInvoicesRow>;
      food_menus: TableModel<FoodMenusRow>;
      health_articles: TableModel<HealthArticlesRow>;
      health_records: TableModel<HealthRecordsRow>;
      inventory: TableModel<InventoryRow>;
      invoices: TableModel<InvoicesRow>;
      loyalty_points: TableModel<LoyaltyPointsRow>;
      loyalty_redemptions: TableModel<LoyaltyRedemptionsRow>;
      loyalty_rewards: TableModel<LoyaltyRewardsRow>;
      media: TableModel<MediaRow>;
      media_children: TableModel<MediaChildrenRow>;
      media_visibility: TableModel<MediaVisibilityRow>;
      applications: TableModel<ApplicationsRow>;
      application_documents: TableModel<ApplicationDocumentsRow>;
      loyalty_transactions: TableModel<LoyaltyTransactionsRow>;
      report_reactions: TableModel<ReportReactionsRow>;
      inquiries: TableModel<InquiriesRow>;
      staff_payroll: TableModel<StaffPayrollRow>;
      staff_profiles: TableModel<StaffProfilesRow>;
      staff_schedules: TableModel<StaffSchedulesRow>;
      waitlist: TableModel<WaitlistRow>;
      messages: TableModel<MessagesRow>;
      milestones: TableModel<MilestonesRow>;
      notifications: TableModel<NotificationsRow>;
      nps_ratings: TableModel<NpsRatingsRow>;
      nursery_settings: TableModel<NurserySettingsRow>;
      nurseries: TableModel<NurseriesRow>;
      parent_children: TableModel<ParentChildrenRow>;
      payments: TableModel<PaymentsRow>;
      payroll: TableModel<PayrollRow>;
      payment_attempts: TableModel<PaymentAttemptsRow>;
      qr_tokens: TableModel<QrTokensRow>;
      permissions: TableModel<PermissionsRow>;
      staff: TableModel<StaffRow>;
      staff_attendance: TableModel<StaffAttendanceRow>;
      subscription_invoices: TableModel<SubscriptionInvoicesRow>;
      survey_responses: TableModel<SurveyResponsesRow>;
      surveys: TableModel<SurveysRow>;
      meal_plans: TableModel<MealPlansRow>;
      posts: TableModel<PostsRow>;
      post_comments: TableModel<PostCommentsRow>;
      content_library: TableModel<ContentLibraryRow>;
      users: TableModel<UsersRow>;
      user_push_subscriptions: TableModel<UserPushSubscriptionsRow>;
    };
    Views: {
      signup_nursery_options: ReadonlyViewModel<{
        id: string;
        name_en: string | null;
        name_ar: string | null;
        city: string | null;
        opens_at: string | null;
        closes_at: string | null;
        working_days: unknown;
        language_pref: string | null;
        lead_sources: unknown;
        departments: unknown;
        standard_start_time: string | null;
      }>;
    };
    Functions: {
      approve_application_enrollment: {
        Args: {
          p_application_id: string;
          p_nursery_id: string;
          p_auto_generate_first_invoice?: boolean;
        };
        Returns: {
          childId: string;
          parentId: string | null;
          invoiceId?: string;
          paidAmount?: number;
        };
      };
      select_application_payment_package: {
        Args: { p_application_id: string; p_package_id: string };
        Returns: string;
      };
      set_class_lead: {
        Args: { p_class_id: string; p_user_id: string | null };
        Returns: void;
      };
    };
    Enums: {
      class_staff_role: ClassStaffRole;
    };
  };
};
