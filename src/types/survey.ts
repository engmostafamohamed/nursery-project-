export type QuestionType =
  | 'short_text'
  | 'long_text'
  | 'multiple_choice'
  | 'checkboxes'
  | 'dropdown'
  | 'linear_scale'
  | 'star_rating'
  | 'yes_no'
  | 'date'
  | 'section_header';

export type ConditionalRule = {
  questionId: string;
  operator: 'eq' | 'neq';
  value: string;
};

export type FormQuestion = {
  id: string;
  type: QuestionType;
  label: string;
  description?: string;
  required: boolean;
  options?: string[];
  scaleMin?: number;
  scaleMax?: number;
  scaleMinLabel?: string;
  scaleMaxLabel?: string;
  maxLength?: number;
  conditional?: ConditionalRule;
};

export type SurveyType = 'questionnaire' | 'permission';
export type SurveyStatus = 'draft' | 'active' | 'published' | 'closed';

export type SurveyRow = {
  id: string;
  nursery_id: string;
  title: string;
  title_ar?: string | null;
  title_en?: string | null;
  type: SurveyType;
  status: SurveyStatus;
  questions_json: FormQuestion[];
  deadline: string | null;
  target_class_ids?: string[] | null;
  created_at: string;
};

export type SurveyResponseRow = {
  id: string;
  survey_id: string;
  user_id: string;
  answers_json: Record<string, unknown>;
  created_at: string;
};

export type AnswerValue = string | string[] | number | null;
export type AnswersMap = Record<string, AnswerValue>;
