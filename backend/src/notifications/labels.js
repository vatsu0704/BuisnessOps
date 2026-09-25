/**
 * Push notification text, per language.
 *
 * --------------------------------------------------------------------------
 * WHY THIS FILE IS ALLOWED TO EXIST
 * --------------------------------------------------------------------------
 * CLAUDE.md forbids the backend from writing user-facing prose, and the stated
 * reason is that it cannot know the reader's language — the choice lives on the
 * device and may differ from the account's `preferredLocale`.
 *
 * That premise is true of an HTTP response and false of a push. Android draws a
 * notification on the lock screen **before any app code runs**, so there is no
 * moment in which the device could render it. And a device registering its FCM
 * token reports its own language in the same request (`DeviceToken.locale`), so
 * the backend is not guessing: it was told.
 *
 * The exception is therefore bounded rather than a hole:
 *
 * 1. The text is rendered ONLY here, and only `notifications/push.js` may
 *    require this file. `scripts/check-notification-prose.js` fails CI if
 *    anything under `controllers/`, `services/` or `validations/` does.
 * 2. Every push ALSO carries `{ code, params }` in its data payload, and the
 *    in-app notification centre renders `t('notifications.<code>', params)`
 *    from the app's own locale files. The lock screen keeps the language it
 *    arrived in; the list in the app follows whatever is selected right now.
 * 3. `scripts/check-backend-i18n-parity.js` fails CI if the four languages here
 *    drift apart, or from the app's `notifications.*` keys.
 *
 * Anything that varies travels in `params`. Never bake a value into a sentence:
 * a translated sentence puts its numbers somewhere else.
 *
 * The Hindi, Gujarati and Marathi wordings were written without a native
 * speaker's review, like the app's own locale files. Corrections from a speaker
 * are expected rather than defects.
 */

/**
 * Each entry is `{ title, body }`.
 *
 * Titles are short because Android truncates them on one line. Bodies name the
 * thing and the place — "Order #214 from Andheri West" rather than "You have a
 * new order" — because a notification that does not say what it is about is one
 * the reader has to open the app to understand, which defeats the point.
 */
