import { describe, expect, it } from 'vitest';
import { SUPPORTED_ACCOUNT_LANGUAGES, normalizeAccountLanguage } from '@/constants/accountLanguages';

describe('account language preferences', () => {
  it('offers common languages across basketball, baseball, football, and global sports communities', () => {
    const codes = SUPPORTED_ACCOUNT_LANGUAGES.map(language => language.code);

    expect(codes).toEqual(expect.arrayContaining([
      'en', 'es', 'fr', 'pt', 'de', 'it', 'zh', 'ja', 'ko', 'tl', 'ar',
    ]));
    expect(SUPPORTED_ACCOUNT_LANGUAGES[0]).toMatchObject({ code: 'en', label: 'English' });
  });

  it('normalizes unsupported language picks back to English', () => {
    expect(normalizeAccountLanguage('es')).toBe('es');
    expect(normalizeAccountLanguage('')).toBe('en');
    expect(normalizeAccountLanguage('klingon')).toBe('en');
  });
});
