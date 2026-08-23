export type HelpArticleRole = 'admin' | 'teacher' | 'parent' | 'all';

export type HelpArticleCategory = 'getting_started' | 'daily_tasks' | 'troubleshooting' | 'faq';

export interface HelpArticle {
  id: string;
  role: HelpArticleRole;
  category: HelpArticleCategory;
  title_en: string;
  title_ar: string;
  steps_en: string[];
  steps_ar: string[];
  relatedPage?: string;
  screenshotUrl?: string;
}

const ph = (seed: string) => `https://placehold.co/800x450/001f3f/ffffff?text=${encodeURIComponent(seed)}`;

export const helpArticles: HelpArticle[] = [
  {
    id: 'admin-first-24h',
    role: 'admin',
    category: 'getting_started',
    title_en: 'Getting Started: Your First 24 Hours',
    title_ar: 'البدء: أول 24 ساعة',
    steps_en: [
      'Review the dashboard for today’s overview.',
      'Confirm nursery settings under Settings.',
      'Invite staff from Staff → Onboarding.',
      'Add or import children from Children.',
    ],
    steps_ar: [
      'راجع لوحة التحكم لملخص اليوم.',
      'تأكد من إعدادات الحضانة من الإعدادات.',
      'ادعُ الموظفين من الموظفون → الإعداد.',
      'أضف الأطفال أو استوردهم من الأطفال.',
    ],
    relatedPage: '/admin',
    screenshotUrl: ph('Dashboard'),
  },
  {
    id: 'admin-add-child',
    role: 'admin',
    category: 'daily_tasks',
    title_en: 'How to Add a New Child',
    title_ar: 'كيفية إضافة طفل جديد',
    steps_en: [
      'Open Children → Add / Enroll from the sidebar.',
      'Complete each step of the enrollment wizard.',
      'Upload required documents when prompted.',
      'Save and confirm the child appears in the list.',
    ],
    steps_ar: [
      'افتح الأطفال → التسجيل من القائمة.',
      'أكمل خطوات معالج التسجيل.',
      'ارفع المستندات المطلوبة عند الطلب.',
      'احفظ وتأكد من ظهور الطفل في القائمة.',
    ],
    relatedPage: '/admin/children/enroll',
    screenshotUrl: ph('Enroll'),
  },
  {
    id: 'admin-create-event',
    role: 'admin',
    category: 'daily_tasks',
    title_en: 'How to Create an Event',
    title_ar: 'كيفية إنشاء فعالية',
    steps_en: [
      'Go to Calendar or Events in the admin menu.',
      'Choose Create event and fill title, time, and location.',
      'Set permission rules if parents must approve.',
      'Publish and notify parents if needed.',
    ],
    steps_ar: [
      'انتقل إلى التقويم أو الفعاليات.',
      'اختر إنشاء فعالية واملأ العنوان والوقت والمكان.',
      'حدد قواعد الإذن إذا كان يجب على أولياء الأمور الموافقة.',
      'انشر وأبلغ أولياء الأمور عند الحاجة.',
    ],
    relatedPage: '/admin/events/create',
    screenshotUrl: ph('Event'),
  },
  {
    id: 'admin-broadcast',
    role: 'admin',
    category: 'daily_tasks',
    title_en: 'How to Send a Broadcast Message',
    title_ar: 'كيفية إرسال رسالة جماعية',
    steps_en: [
      'Open Messages → Broadcast composer.',
      'Write your message in Arabic and/or English.',
      'Choose the audience (e.g. all parents or a class).',
      'Review and send; check Broadcast history for delivery.',
    ],
    steps_ar: [
      'افتح الرسائل → إنشاء بث.',
      'اكتب الرسالة بالعربية و/أو الإنجليزية.',
      'اختر الجمهور (مثل جميع أولياء الأمور أو فصل).',
      'راجع وأرسل؛ تابع سجل البث.',
    ],
    relatedPage: '/admin/messages/broadcast',
    screenshotUrl: ph('Broadcast'),
  },
  {
    id: 'admin-approve-media',
    role: 'admin',
    category: 'daily_tasks',
    title_en: 'How to Approve Media',
    title_ar: 'كيفية اعتماد الوسائط',
    steps_en: [
      'Open Media → Approval queue.',
      'Review each photo or video for policy compliance.',
      'Approve or reject with a short reason if needed.',
      'Approved items appear in the media library and parent gallery.',
    ],
    steps_ar: [
      'افتح الوسائط → قائمة الاعتماد.',
      'راجع كل صورة أو فيديو.',
      'اعتمد أو ارفض مع سبب عند الحاجة.',
      'تظهر العناصر المعتمدة في المكتبة ومعرض ولي الأمر.',
    ],
    relatedPage: '/admin/media/approval',
    screenshotUrl: ph('Media'),
  },
  {
    id: 'admin-dashboard',
    role: 'admin',
    category: 'faq',
    title_en: 'Understanding the Dashboard',
    title_ar: 'فهم لوحة التحكم',
    steps_en: [
      'The dashboard summarizes key nursery metrics.',
      'Use shortcuts to attendance, media, and messages.',
      'Pending counts often link directly to the relevant page.',
    ],
    steps_ar: [
      'تلخص لوحة التحكم المؤشرات الرئيسية.',
      'استخدم الاختصارات للحضور والوسائط والرسائل.',
      'غالباً تؤدي الأعداد المعلقة إلى الصفحة المناسبة.',
    ],
    relatedPage: '/admin',
    screenshotUrl: ph('Dash'),
  },
  {
    id: 'teacher-attendance',
    role: 'teacher',
    category: 'daily_tasks',
    title_en: 'Marking Daily Attendance',
    title_ar: 'تسجيل الحضور اليومي',
    steps_en: [
      'Open Attendance from the teacher menu.',
      'Find the child and tap to check in.',
      'Confirm check-out at end of day if required.',
    ],
    steps_ar: [
      'افتح الحضور من قائمة المعلم.',
      'ابحث عن الطفل واضغط لتسجيل الدخول.',
      'سجّل الخروج في نهاية اليوم عند الحاجة.',
    ],
    relatedPage: '/teacher/attendance',
    screenshotUrl: ph('Attendance'),
  },
  {
    id: 'teacher-reports',
    role: 'teacher',
    category: 'daily_tasks',
    title_en: 'Creating Daily Reports',
    title_ar: 'إنشاء تقارير يومية',
    steps_en: [
      'Go to Daily reports.',
      'Select a child and today’s date.',
      'Fill meals, mood, and notes then publish.',
    ],
    steps_ar: [
      'انتقل إلى التقارير اليومية.',
      'اختر الطفل وتاريخ اليوم.',
      'املأ الوجبات والمزاج والملاحظات ثم انشر.',
    ],
    relatedPage: '/teacher/daily-reports',
    screenshotUrl: ph('Reports'),
  },
  {
    id: 'teacher-media',
    role: 'teacher',
    category: 'daily_tasks',
    title_en: 'Uploading Photos to Gallery',
    title_ar: 'رفع صور للمعرض',
    steps_en: [
      'Open Media → Upload.',
      'Choose files under 10MB and correct format.',
      'Add caption and visibility, then submit for approval.',
    ],
    steps_ar: [
      'افتح الوسائط → رفع.',
      'اختر ملفات أقل من 10 ميغابايت بالصيغة الصحيحة.',
      'أضف تعليقاً والظهور ثم أرسل للاعتماد.',
    ],
    relatedPage: '/teacher/media/upload',
    screenshotUrl: ph('Upload'),
  },
  {
    id: 'teacher-scanner',
    role: 'teacher',
    category: 'getting_started',
    title_en: 'Using the QR Scanner',
    title_ar: 'استخدام ماسح QR',
    steps_en: [
      'Open Scanner from the bottom menu.',
      'Allow camera access when prompted.',
      'Scan the parent or child QR shown at pickup.',
    ],
    steps_ar: [
      'افتح الماسح من القائمة السفلية.',
      'اسمح بالكاميرا عند الطلب.',
      'امسح رمز الاستلام المعروض.',
    ],
    relatedPage: '/teacher/scanner',
    screenshotUrl: ph('QR'),
  },
  {
    id: 'parent-reports',
    role: 'parent',
    category: 'daily_tasks',
    title_en: "Viewing Your Child's Daily Reports",
    title_ar: 'عرض التقارير اليومية لطفلك',
    steps_en: [
      'Tap Daily reports in the parent app.',
      'Open a report to see meals, mood, and teacher notes.',
      'React or comment if the nursery enabled it.',
    ],
    steps_ar: [
      'اضغط التقارير اليومية.',
      'افتح تقريراً لرؤية الوجبات والمزاج والملاحظات.',
      'تفاعل أو علّق إن كان مسموحاً.',
    ],
    relatedPage: '/parent/daily-reports',
    screenshotUrl: ph('ParentRep'),
  },
  {
    id: 'parent-qr',
    role: 'parent',
    category: 'getting_started',
    title_en: 'Using Your QR Code',
    title_ar: 'استخدام رمز QR',
    steps_en: [
      'Open QR code from the bottom menu.',
      'Show the code to staff at drop-off or pickup.',
      'Refresh the screen if the code does not scan.',
    ],
    steps_ar: [
      'افتح رمز QR من القائمة.',
      'اعرضه للموظفين عند الوصول أو الاستلام.',
      'حدّث الشاشة إن لم يُمسح الرمز.',
    ],
    relatedPage: '/parent/qr-code',
    screenshotUrl: ph('P-QR'),
  },
  {
    id: 'parent-permissions',
    role: 'parent',
    category: 'daily_tasks',
    title_en: 'Approving Event Permissions',
    title_ar: 'الموافقة على أذونات الفعاليات',
    steps_en: [
      'Open Permissions from the menu.',
      'Review pending events and deadlines.',
      'Approve or deny; paid events may create an invoice.',
    ],
    steps_ar: [
      'افتح الأذونات من القائمة.',
      'راجع الفعاليات المعلقة والمواعيد النهائية.',
      'وافق أو ارفض؛ قد تُنشأ فاتورة للفعاليات المدفوعة.',
    ],
    relatedPage: '/parent/permissions',
    screenshotUrl: ph('Perm'),
  },
  {
    id: 'parent-photos',
    role: 'parent',
    category: 'daily_tasks',
    title_en: 'Viewing Photos of Your Child',
    title_ar: 'عرض صور طفلك',
    steps_en: [
      'Open Media / Gallery.',
      'Browse approved photos and videos.',
      'Tap an item for details and larger preview.',
    ],
    steps_ar: [
      'افتح الوسائط / المعرض.',
      'تصفح الصور والفيديوهات المعتمدة.',
      'اضغط للتفاصيل ومعاينة أكبر.',
    ],
    relatedPage: '/parent/media',
    screenshotUrl: ph('Gallery'),
  },
];
