// Module 13 · Nursery settings & operations — every settings field has a default and words in
// both languages, so no settings screen shows a raw key.
import { describe, expect, it } from 'vitest';

import i18n from '@/lib/i18n';

import { DEFAULT_SETTINGS, getTabConfig, SETTINGS_TABS } from './settingsConfig';

const allFields = SETTINGS_TABS.flatMap((tab) => tab.fields);
const translated = (key: string) => i18n.exists(key, { lng: 'en', fallbackLng: false }) && i18n.exists(key, { lng: 'ar', fallbackLng: false });

describe('settings tabs', () => {
  it('opens the first tab for an unknown tab id', () => {
    expect(getTabConfig('branding').id).toBe('branding');
    expect(getTabConfig('nope' as never)).toBe(SETTINGS_TABS[0]);
  });

  it('lists each setting on one tab only', () => {
    const keys = allFields.map((field) => field.key);
    expect(keys.filter((key, i) => keys.indexOf(key) !== i)).toEqual([]);
  });

  it('gives every setting a default value', () => {
    expect(allFields.filter((field) => !(field.key in DEFAULT_SETTINGS)).map((field) => field.key)).toEqual([]);
  });

  it('only shows a field based on another field of the same tab', () => {
    for (const tab of SETTINGS_TABS) {
      for (const field of tab.fields) {
        if (field.showWhen) expect(tab.fields.map((f) => f.key), field.key).toContain(field.showWhen.key);
      }
    }
  });
});

describe('settings words', () => {
  it('names every tab in Arabic and English', () => {
    expect(SETTINGS_TABS.filter((tab) => !translated(tab.labelKey)).map((tab) => tab.id)).toEqual([]);
  });

  it('labels and explains every field in Arabic and English', () => {
    const missing = allFields
      .flatMap((field) => [`settings.fields.${field.key}.label`, `settings.fields.${field.key}.helper`])
      .filter((key) => !translated(key));
    expect(missing).toEqual([]);
  });

  it('names every choice of a drop-down in Arabic and English', () => {
    const missing = allFields
      .filter((field) => field.type === 'select')
      .flatMap((field) => (field.options ?? []).map((option) => `settings.options.${field.key}.${option}`))
      .filter((key) => !translated(key));
    expect(missing).toEqual([]);
  });
});
