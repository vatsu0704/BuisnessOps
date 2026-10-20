/**
 * What a password-reset email says, per language.
 *
 * ## Why this file is allowed to exist
 *
 * The backend does not translate and must not try: it cannot know the reader's
 * language, because that choice lives on the device. This is the **fourth** file
 * fenced against that rule, and it earns the exception the way the other three
 * do — the premise stops being true rather than being quietly violated.
 *
 * An email has no app on the other end. There is no device to hand a code to and
 * no screen to render it on; what leaves here is what the person reads. Unlike a
 * payslip or an export there is no `?lang=` either, because nobody is signed in
 * to ask — but we are not guessing: `User.preferredLocale` is the language that
 * account chose, and it is the best thing anybody knows about a reader who
 * cannot currently sign in.
 *
 * `npm run lint:backend-i18n` compares all four languages here and checks that no
 * translation drops a placeholder the English uses. Nothing else may be added
 * without that gate covering it — and everywhere the device *can* render, it
 * still must.
 *
 * Deliberately plain text and deliberately short. A reset mail that looks like
 * marketing is a reset mail that lands in spam, and the one thing it has to do
 * is carry a link.
 *
 * The Hindi, Gujarati and Marathi wordings were written without a native
 * speaker's review, like the app's own locale files. Corrections from a speaker
 * are expected rather than defects.
 */

const LABELS = {
  en: {
    subject: 'Reset your {{appName}} password',
    greeting: 'Hello {{name}},',
    body: 'Somebody asked to reset the password for this {{appName}} account. Open the link below to choose a new one.',
    expiry: 'The link works for {{minutes}} minutes and can be used once.',
    ignore: 'If this was not you, nothing has changed and you can ignore this email.',
    signOff: 'The {{appName}} team',
  },
  hi: {
    subject: 'अपना {{appName}} पासवर्ड बदलें',
    greeting: 'नमस्ते {{name}},',
    body: 'किसी ने इस {{appName}} खाते का पासवर्ड बदलने के लिए कहा है। नया पासवर्ड चुनने के लिए नीचे दिया लिंक खोलें।',
    expiry: 'यह लिंक {{minutes}} मिनट तक चलता है और एक ही बार इस्तेमाल हो सकता है।',
    ignore: 'अगर यह आपने नहीं किया, तो कुछ भी नहीं बदला है और आप इस ईमेल को अनदेखा कर सकते हैं।',
    signOff: '{{appName}} टीम',
  },
  gu: {
    subject: 'તમારો {{appName}} પાસવર્ડ બદલો',
    greeting: 'નમસ્તે {{name}},',
    body: 'કોઈએ આ {{appName}} ખાતાનો પાસવર્ડ બદલવા કહ્યું છે. નવો પાસવર્ડ પસંદ કરવા નીચેની લિંક ખોલો.',
    expiry: 'આ લિંક {{minutes}} મિનિટ ચાલે છે અને એક જ વાર વાપરી શકાય છે.',
    ignore: 'જો આ તમે ન કર્યું હોય, તો કશું બદલાયું નથી અને તમે આ ઈમેલ અવગણી શકો છો.',
    signOff: '{{appName}} ટીમ',
  },
  mr: {
    subject: 'तुमचा {{appName}} पासवर्ड बदला',
    greeting: 'नमस्कार {{name}},',
    body: 'कोणीतरी या {{appName}} खात्याचा पासवर्ड बदलण्यास सांगितले आहे. नवीन पासवर्ड निवडण्यासाठी खालील लिंक उघडा.',
    expiry: 'ही लिंक {{minutes}} मिनिटे चालते आणि एकदाच वापरता येते.',
    ignore: 'हे तुम्ही केले नसेल, तर काहीही बदललेले नाही आणि तुम्ही हा ईमेल दुर्लक्षित करू शकता.',
    signOff: '{{appName}} टीम',
  },
};

/** The product's name, filled in here so no wording above spells it out. */
const APP_NAME = 'HisabKitab';

/** `{{placeholders}}`, the same shape the app's i18next uses. */
function render(template, params = {}) {
  return String(template).replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key) =>
    key in params ? String(params[key]) : whole
  );
}

/** The labels for a locale, falling back to English for one we do not have. */
function labelsFor(locale) {
  const key = String(locale ?? 'EN').toLowerCase();
  return LABELS[key] ?? LABELS.en;
}

module.exports = { LABELS, APP_NAME, render, labelsFor };
