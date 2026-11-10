import { describe, expect, it } from 'vitest';

import { errorCodeIn, errorMessage, errorTextKey, isNetworkError } from './errorCode';

const CODES = ['menu_invalid_dish', 'menu_invalid_dishes', 'menu_forbidden'] as const;

describe('error codes from the server', () => {
  it('read the message of whatever was thrown', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage({ message: 'menu_forbidden', code: '42501' })).toBe('menu_forbidden');
    expect(errorMessage('menu_forbidden')).toBe('menu_forbidden');
    expect(errorMessage(null)).toBe('');
  });

  it('find the known code, the longest first so a shorter one inside it does not win', () => {
    expect(errorCodeIn(new Error('menu_invalid_dishes'), CODES)).toBe('menu_invalid_dishes');
    expect(errorCodeIn({ message: 'ERROR: menu_invalid_dish (detail 3)' }, CODES)).toBe('menu_invalid_dish');
    expect(errorCodeIn(new Error('something else'), CODES)).toBeNull();
  });

  it('tell a request that never reached the server', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkError(new Error('Load failed'))).toBe(true);
    expect(isNetworkError(new Error('NetworkError when attempting to fetch resource.'))).toBe(true);
    expect(isNetworkError(new Error('menu_forbidden'))).toBe(false);
  });

  it('give the text key: the code (prefix dropped when asked), else network, else failed', () => {
    expect(errorTextKey(new Error('menu_forbidden'), CODES, 'fnb.errors')).toBe('fnb.errors.menu_forbidden');
    expect(errorTextKey(new Error('class_name_taken'), ['class_name_taken'], 'classEditor.errors', 'class_')).toBe('classEditor.errors.name_taken');
    expect(errorTextKey(new TypeError('Failed to fetch'), CODES, 'fnb.errors')).toBe('fnb.errors.network');
    expect(errorTextKey(new Error('boom'), CODES, 'fnb.errors')).toBe('fnb.errors.failed');
  });
});
