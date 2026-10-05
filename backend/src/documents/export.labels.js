/**
 * Day-end and month-end export labels, per language — requirement 17.
 *
 * ## Why this file is allowed to exist
 *
 * The backend does not translate and must not try: it cannot know the reader's
 * language, because that choice lives on the device. This is the **third** file
 * fenced against that rule, and it earns the exception the same way
 * `payslip.labels.js` does — the premise stops being true rather than being
 * quietly violated.
 *
 * A document is fetched by the device with an explicit `?lang=`, exactly as
 * `GET /salary-slips/:id/document` already is. So the backend is *told* the
 * language rather than guessing it, and a spreadsheet's column headers and a
 * printable summary's section titles have to be text by the time they leave here:
 * an .xlsx cell cannot hold a translation key, and neither can a printed page.
 *
 * `npm run lint:backend-i18n` compares all four languages here, checks that no
 * translation drops a placeholder the English uses, and does the same for the
 * other two dictionaries. Nothing else may be added without that gate covering
 * it — and everywhere the device *can* render, it still must: the overlap warning
 * travels in the JSON response as a code and params, and only the document
 * renders it as a sentence.
 *
 * The Hindi, Gujarati and Marathi wordings were written without a native
 * speaker's review, like the app's own locale files. Corrections from a speaker
 * are expected rather than defects.
 */

