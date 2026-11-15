import { createContext } from 'react';

/**
 * How the application form's fields learn their errors: the page decides when an error shows
 * (after the field was left, or when Next/submit flagged it) and the fields ask by name.
 */
export type FieldValidation = {
  errorFor: (name: string) => string | undefined;
  onFieldFocus: (name: string) => void;
  onFieldBlur: (name: string) => void;
};

export const FieldValidationContext = createContext<FieldValidation | null>(null);
