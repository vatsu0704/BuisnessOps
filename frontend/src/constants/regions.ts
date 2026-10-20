/**
 * Countries, currencies and timezones — the three things sign-up, Add business
 * and Add branch used to ask for as free text.
 *
 * Typing a timezone is how a branch ends up on a zone the tzdb has never heard
 * of. The backend's `safeZone()` falls back to UTC when it cannot resolve one,
 * silently, and a branch on UTC files every evening sale against the wrong day —
 * a reporting bug with no visible cause. That is the failure this data removes.
 *
 * ## Why it is bundled rather than read from the platform
 *
 * The browser has `Intl.supportedValuesOf('timeZone')`. Hermes does not, which is
 * the same missing `Intl` that forces `compatibilityJSON: 'v3'` and `utils/date.ts`.
 * Shared data is the only way both apps offer the same list.
 *
 * ## Why the names are not translated
 *
 * These are reference data, not prose — the same category as a branch's name or
 * a product's. Settings already prints `business.country` as "IN",
 * `defaultCurrency` as "INR" and `timezone` as "Asia/Kolkata", so translating
 * the picker's labels would make the picker and the page it writes to disagree.
 * A timezone id is a machine identifier the server resolves; a currency code is
 * three ASCII letters that reach a receipt printer whose font has no Indic
 * glyphs. The field *labels* around them are translated, as they always were.
 *
 * `aliases` is the concession: ભારત, Bharat and IND all find India.
 *
 * This file imports nothing, so both toolchains compile it.
 */

export interface CountryOption {
  /** ISO 3166-1 alpha-2, which is what `Business.country` stores. */
  code: string;
  name: string;
  /** Matched when searching, never shown. */
  aliases?: readonly string[];
}

/**
 * Every ISO 3166-1 country, India first.
 *
 * The whole list rather than a chosen few: once the field stops being free text,
 * a country that is missing is a business that cannot be created, and there is
 * no way round it from inside the app. India leads because that is who this is
 * for — the ordering is the India-first part, not the extent.
 */