const LABELS = {
  en: {
    dayTitle: 'Day-end report',
    monthTitle: 'Month-end report',
    business: 'Business',
    branch: 'Branch',
    allBranches: 'All branches',
    date: 'Date',
    month: 'Month',
    generatedOn: 'Generated on',
    eachBranchOwnDay: "Each branch's own date",

    summary: 'Summary',
    counterSales: 'Counter sales',
    tokens: 'Tokens',
    voided: 'Voided',
    stillOpen: 'Still open',
    supplySpend: 'Raw material',
    supplyOrders: 'Supply orders',
    expenses: 'Expenses',
    entries: 'Entries',
    payroll: 'Wages',
    payslips: 'Payslips',
    netMovement: 'Cash movement',
    netMovementHint: 'Counter sales less expenses and raw material. Not net profit — see Reports.',

    dayClosed: 'Day closed on {{at}} by {{who}}',
    dayNotClosed: 'This day has not been closed, so figures may still change.',
    draftPayrollWarning: '{{count}} payslip is still a draft, so the wage total is not final.',

    warnings: 'Worth checking',
    overlapWarning:
      '{{amount}} logged under "{{category}}" on {{date}} matches supply order #{{orderNumber}} for the same amount. If that order was the same payment, it is counted twice.',

    sectionCounter: 'Counter orders',
    sectionSupply: 'Supply orders',
    sectionExpenses: 'Expenses',
    sectionAttendance: 'Attendance',
    sectionPayroll: 'Payslips',
    noRecords: 'Nothing was recorded.',
    moreInSpreadsheet: '… {{hidden}} more rows are in the spreadsheet.',

    colToken: 'Token',
    colOpened: 'Opened',
    colClosed: 'Closed',
    colItems: 'Items',
    colStatus: 'Status',
    colPayment: 'Payment',
    colAmount: 'Amount',
    colTakenBy: 'Taken by',
    colOrderNumber: 'Order',
    colPlacedAt: 'Placed',
    colPlacedBy: 'Placed by',
    colPaymentMode: 'Pay mode',
    colSupplier: 'Supplier',
    supplierWarehouse: 'Warehouse',
    colPaymentStatus: 'Pay status',
    colAgent: 'Agent',
    colCategory: 'Category',
    colNote: 'Note',
    colRecordedBy: 'Recorded by',
    colStaff: 'Staff',
    colCode: 'Code',
    colRole: 'Role',
    colPunchIn: 'Punch in',
    colPunchOut: 'Punch out',
    colDaysWorked: 'Days worked',
    colGross: 'Gross',
    colDeductions: 'Deductions',
    colNet: 'Net pay',
    colBranch: 'Branch',
    colDate: 'Date',
    total: 'Total',

    statusOpen: 'Open',
    statusClosed: 'Closed',
    statusVoid: 'Void',
    statusPlaced: 'Placed',
    statusAccepted: 'Accepted',
    statusPacked: 'Packed',
    statusDispatched: 'Dispatched',
    statusDelivered: 'Delivered',
    statusPresent: 'Present',
    statusAbsent: 'Absent',
    statusHalfDay: 'Half day',
    statusLeave: 'Leave',
    statusDraft: 'Draft',
    statusFinal: 'Final',
    statusPending: 'Pending',
    statusPaid: 'Payment sent',
    statusVerified: 'Paid',
    statusFailed: 'Not received',

    modeOnline: 'Paid before ordering',
    modeCod: 'Pay on delivery',
    modeAccounts: 'Paid by accounts',

    payCash: 'Cash',
    payCard: 'Card',
    payUpi: 'UPI',
    payWallet: 'Wallet',
    payOther: 'Other',
    payMixed: 'Mixed',
    payUnspecified: 'Not recorded',

    sheetSummary: 'Summary',
    sheetCounter: 'Counter orders',
    sheetSupply: 'Supply orders',
    sheetExpenses: 'Expenses',
    sheetAttendance: 'Attendance',
    sheetPayroll: 'Payslips',
  },

  hi: {
    dayTitle: 'दिन के अंत की रिपोर्ट',
    monthTitle: 'महीने के अंत की रिपोर्ट',
    business: 'व्यवसाय',
    branch: 'शाखा',
    allBranches: 'सभी शाखाएँ',
    date: 'तारीख़',
    month: 'महीना',
    generatedOn: 'बनाई गई',
    eachBranchOwnDay: 'हर शाखा की अपनी तारीख़',

    summary: 'सारांश',
    counterSales: 'काउंटर बिक्री',
    tokens: 'टोकन',
    voided: 'रद्द',
    stillOpen: 'अभी खुले',
    supplySpend: 'कच्चा माल',
    supplyOrders: 'सप्लाई ऑर्डर',
    expenses: 'ख़र्च',
    entries: 'प्रविष्टियाँ',
    payroll: 'वेतन',
    payslips: 'वेतन पर्चियाँ',
    netMovement: 'नक़द आवाजाही',
    netMovementHint: 'काउंटर बिक्री में से ख़र्च और कच्चा माल घटाकर। यह शुद्ध लाभ नहीं है — रिपोर्ट देखें।',

    dayClosed: 'दिन {{at}} को {{who}} ने बंद किया',
    dayNotClosed: 'यह दिन बंद नहीं हुआ है, इसलिए आँकड़े अभी बदल सकते हैं।',
    draftPayrollWarning: '{{count}} वेतन पर्ची अभी ड्राफ़्ट है, इसलिए वेतन का कुल अंतिम नहीं है।',

    warnings: 'जाँचने योग्य',
    overlapWarning:
      '{{date}} को "{{category}}" के अंतर्गत दर्ज {{amount}} उतनी ही राशि के सप्लाई ऑर्डर #{{orderNumber}} से मेल खाता है। अगर वह वही भुगतान था, तो यह दो बार गिना गया है।',

    sectionCounter: 'काउंटर ऑर्डर',
    sectionSupply: 'सप्लाई ऑर्डर',
    sectionExpenses: 'ख़र्च',
    sectionAttendance: 'हाज़िरी',
    sectionPayroll: 'वेतन पर्चियाँ',
    noRecords: 'कुछ दर्ज नहीं हुआ।',
    moreInSpreadsheet: '… {{hidden}} और पंक्तियाँ स्प्रेडशीट में हैं।',

    colToken: 'टोकन',
    colOpened: 'खुला',
    colClosed: 'बंद',
    colItems: 'वस्तुएँ',
    colStatus: 'स्थिति',
    colPayment: 'भुगतान',
    colAmount: 'राशि',
    colTakenBy: 'लिया',
    colOrderNumber: 'ऑर्डर',
    colPlacedAt: 'दिया',
    colPlacedBy: 'देने वाला',
    colPaymentMode: 'भुगतान तरीक़ा',
    colSupplier: 'आपूर्तिकर्ता',
    supplierWarehouse: 'गोदाम',
    colPaymentStatus: 'भुगतान स्थिति',
    colAgent: 'एजेंट',
    colCategory: 'श्रेणी',
    colNote: 'टिप्पणी',
    colRecordedBy: 'दर्ज किया',
    colStaff: 'कर्मचारी',
    colCode: 'कोड',
    colRole: 'भूमिका',
    colPunchIn: 'आना',
    colPunchOut: 'जाना',
    colDaysWorked: 'काम के दिन',
    colGross: 'कुल',
    colDeductions: 'कटौती',
    colNet: 'शुद्ध वेतन',
    colBranch: 'शाखा',
    colDate: 'तारीख़',
    total: 'कुल',

    statusOpen: 'खुला',
    statusClosed: 'बंद',
    statusVoid: 'रद्द',
    statusPlaced: 'दिया गया',
    statusAccepted: 'स्वीकार',
    statusPacked: 'पैक',
    statusDispatched: 'भेजा',
    statusDelivered: 'पहुँचा',
    statusPresent: 'उपस्थित',
    statusAbsent: 'अनुपस्थित',
    statusHalfDay: 'आधा दिन',
    statusLeave: 'छुट्टी',
    statusDraft: 'ड्राफ़्ट',
    statusFinal: 'अंतिम',
    statusPending: 'बाक़ी',
    statusPaid: 'भुगतान भेजा',
    statusVerified: 'चुकाया',
    statusFailed: 'नहीं मिला',

    modeOnline: 'ऑर्डर से पहले भुगतान',
    modeCod: 'डिलीवरी पर भुगतान',
    modeAccounts: 'अकाउंट्स द्वारा भुगतान',

    payCash: 'नक़द',
    payCard: 'कार्ड',
    payUpi: 'UPI',
    payWallet: 'वॉलेट',
    payOther: 'अन्य',
    payMixed: 'मिश्रित',
    payUnspecified: 'दर्ज नहीं',

    sheetSummary: 'सारांश',
    sheetCounter: 'काउंटर ऑर्डर',
    sheetSupply: 'सप्लाई ऑर्डर',
    sheetExpenses: 'ख़र्च',
    sheetAttendance: 'हाज़िरी',
    sheetPayroll: 'वेतन पर्चियाँ',
  },

  gu: {
    dayTitle: 'દિવસના અંતનો રિપોર્ટ',
    monthTitle: 'મહિનાના અંતનો રિપોર્ટ',
    business: 'વ્યવસાય',
    branch: 'શાખા',
    allBranches: 'બધી શાખાઓ',
    date: 'તારીખ',
    month: 'મહિનો',
    generatedOn: 'બનાવ્યો',
    eachBranchOwnDay: 'દરેક શાખાની પોતાની તારીખ',

    summary: 'સારાંશ',
    counterSales: 'કાઉન્ટર વેચાણ',
    tokens: 'ટોકન',
    voided: 'રદ',
    stillOpen: 'હજી ખુલ્લા',
    supplySpend: 'કાચો માલ',
    supplyOrders: 'સપ્લાય ઓર્ડર',
    expenses: 'ખર્ચ',
    entries: 'નોંધ',
    payroll: 'પગાર',
    payslips: 'પગાર સ્લિપ',
    netMovement: 'રોકડ હેરફેર',
    netMovementHint: 'કાઉન્ટર વેચાણમાંથી ખર્ચ અને કાચો માલ ઘટાડીને. આ ચોખ્ખો નફો નથી — રિપોર્ટ જુઓ.',

    dayClosed: 'દિવસ {{at}} એ {{who}} દ્વારા બંધ કરાયો',
    dayNotClosed: 'આ દિવસ બંધ થયો નથી, તેથી આંકડા હજી બદલાઈ શકે.',
    draftPayrollWarning: '{{count}} પગાર સ્લિપ હજી ડ્રાફ્ટ છે, તેથી પગારનો કુલ આખરી નથી.',

    warnings: 'તપાસવા જેવું',
    overlapWarning:
      '{{date}} એ "{{category}}" હેઠળ નોંધેલા {{amount}} એ જ રકમના સપ્લાય ઓર્ડર #{{orderNumber}} સાથે મેળ ખાય છે. જો તે એ જ ચુકવણી હોય, તો તે બે વાર ગણાઈ છે.',

    sectionCounter: 'કાઉન્ટર ઓર્ડર',
    sectionSupply: 'સપ્લાય ઓર્ડર',
    sectionExpenses: 'ખર્ચ',
    sectionAttendance: 'હાજરી',
    sectionPayroll: 'પગાર સ્લિપ',
    noRecords: 'કંઈ નોંધાયું નથી.',
    moreInSpreadsheet: '… {{hidden}} વધુ પંક્તિઓ સ્પ્રેડશીટમાં છે.',

    colToken: 'ટોકન',
    colOpened: 'ખૂલ્યો',
    colClosed: 'બંધ',
    colItems: 'વસ્તુઓ',
    colStatus: 'સ્થિતિ',
    colPayment: 'ચુકવણી',
    colAmount: 'રકમ',
    colTakenBy: 'લીધું',
    colOrderNumber: 'ઓર્ડર',
    colPlacedAt: 'આપ્યો',
    colPlacedBy: 'આપનાર',
    colPaymentMode: 'ચુકવણી રીત',
    colSupplier: 'સપ્લાયર',
    supplierWarehouse: 'વેરહાઉસ',
    colPaymentStatus: 'ચુકવણી સ્થિતિ',
    colAgent: 'એજન્ટ',
    colCategory: 'શ્રેણી',
    colNote: 'નોંધ',
    colRecordedBy: 'નોંધનાર',
    colStaff: 'કર્મચારી',
    colCode: 'કોડ',
    colRole: 'ભૂમિકા',
    colPunchIn: 'આવ્યા',
    colPunchOut: 'ગયા',
    colDaysWorked: 'કામના દિવસ',
    colGross: 'કુલ',
    colDeductions: 'કપાત',
    colNet: 'ચોખ્ખો પગાર',
    colBranch: 'શાખા',
    colDate: 'તારીખ',
    total: 'કુલ',

    statusOpen: 'ખુલ્લો',
    statusClosed: 'બંધ',
    statusVoid: 'રદ',
    statusPlaced: 'આપેલો',
    statusAccepted: 'સ્વીકાર્યો',
    statusPacked: 'પેક',
    statusDispatched: 'રવાના',
    statusDelivered: 'પહોંચ્યો',
    statusPresent: 'હાજર',
    statusAbsent: 'ગેરહાજર',
    statusHalfDay: 'અડધો દિવસ',
    statusLeave: 'રજા',
    statusDraft: 'ડ્રાફ્ટ',
    statusFinal: 'આખરી',
    statusPending: 'બાકી',
    statusPaid: 'ચુકવણી મોકલી',
    statusVerified: 'ચૂકવ્યું',
    statusFailed: 'મળ્યું નથી',

    modeOnline: 'ઓર્ડર પહેલાં ચુકવણી',
    modeCod: 'ડિલિવરી પર ચુકવણી',
    modeAccounts: 'એકાઉન્ટ્સ દ્વારા ચુકવણી',

    payCash: 'રોકડ',
    payCard: 'કાર્ડ',
    payUpi: 'UPI',
    payWallet: 'વૉલેટ',
    payOther: 'અન્ય',
    payMixed: 'મિશ્ર',
    payUnspecified: 'નોંધ્યું નથી',

    sheetSummary: 'સારાંશ',
    sheetCounter: 'કાઉન્ટર ઓર્ડર',
    sheetSupply: 'સપ્લાય ઓર્ડર',
    sheetExpenses: 'ખર્ચ',
    sheetAttendance: 'હાજરી',
    sheetPayroll: 'પગાર સ્લિપ',
  },

  mr: {
    dayTitle: 'दिवसअंतीचा अहवाल',
    monthTitle: 'महिनाअंतीचा अहवाल',
    business: 'व्यवसाय',
    branch: 'शाखा',
    allBranches: 'सर्व शाखा',
    date: 'तारीख',
    month: 'महिना',
    generatedOn: 'तयार केला',
    eachBranchOwnDay: 'प्रत्येक शाखेची स्वतःची तारीख',

    summary: 'सारांश',
    counterSales: 'काउंटर विक्री',
    tokens: 'टोकन',
    voided: 'रद्द',
    stillOpen: 'अजून उघडे',
    supplySpend: 'कच्चा माल',
    supplyOrders: 'सप्लाय ऑर्डर',
    expenses: 'खर्च',
    entries: 'नोंदी',
    payroll: 'पगार',
    payslips: 'पगार पावत्या',
    netMovement: 'रोख हालचाल',
    netMovementHint: 'काउंटर विक्रीतून खर्च आणि कच्चा माल वजा करून. हा निव्वळ नफा नाही — अहवाल पाहा.',

    dayClosed: 'दिवस {{at}} रोजी {{who}} यांनी बंद केला',
    dayNotClosed: 'हा दिवस बंद झालेला नाही, म्हणून आकडे बदलू शकतात.',
    draftPayrollWarning: '{{count}} पगार पावती अजून मसुदा आहे, म्हणून पगाराची एकूण रक्कम अंतिम नाही.',

    warnings: 'तपासण्यासारखे',
    overlapWarning:
      '{{date}} रोजी "{{category}}" अंतर्गत नोंदवलेले {{amount}} त्याच रकमेच्या सप्लाय ऑर्डर #{{orderNumber}} शी जुळते. तीच रक्कम असल्यास ती दोनदा मोजली गेली आहे.',

    sectionCounter: 'काउंटर ऑर्डर',
    sectionSupply: 'सप्लाय ऑर्डर',
    sectionExpenses: 'खर्च',
    sectionAttendance: 'हजेरी',
    sectionPayroll: 'पगार पावत्या',
    noRecords: 'काहीही नोंदवले नाही.',
    moreInSpreadsheet: '… {{hidden}} अधिक ओळी स्प्रेडशीटमध्ये आहेत.',

    colToken: 'टोकन',
    colOpened: 'उघडला',
    colClosed: 'बंद',
    colItems: 'वस्तू',
    colStatus: 'स्थिती',
    colPayment: 'पेमेंट',
    colAmount: 'रक्कम',
    colTakenBy: 'घेतले',
    colOrderNumber: 'ऑर्डर',
    colPlacedAt: 'दिला',
    colPlacedBy: 'देणारा',
    colPaymentMode: 'पेमेंट प्रकार',
    colSupplier: 'पुरवठादार',
    supplierWarehouse: 'गोदाम',
    colPaymentStatus: 'पेमेंट स्थिती',
    colAgent: 'एजंट',
    colCategory: 'प्रवर्ग',
    colNote: 'टिप्पणी',
    colRecordedBy: 'नोंदवले',
    colStaff: 'कर्मचारी',
    colCode: 'कोड',
    colRole: 'भूमिका',
    colPunchIn: 'आले',
    colPunchOut: 'गेले',
    colDaysWorked: 'कामाचे दिवस',
    colGross: 'एकूण',
    colDeductions: 'वजावट',
    colNet: 'निव्वळ पगार',
    colBranch: 'शाखा',
    colDate: 'तारीख',
    total: 'एकूण',

    statusOpen: 'उघडा',
    statusClosed: 'बंद',
    statusVoid: 'रद्द',
    statusPlaced: 'दिलेला',
    statusAccepted: 'स्वीकारला',
    statusPacked: 'पॅक',
    statusDispatched: 'रवाना',
    statusDelivered: 'पोहोचला',
    statusPresent: 'हजर',
    statusAbsent: 'गैरहजर',
    statusHalfDay: 'अर्धा दिवस',
    statusLeave: 'सुट्टी',
    statusDraft: 'मसुदा',
    statusFinal: 'अंतिम',
    statusPending: 'बाकी',
    statusPaid: 'पैसे पाठवले',
    statusVerified: 'भरले',
    statusFailed: 'मिळाले नाहीत',

    modeOnline: 'ऑर्डरपूर्वी पेमेंट',
    modeCod: 'डिलिव्हरीवर पेमेंट',
    modeAccounts: 'अकाउंट्सकडून पेमेंट',

    payCash: 'रोख',
    payCard: 'कार्ड',
    payUpi: 'UPI',
    payWallet: 'वॉलेट',
    payOther: 'इतर',
    payMixed: 'मिश्र',
    payUnspecified: 'नोंदवले नाही',

    sheetSummary: 'सारांश',
    sheetCounter: 'काउंटर ऑर्डर',
    sheetSupply: 'सप्लाय ऑर्डर',
    sheetExpenses: 'खर्च',
    sheetAttendance: 'हजेरी',
    sheetPayroll: 'पगार पावत्या',
  },
};

