/** Tool definitions sent to the Edge Function (Claude tool schema shape). */
export const AI_TOOLS = [
  {
    name: 'navigate_to_page',
    description: 'Navigate the user to a route inside the XO web app.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'App path e.g. /admin/events/create' },
      },
      required: ['path'],
    },
  },
  {
    name: 'create_child_draft',
    description: 'Open child enrollment with optional prefilled fields (admin).',
    input_schema: {
      type: 'object',
      properties: {
        full_name_en: { type: 'string' },
        full_name_ar: { type: 'string' },
        dob: { type: 'string', description: 'ISO date YYYY-MM-DD' },
      },
    },
  },
  {
    name: 'create_event_draft',
    description: 'Open new event form with optional draft fields (admin).',
    input_schema: {
      type: 'object',
      properties: {
        title_en: { type: 'string' },
        title_ar: { type: 'string' },
        starts_at: { type: 'string' },
      },
    },
  },
  {
    name: 'send_broadcast_draft',
    description: 'Open broadcast composer with optional message and audience hint (admin).',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        audience: { type: 'string', description: 'e.g. all_parents or class_id' },
      },
    },
  },
  {
    name: 'approve_media',
    description: 'Approve pending media items by id (admin).',
    input_schema: {
      type: 'object',
      properties: {
        media_ids: { type: 'array', items: { type: 'string' } },
      },
      required: ['media_ids'],
    },
  },
  {
    name: 'mark_present',
    description: 'Mark children present for today (teacher).',
    input_schema: {
      type: 'object',
      properties: {
        child_ids: { type: 'array', items: { type: 'string' } },
      },
      required: ['child_ids'],
    },
  },
  {
    name: 'open_daily_report',
    description: 'Open daily report editor for a child (teacher).',
    input_schema: {
      type: 'object',
      properties: {
        child_id: { type: 'string' },
        report_date: { type: 'string', description: 'YYYY-MM-DD, default today' },
      },
      required: ['child_id'],
    },
  },
  {
    name: 'open_media_upload',
    description: 'Open teacher media upload page.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'view_reports',
    description: 'Open parent daily reports, optional child filter.',
    input_schema: {
      type: 'object',
      properties: {
        child_id: { type: 'string' },
      },
    },
  },
  {
    name: 'view_qr_code',
    description: 'Open parent QR code for pickup; optional child id.',
    input_schema: {
      type: 'object',
      properties: {
        child_id: { type: 'string' },
      },
    },
  },
  {
    name: 'approve_event_permission',
    description: 'Grant pending permissions for an event for the signed-in parent children.',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string' },
      },
      required: ['event_id'],
    },
  },
  {
    name: 'view_upcoming_events',
    description: 'Open the events list (parent: /parent/events; admin: /admin/events).',
    input_schema: { type: 'object', properties: {} },
  },
] as const;

export type AIToolName = (typeof AI_TOOLS)[number]['name'];
