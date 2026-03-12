import type { LanguageOption } from '../types/models';

const LANGUAGE_TO_LOCALE: Record<LanguageOption, string> = {
  English: 'en-US',
  Deutsch: 'de-DE',
  Español: 'es-ES',
  Français: 'fr-FR',
  Italiano: 'it-IT',
  Português: 'pt-PT',
};

export function languageToLocale(language: LanguageOption | undefined): string {
  if (!language) return 'en-US';
  return LANGUAGE_TO_LOCALE[language] ?? 'en-US';
}