const PACKED_COUNTRIES =
  'IN:India|AE:United Arab Emirates|AF:Afghanistan|AG:Antigua and Barbuda|AI:Anguilla|AL:Albania|' +
  'AM:Armenia|AO:Angola|AR:Argentina|AS:American Samoa|AT:Austria|AU:Australia|AW:Aruba|AX:Åland Islands|' +
  'AZ:Azerbaijan|BA:Bosnia and Herzegovina|BB:Barbados|BD:Bangladesh|BE:Belgium|BF:Burkina Faso|' +
  'BG:Bulgaria|BH:Bahrain|BI:Burundi|BJ:Benin|BL:Saint Barthélemy|BM:Bermuda|BN:Brunei|BO:Bolivia|' +
  'BQ:Caribbean Netherlands|BR:Brazil|BS:Bahamas|BT:Bhutan|BW:Botswana|BY:Belarus|BZ:Belize|CA:Canada|' +
  'CD:DR Congo|CF:Central African Republic|CG:Congo|CH:Switzerland|CI:Côte d’Ivoire|CK:Cook Islands|' +
  'CL:Chile|CM:Cameroon|CN:China|CO:Colombia|CR:Costa Rica|CU:Cuba|CV:Cape Verde|CW:Curaçao|CY:Cyprus|' +
  'CZ:Czechia|DE:Germany|DJ:Djibouti|DK:Denmark|DM:Dominica|DO:Dominican Republic|DZ:Algeria|' +
  'EC:Ecuador|EE:Estonia|EG:Egypt|ER:Eritrea|ES:Spain|ET:Ethiopia|FI:Finland|FJ:Fiji|FK:Falkland Islands|' +
  'FM:Micronesia|FO:Faroe Islands|FR:France|GA:Gabon|GB:United Kingdom|GD:Grenada|GE:Georgia|' +
  'GF:French Guiana|GG:Guernsey|GH:Ghana|GI:Gibraltar|GL:Greenland|GM:Gambia|GN:Guinea|GP:Guadeloupe|' +
  'GQ:Equatorial Guinea|GR:Greece|GT:Guatemala|GU:Guam|GW:Guinea-Bissau|GY:Guyana|HK:Hong Kong|' +
  'HN:Honduras|HR:Croatia|HT:Haiti|HU:Hungary|ID:Indonesia|IE:Ireland|IL:Israel|IM:Isle of Man|IQ:Iraq|' +
  'IR:Iran|IS:Iceland|IT:Italy|JE:Jersey|JM:Jamaica|JO:Jordan|JP:Japan|KE:Kenya|KG:Kyrgyzstan|' +
  'KH:Cambodia|KI:Kiribati|KM:Comoros|KN:Saint Kitts and Nevis|KP:North Korea|KR:South Korea|KW:Kuwait|' +
  'KY:Cayman Islands|KZ:Kazakhstan|LA:Laos|LB:Lebanon|LC:Saint Lucia|LI:Liechtenstein|LK:Sri Lanka|' +
  'LR:Liberia|LS:Lesotho|LT:Lithuania|LU:Luxembourg|LV:Latvia|LY:Libya|MA:Morocco|MC:Monaco|MD:Moldova|' +
  'ME:Montenegro|MF:Saint Martin|MG:Madagascar|MH:Marshall Islands|MK:North Macedonia|ML:Mali|' +
  'MM:Myanmar|MN:Mongolia|MO:Macao|MP:Northern Mariana Islands|MQ:Martinique|MR:Mauritania|' +
  'MS:Montserrat|MT:Malta|MU:Mauritius|MV:Maldives|MW:Malawi|MX:Mexico|MY:Malaysia|MZ:Mozambique|' +
  'NA:Namibia|NC:New Caledonia|NE:Niger|NF:Norfolk Island|NG:Nigeria|NI:Nicaragua|NL:Netherlands|' +
  'NO:Norway|NP:Nepal|NR:Nauru|NU:Niue|NZ:New Zealand|OM:Oman|PA:Panama|PE:Peru|PF:French Polynesia|' +
  'PG:Papua New Guinea|PH:Philippines|PK:Pakistan|PL:Poland|PM:Saint Pierre and Miquelon|PR:Puerto Rico|' +
  'PS:Palestine|PT:Portugal|PW:Palau|PY:Paraguay|QA:Qatar|RE:Réunion|RO:Romania|RS:Serbia|RU:Russia|' +
  'RW:Rwanda|SA:Saudi Arabia|SB:Solomon Islands|SC:Seychelles|SD:Sudan|SE:Sweden|SG:Singapore|' +
  'SH:Saint Helena|SI:Slovenia|SJ:Svalbard and Jan Mayen|SK:Slovakia|SL:Sierra Leone|SM:San Marino|' +
  'SN:Senegal|SO:Somalia|SR:Suriname|SS:South Sudan|ST:São Tomé and Príncipe|SV:El Salvador|' +
  'SX:Sint Maarten|SY:Syria|SZ:Eswatini|TC:Turks and Caicos Islands|TD:Chad|TG:Togo|TH:Thailand|' +
  'TJ:Tajikistan|TK:Tokelau|TL:Timor-Leste|TM:Turkmenistan|TN:Tunisia|TO:Tonga|TR:Türkiye|' +
  'TT:Trinidad and Tobago|TV:Tuvalu|TW:Taiwan|TZ:Tanzania|UA:Ukraine|UG:Uganda|US:United States|' +
  'UY:Uruguay|UZ:Uzbekistan|VA:Vatican City|VC:Saint Vincent and the Grenadines|VE:Venezuela|' +
  'VG:British Virgin Islands|VI:U.S. Virgin Islands|VN:Vietnam|VU:Vanuatu|WF:Wallis and Futuna|' +
  'WS:Samoa|YE:Yemen|YT:Mayotte|ZA:South Africa|ZM:Zambia|ZW:Zimbabwe';

/** What somebody might type instead of the listed name. */
const COUNTRY_ALIASES: Record<string, readonly string[]> = {
  IN: ['IND', 'Bharat', 'भारत', 'ભારત'],
  AE: ['UAE', 'Dubai', 'Abu Dhabi'],
  GB: ['UK', 'Britain', 'England', 'Scotland', 'Wales'],
  US: ['USA', 'America'],
  KR: ['Korea'],
  LK: ['Ceylon'],
  MM: ['Burma'],
  TR: ['Turkey'],
  CZ: ['Czech Republic'],
  NL: ['Holland'],
  CI: ['Ivory Coast'],
};

