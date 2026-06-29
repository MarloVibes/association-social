export const SUPPORTED_ACCOUNT_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'tl', label: 'Tagalog' },
  { code: 'ar', label: 'Arabic' },
  { code: 'sr', label: 'Serbian' },
  { code: 'hr', label: 'Croatian' },
  { code: 'el', label: 'Greek' },
  { code: 'tr', label: 'Turkish' },
  { code: 'hi', label: 'Hindi' },
] as const;

export type AccountLanguageCode = typeof SUPPORTED_ACCOUNT_LANGUAGES[number]['code'];

const supportedCodes = new Set<string>(SUPPORTED_ACCOUNT_LANGUAGES.map(language => language.code));

export function normalizeAccountLanguage(language?: string | string[] | null): AccountLanguageCode {
  const raw = Array.isArray(language) ? language[0] : language;
  const normalized = String(raw || '').trim().toLowerCase();

  return (supportedCodes.has(normalized) ? normalized : 'en') as AccountLanguageCode;
}