const SUPPORTED = Object.keys(LABELS);

/**
 * The dictionary for one language, falling back to English per missing key
 * rather than per language — a half-translated file should leak English words,
 * not an English document.
 */
function labelsFor(lang) {
  const chosen = LABELS[lang] ?? LABELS.en;
  return { ...LABELS.en, ...chosen };
}

/** Enum value → label key, so a value the backend adds later fails loudly here. */
const COUNTER_STATUS = { OPEN: 'statusOpen', CLOSED: 'statusClosed', VOID: 'statusVoid' };

const SUPPLY_STATUS = {
  DRAFT: 'statusDraft',
  PLACED: 'statusPlaced',
  ACCEPTED: 'statusAccepted',
  PACKED: 'statusPacked',
  DISPATCHED: 'statusDispatched',
  DELIVERED: 'statusDelivered',
  CANCELLED: 'statusVoid',
};

const PAYMENT_STATUS = {
  PENDING: 'statusPending',
  PAID: 'statusPaid',
  VERIFIED: 'statusVerified',
  FAILED: 'statusFailed',
};

// ACCOUNTS is a company-operated branch's order, paid by accounts (requirement 24).
const PAYMENT_MODE = { ONLINE: 'modeOnline', COD: 'modeCod', ACCOUNTS: 'modeAccounts' };

const ATTENDANCE_STATUS = {
  PRESENT: 'statusPresent',
  ABSENT: 'statusAbsent',
  HALF_DAY: 'statusHalfDay',
  LEAVE: 'statusLeave',
};

const PAYMENT_METHOD = {
  CASH: 'payCash',
  CARD: 'payCard',
  UPI: 'payUpi',
  WALLET: 'payWallet',
  OTHER: 'payOther',
  MIXED: 'payMixed',
  UNSPECIFIED: 'payUnspecified',
};

const SLIP_STATUS = { DRAFT: 'statusDraft', FINALIZED: 'statusFinal' };

module.exports = {
  LABELS,
  SUPPORTED,
  labelsFor,
  COUNTER_STATUS,
  SUPPLY_STATUS,
  PAYMENT_STATUS,
  PAYMENT_MODE,
  ATTENDANCE_STATUS,
  PAYMENT_METHOD,
  SLIP_STATUS,
};