export const COUNTRIES: readonly CountryOption[] = PACKED_COUNTRIES.split('|').map((entry) => {
  const at = entry.indexOf(':');
  const code = entry.slice(0, at);
  return { code, name: entry.slice(at + 1), aliases: COUNTRY_ALIASES[code] };
});

export interface CurrencyOption {
  /** ISO 4217, which is what `Business.defaultCurrency` stores. */
  code: string;
  name: string;
  symbol: string;
}

/**
 * The currencies a business here actually trades in, rupees first.
 *
 * Trimmed where the countries are not, because a currency carries a `symbol`
 * that `formatAmount` prints and a receipt printer has to draw. Shipping a code
 * nobody has checked would put a wrong symbol on a bill. A currency genuinely
 * missing is one line to add; a country missing has no way round it at all.
 */
export const CURRENCIES: readonly CurrencyOption[] = [
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'Pound Sterling', symbol: '£' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳' },
  { code: 'BHD', name: 'Bahraini Dinar', symbol: 'BD' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$' },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh' },
  { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'KD' },
  { code: 'LKR', name: 'Sri Lankan Rupee', symbol: 'Rs' },
  { code: 'MVR', name: 'Maldivian Rufiyaa', symbol: 'MVR' },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM' },
  { code: 'NPR', name: 'Nepalese Rupee', symbol: 'Rs' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' },
  { code: 'OMR', name: 'Omani Rial', symbol: 'OMR' },
  { code: 'PKR', name: 'Pakistani Rupee', symbol: 'Rs' },
  { code: 'QAR', name: 'Qatari Riyal', symbol: 'QR' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'THB', name: 'Thai Baht', symbol: '฿' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
];

export interface TimezoneOption {
  /** An IANA id, exactly as the tzdb spells it. */
  id: string;
  /** The countries that use it — matched when searching, never shown. */
  places: readonly string[];
}

/**
 * Where a branch's day begins and ends, India first.
 *
 * Trimmed where the countries are not, and for the opposite reason: a wrong
 * timezone is fixed from Branch settings in a moment, while four hundred ids in
 * one list is noise around the one anybody here wants. One zone per place the
 * business is likely to be, plus every zone of the countries that genuinely
 * have several.
 *
 * **Every id must match IANA exactly.** They are sent to the server, which
 * resolves them with the tzdb; one it cannot resolve becomes UTC without a word.
 */
export const TIMEZONES: readonly TimezoneOption[] = [
  { id: 'Asia/Kolkata', places: ['India', 'Calcutta', 'Mumbai', 'Delhi'] },
  { id: 'Asia/Dubai', places: ['United Arab Emirates', 'Oman'] },
  { id: 'Asia/Karachi', places: ['Pakistan'] },
  { id: 'Asia/Dhaka', places: ['Bangladesh'] },
  { id: 'Asia/Colombo', places: ['Sri Lanka'] },
  { id: 'Asia/Kathmandu', places: ['Nepal'] },
  { id: 'Asia/Thimphu', places: ['Bhutan'] },
  { id: 'Indian/Maldives', places: ['Maldives'] },
  { id: 'Asia/Kabul', places: ['Afghanistan'] },
  { id: 'Asia/Riyadh', places: ['Saudi Arabia', 'Bahrain', 'Kuwait', 'Qatar'] },
  { id: 'Asia/Qatar', places: ['Qatar'] },
  { id: 'Asia/Kuwait', places: ['Kuwait'] },
  { id: 'Asia/Bahrain', places: ['Bahrain'] },
  { id: 'Asia/Muscat', places: ['Oman'] },
  { id: 'Asia/Tehran', places: ['Iran'] },
  { id: 'Asia/Baghdad', places: ['Iraq'] },
  { id: 'Asia/Jerusalem', places: ['Israel'] },
  { id: 'Asia/Amman', places: ['Jordan'] },
  { id: 'Asia/Beirut', places: ['Lebanon'] },
  { id: 'Asia/Singapore', places: ['Singapore'] },
  { id: 'Asia/Kuala_Lumpur', places: ['Malaysia'] },
  { id: 'Asia/Bangkok', places: ['Thailand', 'Cambodia', 'Laos', 'Vietnam'] },
  { id: 'Asia/Ho_Chi_Minh', places: ['Vietnam', 'Saigon'] },
  { id: 'Asia/Manila', places: ['Philippines'] },
  { id: 'Asia/Jakarta', places: ['Indonesia', 'Java'] },
  { id: 'Asia/Makassar', places: ['Indonesia', 'Bali'] },
  { id: 'Asia/Jayapura', places: ['Indonesia', 'Papua'] },
  { id: 'Asia/Hong_Kong', places: ['Hong Kong'] },
  { id: 'Asia/Shanghai', places: ['China', 'Beijing'] },
  { id: 'Asia/Taipei', places: ['Taiwan'] },
  { id: 'Asia/Tokyo', places: ['Japan'] },
  { id: 'Asia/Seoul', places: ['South Korea'] },
  { id: 'Asia/Yangon', places: ['Myanmar', 'Burma'] },
  { id: 'Asia/Almaty', places: ['Kazakhstan'] },
  { id: 'Asia/Tashkent', places: ['Uzbekistan'] },
  { id: 'Europe/London', places: ['United Kingdom', 'Britain', 'Ireland'] },
  { id: 'Europe/Dublin', places: ['Ireland'] },
  { id: 'Europe/Lisbon', places: ['Portugal'] },
  { id: 'Europe/Madrid', places: ['Spain'] },
  { id: 'Europe/Paris', places: ['France'] },
  { id: 'Europe/Brussels', places: ['Belgium'] },
  { id: 'Europe/Amsterdam', places: ['Netherlands', 'Holland'] },
  { id: 'Europe/Berlin', places: ['Germany'] },
  { id: 'Europe/Zurich', places: ['Switzerland'] },
  { id: 'Europe/Rome', places: ['Italy'] },
  { id: 'Europe/Vienna', places: ['Austria'] },
  { id: 'Europe/Warsaw', places: ['Poland'] },
  { id: 'Europe/Prague', places: ['Czechia'] },
  { id: 'Europe/Stockholm', places: ['Sweden'] },
  { id: 'Europe/Oslo', places: ['Norway'] },
  { id: 'Europe/Copenhagen', places: ['Denmark'] },
  { id: 'Europe/Helsinki', places: ['Finland'] },
  { id: 'Europe/Athens', places: ['Greece'] },
  { id: 'Europe/Istanbul', places: ['Türkiye', 'Turkey'] },
  { id: 'Europe/Moscow', places: ['Russia'] },
  { id: 'Africa/Cairo', places: ['Egypt'] },
  { id: 'Africa/Nairobi', places: ['Kenya', 'Tanzania', 'Uganda'] },
  { id: 'Africa/Lagos', places: ['Nigeria'] },
  { id: 'Africa/Johannesburg', places: ['South Africa'] },
  { id: 'Africa/Accra', places: ['Ghana'] },
  { id: 'Indian/Mauritius', places: ['Mauritius'] },
  { id: 'America/New_York', places: ['United States', 'Eastern', 'Toronto'] },
  { id: 'America/Chicago', places: ['United States', 'Central'] },
  { id: 'America/Denver', places: ['United States', 'Mountain'] },
  { id: 'America/Los_Angeles', places: ['United States', 'Pacific'] },
  { id: 'America/Anchorage', places: ['United States', 'Alaska'] },
  { id: 'Pacific/Honolulu', places: ['United States', 'Hawaii'] },
  { id: 'America/Toronto', places: ['Canada', 'Ontario'] },
  { id: 'America/Vancouver', places: ['Canada', 'British Columbia'] },
  { id: 'America/Mexico_City', places: ['Mexico'] },
  { id: 'America/Bogota', places: ['Colombia'] },
  { id: 'America/Lima', places: ['Peru'] },
  { id: 'America/Sao_Paulo', places: ['Brazil'] },
  { id: 'America/Argentina/Buenos_Aires', places: ['Argentina'] },
  { id: 'America/Santiago', places: ['Chile'] },
  { id: 'Australia/Perth', places: ['Australia', 'Western Australia'] },
  { id: 'Australia/Adelaide', places: ['Australia', 'South Australia'] },
  { id: 'Australia/Brisbane', places: ['Australia', 'Queensland'] },
  { id: 'Australia/Sydney', places: ['Australia', 'New South Wales'] },
  { id: 'Australia/Melbourne', places: ['Australia', 'Victoria'] },
  { id: 'Pacific/Auckland', places: ['New Zealand'] },
  { id: 'Pacific/Fiji', places: ['Fiji'] },
  { id: 'UTC', places: ['Coordinated Universal Time'] },
];