const LABELS = {
  en: {
    // --- Requirement 2: attendance -----------------------------------------
    ATTENDANCE_MARKED_PRESENT: {
      title: 'Marked present',
      body: 'You were marked present for {{date}} at {{branch}}.',
    },
    ATTENDANCE_MARKED_ABSENT: {
      title: 'Marked absent',
      body: 'You were marked absent for {{date}} at {{branch}}. Speak to your manager if that is wrong.',
    },
    ATTENDANCE_MARKED_HALF_DAY: {
      title: 'Marked half day',
      body: 'You were marked half day for {{date}} at {{branch}}.',
    },
    ATTENDANCE_MARKED_LEAVE: {
      title: 'Marked on leave',
      body: 'You were marked on leave for {{date}} at {{branch}}.',
    },

    // --- Requirement 3: the warehouse desk ---------------------------------
    SUPPLY_ORDER_PLACED: {
      title: 'New supply order',
      body: 'Order #{{orderNumber}} from {{branch}} — {{amount}}, {{payment}}.',
    },

    // --- Requirement 11: the branch follows its order ----------------------
    SUPPLY_ORDER_ACCEPTED: {
      title: 'Order accepted',
      body: 'The warehouse has started on order #{{orderNumber}}.',
    },
    SUPPLY_ORDER_PACKED: {
      title: 'Order packed',
      body: 'Order #{{orderNumber}} is packed and waiting to go out.',
    },
    SUPPLY_ORDER_DISPATCHED: {
      title: 'Order on its way',
      body: 'Order #{{orderNumber}} has left the warehouse.',
    },
    SUPPLY_ORDER_DELIVERED: {
      title: 'Order delivered',
      body: 'Order #{{orderNumber}} has been delivered.',
    },
    SUPPLY_ORDER_REJECTED: {
      title: 'Order rejected',
      body: 'The warehouse cannot fill order #{{orderNumber}}.',
    },

    // --- Requirement 9: delays and payment ---------------------------------
    SUPPLY_ORDER_DELAYED: {
      title: 'Running late',
      body: 'Order #{{orderNumber}} is {{minutes}} minutes late.',
    },
    SUPPLY_PAYMENT_VERIFIED: {
      title: 'Payment confirmed',
      body: 'The warehouse has confirmed payment for order #{{orderNumber}}.',
    },

    // --- Requirement 21: the agent is told they have a run -----------------
    SUPPLY_ORDER_ASSIGNED: {
      title: 'A delivery for you',
      body: 'Order #{{orderNumber}} to {{branch}} is yours to carry.',
    },
  },

  hi: {
    ATTENDANCE_MARKED_PRESENT: {
      title: 'हाज़िर लगाया गया',
      body: '{{branch}} पर {{date}} के लिए आपको हाज़िर लगाया गया है।',
    },
    ATTENDANCE_MARKED_ABSENT: {
      title: 'गैरहाज़िर लगाया गया',
      body: '{{branch}} पर {{date}} के लिए आपको गैरहाज़िर लगाया गया है। ग़लत हो तो अपने मैनेजर से बात करें।',
    },
    ATTENDANCE_MARKED_HALF_DAY: {
      title: 'आधा दिन लगाया गया',
      body: '{{branch}} पर {{date}} के लिए आपका आधा दिन लगाया गया है।',
    },
    ATTENDANCE_MARKED_LEAVE: {
      title: 'छुट्टी लगाई गई',
      body: '{{branch}} पर {{date}} के लिए आपकी छुट्टी लगाई गई है।',
    },

    SUPPLY_ORDER_PLACED: {
      title: 'नया सप्लाई ऑर्डर',
      body: '{{branch}} से ऑर्डर #{{orderNumber}} — {{amount}}, {{payment}}।',
    },

    SUPPLY_ORDER_ACCEPTED: {
      title: 'ऑर्डर स्वीकार हुआ',
      body: 'गोदाम ने ऑर्डर #{{orderNumber}} पर काम शुरू कर दिया है।',
    },
    SUPPLY_ORDER_PACKED: {
      title: 'ऑर्डर पैक हो गया',
      body: 'ऑर्डर #{{orderNumber}} पैक है और निकलने का इंतज़ार कर रहा है।',
    },
    SUPPLY_ORDER_DISPATCHED: {
      title: 'ऑर्डर रवाना',
      body: 'ऑर्डर #{{orderNumber}} गोदाम से निकल चुका है।',
    },
    SUPPLY_ORDER_DELIVERED: {
      title: 'ऑर्डर पहुँच गया',
      body: 'ऑर्डर #{{orderNumber}} पहुँचा दिया गया है।',
    },
    SUPPLY_ORDER_REJECTED: {
      title: 'ऑर्डर अस्वीकार',
      body: 'गोदाम ऑर्डर #{{orderNumber}} पूरा नहीं कर सकता।',
    },

    SUPPLY_ORDER_DELAYED: {
      title: 'देर हो रही है',
      body: 'ऑर्डर #{{orderNumber}} {{minutes}} मिनट लेट है।',
    },
    SUPPLY_PAYMENT_VERIFIED: {
      title: 'भुगतान की पुष्टि',
      body: 'गोदाम ने ऑर्डर #{{orderNumber}} का भुगतान पक्का कर दिया है।',
    },

    SUPPLY_ORDER_ASSIGNED: {
      title: 'आपके लिए एक डिलीवरी',
      body: '{{branch}} का ऑर्डर #{{orderNumber}} आपको पहुँचाना है।',
    },
  },

  gu: {
    ATTENDANCE_MARKED_PRESENT: {
      title: 'હાજર નોંધાયા',
      body: '{{branch}} પર {{date}} માટે તમને હાજર નોંધવામાં આવ્યા છે.',
    },
    ATTENDANCE_MARKED_ABSENT: {
      title: 'ગેરહાજર નોંધાયા',
      body: '{{branch}} પર {{date}} માટે તમને ગેરહાજર નોંધવામાં આવ્યા છે. ખોટું હોય તો તમારા મેનેજરને કહો.',
    },
    ATTENDANCE_MARKED_HALF_DAY: {
      title: 'અડધો દિવસ નોંધાયો',
      body: '{{branch}} પર {{date}} માટે તમારો અડધો દિવસ નોંધાયો છે.',
    },
    ATTENDANCE_MARKED_LEAVE: {
      title: 'રજા નોંધાઈ',
      body: '{{branch}} પર {{date}} માટે તમારી રજા નોંધાઈ છે.',
    },

    SUPPLY_ORDER_PLACED: {
      title: 'નવો સપ્લાય ઓર્ડર',
      body: '{{branch}} તરફથી ઓર્ડર #{{orderNumber}} — {{amount}}, {{payment}}.',
    },

    SUPPLY_ORDER_ACCEPTED: {
      title: 'ઓર્ડર સ્વીકારાયો',
      body: 'વેરહાઉસે ઓર્ડર #{{orderNumber}} પર કામ શરૂ કર્યું છે.',
    },
    SUPPLY_ORDER_PACKED: {
      title: 'ઓર્ડર પેક થયો',
      body: 'ઓર્ડર #{{orderNumber}} પેક છે અને નીકળવાની રાહ જુએ છે.',
    },
    SUPPLY_ORDER_DISPATCHED: {
      title: 'ઓર્ડર રવાના',
      body: 'ઓર્ડર #{{orderNumber}} વેરહાઉસથી નીકળી ગયો છે.',
    },
    SUPPLY_ORDER_DELIVERED: {
      title: 'ઓર્ડર પહોંચ્યો',
      body: 'ઓર્ડર #{{orderNumber}} પહોંચાડી દેવાયો છે.',
    },
    SUPPLY_ORDER_REJECTED: {
      title: 'ઓર્ડર નકારાયો',
      body: 'વેરહાઉસ ઓર્ડર #{{orderNumber}} પૂરો કરી શકે તેમ નથી.',
    },

    SUPPLY_ORDER_DELAYED: {
      title: 'મોડું થઈ રહ્યું છે',
      body: 'ઓર્ડર #{{orderNumber}} {{minutes}} મિનિટ મોડો છે.',
    },
    SUPPLY_PAYMENT_VERIFIED: {
      title: 'ચુકવણીની પુષ્ટિ',
      body: 'વેરહાઉસે ઓર્ડર #{{orderNumber}} ની ચુકવણી પાકી કરી છે.',
    },

    SUPPLY_ORDER_ASSIGNED: {
      title: 'તમારા માટે એક ડિલિવરી',
      body: '{{branch}} નો ઓર્ડર #{{orderNumber}} તમારે પહોંચાડવાનો છે.',
    },
  },

  mr: {
    ATTENDANCE_MARKED_PRESENT: {
      title: 'हजर नोंदवले',
      body: '{{branch}} येथे {{date}} साठी तुम्हाला हजर नोंदवले आहे.',
    },
    ATTENDANCE_MARKED_ABSENT: {
      title: 'गैरहजर नोंदवले',
      body: '{{branch}} येथे {{date}} साठी तुम्हाला गैरहजर नोंदवले आहे. चुकीचे असल्यास व्यवस्थापकाशी बोला.',
    },
    ATTENDANCE_MARKED_HALF_DAY: {
      title: 'अर्धा दिवस नोंदवला',
      body: '{{branch}} येथे {{date}} साठी तुमचा अर्धा दिवस नोंदवला आहे.',
    },
    ATTENDANCE_MARKED_LEAVE: {
      title: 'रजा नोंदवली',
      body: '{{branch}} येथे {{date}} साठी तुमची रजा नोंदवली आहे.',
    },

    SUPPLY_ORDER_PLACED: {
      title: 'नवीन पुरवठा ऑर्डर',
      body: '{{branch}} कडून ऑर्डर #{{orderNumber}} — {{amount}}, {{payment}}.',
    },

    SUPPLY_ORDER_ACCEPTED: {
      title: 'ऑर्डर स्वीकारली',
      body: 'गोदामाने ऑर्डर #{{orderNumber}} वर काम सुरू केले आहे.',
    },
    SUPPLY_ORDER_PACKED: {
      title: 'ऑर्डर पॅक झाली',
      body: 'ऑर्डर #{{orderNumber}} पॅक आहे आणि निघण्याच्या प्रतीक्षेत आहे.',
    },
    SUPPLY_ORDER_DISPATCHED: {
      title: 'ऑर्डर रवाना',
      body: 'ऑर्डर #{{orderNumber}} गोदामातून निघाली आहे.',
    },
    SUPPLY_ORDER_DELIVERED: {
      title: 'ऑर्डर पोहोचली',
      body: 'ऑर्डर #{{orderNumber}} पोहोचवली आहे.',
    },
    SUPPLY_ORDER_REJECTED: {
      title: 'ऑर्डर नाकारली',
      body: 'गोदाम ऑर्डर #{{orderNumber}} पूर्ण करू शकत नाही.',
    },

    SUPPLY_ORDER_DELAYED: {
      title: 'उशीर होत आहे',
      body: 'ऑर्डर #{{orderNumber}} {{minutes}} मिनिटे उशिरा आहे.',
    },
    SUPPLY_PAYMENT_VERIFIED: {
      title: 'पैसे मिळाल्याची खात्री',
      body: 'गोदामाने ऑर्डर #{{orderNumber}} चे पैसे मिळाल्याचे पक्के केले आहे.',
    },

    SUPPLY_ORDER_ASSIGNED: {
      title: 'तुमच्यासाठी एक डिलिव्हरी',
      body: '{{branch}} ची ऑर्डर #{{orderNumber}} तुम्हाला पोहोचवायची आहे.',
    },
  },
};

/** Every code this dictionary can render. The parity gate reads this. */
const NOTIFICATION_CODES = Object.keys(LABELS.en);

const LOCALES = Object.keys(LABELS);

module.exports = { LABELS, NOTIFICATION_CODES, LOCALES };
