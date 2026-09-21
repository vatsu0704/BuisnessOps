/**
 * Every message this API can send a person, keyed by a stable machine code.
 *
 * The backend deliberately does NOT translate. The app ships in English, Hindi,
 * Gujarati and Marathi, and the language it should use is the one chosen on the
 * device — which can differ from the account's `preferredLocale` and is not
 * known here. So the wire carries a code plus its parameters, and the client
 * renders it through `t('errors.api.<CODE>')` with all its other strings. This
 * is the same pattern the payroll-run skip reasons already use.
 *
 * The English text below is the fallback, not the translation: it is what a
 * client that has never heard of a code displays, what curl and Postman show,
 * and what the server logs. Keeping it here rather than at each throw site is
 * what makes "is every code translated?" a question a script can answer —
 * see `scripts/check-error-parity.js`.
 *
 * Placeholders are `{{name}}`, matching i18next, so one string serves both
 * sides without rewriting.
 */

// Codes for a specific, named failure. The status lives at the throw site
// rather than here: the same condition is a 404 in one place and a 403 in
// another, depending on whether admitting the record exists is a leak.
const API_MESSAGES = {
  // --- Session and account -------------------------------------------------
  AUTH_HEADER_MISSING: 'Missing or invalid Authorization header',
  AUTH_TOKEN_INVALID: 'Invalid or expired token',
  AUTH_CREDENTIALS_INVALID: 'Invalid email or password',
  AUTH_EMAIL_TAKEN: 'An account with this email already exists',
  AUTH_BUSINESS_DETAILS_REQUIRED:
    'businessName, industry, country, defaultCurrency and timezone are required to create a new business',
  USER_NOT_FOUND: 'User not found',

  // --- Tenancy and permissions --------------------------------------------
  TENANT_BUSINESS_ID_REQUIRED: 'businessId is required in the route',
  TENANT_ACCESS_DENIED: 'You do not have access to this business',
  PERMISSION_DENIED: 'Insufficient permissions',
  BRANCH_ACCESS_DENIED: 'You do not have access to this branch',
  BRANCH_ACCESS_DENIED_DESTINATION: 'You do not have access to the destination branch',
  STAFF_ACCESS_DENIED: 'You do not have access to this staff member',
  SALARY_SLIP_ACCESS_DENIED: 'You do not have access to this salary slip',
  PAY_SET_REQUIRES_OWNER_ADMIN: 'Only an owner or admin can set pay',
  PAY_CHANGE_REQUIRES_OWNER_ADMIN: 'Only an owner or admin can change pay',

  // --- Business and branches ----------------------------------------------
  BUSINESS_NOT_FOUND: 'Business not found',
  BRANCH_NOT_FOUND: 'Branch not found',
  BRANCH_NOT_FOUND_IN_BUSINESS: 'Branch not found in this business',
  GEOFENCE_NEEDS_COORDINATES: 'A geofence radius needs the branch latitude and longitude to be set',

  // --- Team, memberships and invites --------------------------------------
  MEMBERSHIP_NOT_FOUND: 'Membership not found in this business',
  MEMBERSHIP_ALREADY_EXISTS: 'This user is already a member of this business',
  MEMBERSHIP_SELF_REVOKE: 'You cannot revoke your own access',
  MEMBERSHIP_OWNER_REVOKE_REQUIRES_OWNER: 'Only an owner can revoke another owner',
  MEMBERSHIP_BRANCH_ACCESS_NOT_FOUND: 'This member does not have access to that branch',
  INVITE_BRANCHES_NOT_IN_BUSINESS: 'One or more branchIds do not belong to this business',
  INVITE_NOT_FOUND: 'Invite not found in this business',
  INVITE_ALREADY_ACCEPTED: 'This invite was already accepted — revoke the membership instead',
  INVITE_NONE_PENDING: 'No pending invite for this email',

  // --- Attendance ----------------------------------------------------------
  NOT_A_STAFF_MEMBER: 'You are not registered as a staff member of this business',
  STAFF_HAS_NO_BRANCH: 'This staff member is not attached to a branch of this business',
  PUNCH_LOCATION_REQUIRED: 'This branch requires your location to punch in/out',
  PUNCH_OUTSIDE_GEOFENCE:
    'You are {{distance}}m from the branch, outside the allowed {{radius}}m radius',
  PUNCH_ALREADY_IN: 'Already punched in today',
  PUNCH_NOT_IN: "You haven't punched in today",
  PUNCH_ALREADY_OUT: 'Already punched out today',
  ATTENDANCE_FUTURE_DATE: 'Cannot mark attendance for a future date',
  ATTENDANCE_BEFORE_HIRED: 'Cannot mark attendance before this person joined',
  ROSTER_FUTURE_DATE: 'Cannot read a roster for a future date',

  // --- Staff ---------------------------------------------------------------
  STAFF_NOT_FOUND: 'Staff member not found',
  STAFF_USER_NOT_FOUND: 'No account found for this email — ask them to sign up first',

  // --- Payroll -------------------------------------------------------------
  PAYSLIP_NO_BASE_SALARY: 'This staff member has no baseSalary set — cannot generate a payslip',
  PAYSLIP_FUTURE_MONTH: 'Cannot generate a payslip for a future month',
  PAYSLIP_FINALIZED: 'This payslip is finalized and cannot be regenerated',
  PAYSLIP_NOT_FOUND: 'Payslip not found',
  SALARY_SLIP_NOT_FOUND: 'Salary slip not found',
  NO_WORKING_DAYS: 'This month has no working days at this branch',

  // --- Work calendar -------------------------------------------------------
  HOLIDAY_DUPLICATE: 'A holiday already exists on this date',
  HOLIDAY_NOT_FOUND: 'Holiday not found',

  // --- Data sources and ingestion -----------------------------------------
  DATA_SOURCE_NOT_FOUND: 'Data source not found in this business',
  DATA_SOURCE_NO_BRANCH:
    'This data source has no branch assigned — set branchId when creating it before uploading',
  FILE_REQUIRED: 'file is required (multipart field name: file)',
  FILE_NO_ROWS: 'File has no data rows',
  UPLOAD_FAILED: 'Upload failed: {{reason}}',

  // --- Generic -------------------------------------------------------------
  VALIDATION_FAILED: 'Validation failed',
  // Carries a library's own message (multer's upload limits, for one). Named
  // rather than hidden under INTERNAL_ERROR so the client can tell "we have no
  // translation for this" apart from "the server broke".
  REQUEST_FAILED: '{{reason}}',
  ROUTE_NOT_FOUND: 'Route not found: {{path}}',
  RECORD_DUPLICATE: 'A record with this {{fields}} already exists',
  RECORD_NOT_FOUND: 'Record not found',
  RECORD_REFERENCE_MISSING: 'Referenced record does not exist',
  INTERNAL_ERROR: 'Internal Server Error',
};

