/**
 * Dates and clock times, shared with the app: month and weekday names come from
 * the translation files and a time is assembled through `time.ofDay`, so the web
 * writes "12 Oct" and "4:05 PM" exactly as the phone does, in every language.
 * The browser has a full Intl, but two clients formatting one date two ways is
 * the bug this avoids.
 */
export * from '@shared/utils/date';