/**
 * Codes for a rejected field, carried in a 400's `details` array.
 *
 * Deliberately parameterised rather than one code per message: 76 hand-written
 * validation strings across nine files turn out to be about 30 shapes, and
 * `{{field}}` is what varies. Translating 30 sentences is work someone can
 * finish; translating 76 near-duplicates is work nobody does.
 *
 * `{{field}}` is the raw API field name (`baseSalary`, `weeklyOffDays`). The
 * client substitutes a translated label where it has one and falls back to the
 * raw name otherwise, so a new field never renders as a blank space.
 */
const FIELD_MESSAGES = {
  FIELD_REQUIRED: '{{field}} is required',
  FIELD_MUST_BE_STRING: '{{field}} must be a string',
  FIELD_MUST_BE_NON_EMPTY_STRING: '{{field}} must be a non-empty string',
  FIELD_CANNOT_BE_EMPTY: '{{field}} cannot be empty',
  FIELD_MUST_BE_BOOLEAN: '{{field}} must be a boolean',
  FIELD_MUST_BE_ONE_OF: '{{field}} must be one of {{options}}',
  FIELD_MUST_BE_NON_NEGATIVE: '{{field}} must be a non-negative number',
  FIELD_MUST_BE_DATE: '{{field}} must be a real calendar date in YYYY-MM-DD form',
  FIELD_MAX_LENGTH: '{{field}} must be {{max}} characters or fewer',

  // Per-row diagnostics from a CSV/Excel upload. `column` is the literal
  // header in the uploaded file, so it stays untranslated in every language —
  // it names something the person has to go and fix in their spreadsheet.
  ROW_MISSING_COLUMN: 'Row {{row}}: missing {{column}}',
  ROW_QUANTITY_NOT_A_NUMBER: 'Row {{row}}: quantity is not a number',
  ROW_UNIT_PRICE_NOT_A_NUMBER: 'Row {{row}}: unit_price is not a number',
  ROW_PAYMENT_METHOD_INVALID: 'Row {{row}}: payment_method must be one of {{options}}',
  ROW_DATE_INVALID: 'Row {{row}}: occurred_at is not a valid date',
  FIELD_STRING_MAX_LENGTH: '{{field}} must be a string of {{max}} characters or fewer',
  FIELD_MUST_BE_STRING_ARRAY: '{{field}} must be an array of strings',
  FIELD_MUST_BE_ID_ARRAY: '{{field}} must be an array of ids',
  FIELD_MUST_BE_STAFF_MAP: '{{field}} must be an object keyed by staff member id',
  PROVIDE_AT_LEAST_ONE: 'provide at least one of: {{fields}}',

  EMAIL_REQUIRED: 'A valid email is required',
  EMAIL_INVALID: 'email must be a valid email address',
  PASSWORD_TOO_SHORT: 'password must be at least {{min}} characters',

  DATE_REQUIRED: 'date is required as a real calendar date in YYYY-MM-DD form',
  MONTH_REQUIRED: 'month is required as 1-12',
  YEAR_REQUIRED: 'year is required as a 4-digit number',
  EXITED_BEFORE_HIRED: 'exitedOn cannot be before hiredOn',

  LAT_LNG_TOGETHER: 'latitude and longitude must be provided together',
  LATITUDE_RANGE: 'latitude must be a number between -90 and 90',
  LONGITUDE_RANGE: 'longitude must be a number between -180 and 180',
  GEOFENCE_RADIUS_POSITIVE: 'geofenceRadiusMeters must be a positive number',
  GEOFENCE_RADIUS_NEEDS_COORDS: 'geofenceRadiusMeters requires latitude/longitude to be set',
  TIMEZONE_INVALID: 'timezone must be a valid IANA timezone',

  WEEKLY_OFF_DAYS_INVALID:
    'weeklyOffDays must be unique integers 0-6 (0 = Sunday), and cannot cover all seven days',
  WORK_WEEK_NOTHING_TO_UPDATE: 'provide weeklyOffDays or unmarkedWorkingDayStatus',
  BRANCH_ID_OR_NULL: 'branchId must be a string, or null for a business-wide holiday',
  PROVIDER_REQUIRED: 'provider is required (e.g. CSV_UPLOAD)',
};

module.exports = { API_MESSAGES, FIELD_MESSAGES };
