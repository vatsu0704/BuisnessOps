const { BRAND } = require('../documents/layout');
const { isComplete } = require('./operator');

/**
 * The two public pages the app stores require: a privacy policy, and a page
 * where someone can find out how to delete their account without having the
 * app installed.
 *
 * ## Why these are prose in the backend
 *
 * Everywhere else the backend sends codes and the device renders them. These are
 * not API responses: they are public web pages, opened in a browser by Google's
 * and Apple's reviewers and by anybody following the link from the store
 * listing, so there is no app on the other end to render anything. They are in
 * English, because a privacy policy is a legal statement and nobody has
 * reviewed a translation of one.
 *
 * ## Keep them true
 *
 * The privacy policy describes what the code actually stores. When a feature
 * starts collecting something new — a field, a permission, a third party — this
 * file changes in the same change, and so does the Data safety table in
 * `Docs/PLAY_STORE_RELEASE.md`. A policy that has drifted from the code is a
 * false statement made to every user and to the store.
 */

/** Shown on both pages, and bumped whenever either one's substance changes. */
const LAST_UPDATED = '6 October 2026';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** An address set in one environment variable may separate its lines with `\n`. */
function addressHtml(address) {
  return address
    .split(/\\n|\n/)
    .map((line) => escapeHtml(line.trim()))
    .filter(Boolean)
    .join('<br>');
}

function emailLink(email) {
  const safe = escapeHtml(email);
  return `<a href="mailto:${safe}">${safe}</a>`;
}

function pendingNotice() {
  return `<div class="notice">
  <strong>Operator details are being finalised.</strong>
  The legal name, registered address and contact email of the company that
  operates KitnaPay will appear on this page before the app is offered to the
  public.
</div>`;
}

/** The "who we are / how to reach us" block both pages end with. */
function contactSection(operator) {
  if (!isComplete(operator)) {
    return `<h2>Contact</h2>${pendingNotice()}`;
  }
  return `<h2>Contact</h2>
<p>KitnaPay is operated by:</p>
<p class="operator"><strong>${escapeHtml(operator.name)}</strong><br>${addressHtml(operator.address)}</p>
<p>Email: ${emailLink(operator.email)}</p>
<p>This address is also where to raise a grievance about how your personal data
is handled, under India's Digital Personal Data Protection Act, 2023. We will
acknowledge it and respond as the Act requires.</p>`;
}

function page(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — KitnaPay</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; background: #F6F7FB; color: #1B1D2A;
         font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 32px 20px 64px; }
  .brand { font-weight: 800; font-size: 20px; letter-spacing: -0.3px; }
  .brand span { color: ${BRAND}; }
  h1 { font-size: 28px; line-height: 1.25; margin: 24px 0 4px; letter-spacing: -0.5px; }
  .updated { color: #5B6075; font-size: 14px; margin: 0 0 28px; }
  h2 { font-size: 19px; margin: 32px 0 8px; color: ${BRAND}; }
  ul { padding-left: 22px; }
  li { margin: 4px 0; }
  a { color: ${BRAND}; }
  .card { background: #FFFFFF; border-radius: 14px; padding: 4px 22px 18px; box-shadow: 0 1px 3px rgba(20, 22, 40, 0.08); }
  .notice { background: #FFF6E5; border: 1px solid #F1C66B; border-radius: 10px; padding: 12px 16px; margin: 8px 0; }
  .operator { line-height: 1.5; }
  .steps li { margin: 8px 0; }
</style>
</head>
<body>
<main>
<div class="brand">Kitna<span>pay</span></div>
<h1>${escapeHtml(title)}</h1>
<p class="updated">Last updated ${LAST_UPDATED}</p>
<div class="card">
${body}
</div>
</main>
</body>
</html>
`;
}

function renderPrivacy(operator) {
  return page(
    'Privacy policy',
    `<p>KitnaPay is an app that restaurant, retail and franchise businesses use to
run their branches: sales, staff attendance and payroll, supply orders and
expenses. This policy explains what personal data the app collects, why, who it
is shared with, and how you can have it deleted.</p>

${isComplete(operator) ? '' : pendingNotice()}

<h2>Who decides about your data</h2>
<p>For <strong>your own account</strong> — your name, email address, phone number
and settings — the operator of KitnaPay (named under <em>Contact</em>) is
responsible.</p>
<p>For <strong>a business's records</strong> — its sales, its staff records, the
attendance and pay of the people who work there — the business that uses
KitnaPay decides what it records, and we process that data on its behalf. If
you work for a business that uses KitnaPay and have a question about the
records it keeps about you, ask that business first.</p>

<h2>What we collect</h2>
<ul>
  <li><strong>Your account:</strong> your name, email address and, if you add it,
  your phone number. Your password is stored only as a one-way hash; nobody,
  including us, can read it. We also keep the language you chose for the app, and
  the time your password last changed, which is what signs your other devices out
  when you change it.</li>
  <li><strong>Resetting a password:</strong> if you ask for a reset link, we send
  one email to that address and keep a one-way hash of the link for one hour, or
  until it is used. The link itself is never stored, and nothing is kept once it
  expires.</li>
  <li><strong>Location, when you punch in or out:</strong> if you allow it, the
  app records where your phone was at that moment — or, punching in from the web
  version, where the browser says the computer is — and stores it with that day's
  attendance, so the business can confirm you were at the branch. It is read
  only at the moment you punch, never in the background. You can refuse the
  permission, on the phone or in the browser; a business that requires punching
  in at the branch may then not accept the punch. Branch addresses and map
  coordinates entered by the business are stored too.</li>
  <li><strong>Business records:</strong> what a business enters or uploads —
  branches, products and prices, sales, expenses, supply orders, vendors, and the
  UPI IDs payments are made to.</li>
  <li><strong>Your business's subscription:</strong> the plan the business is on,
  how many branches it pays for and until when, and, for each payment made to us,
  the amount, the date and the payment reference (a UPI reference or a bank
  transfer number). We never see or store card or bank account numbers.</li>
  <li><strong>Staff and payroll records:</strong> what an employer enters about
  the people who work for it — name, phone number, role, employee code, salary,
  joining and leaving dates, attendance and payslips.</li>
  <li><strong>Uploaded files:</strong> a sales spreadsheet (CSV or Excel) you
  upload is read once to import its rows and is not kept. The rows it contained
  are stored as sales.</li>
  <li><strong>Your device, for notifications:</strong> a push-notification token
  for your phone and the language it is set to, so a notification can reach you
  in your language.</li>
  <li><strong>Counter bills taken without a connection:</strong> kept in the app's
  private storage on that phone, or in the web browser's own storage on that
  computer, until they reach our servers, then stored like any other sale. A
  branch's phone number, if the business enters one, is printed on its receipts.
  So that the counter opens without a connection, the web version also keeps a copy
  of the signed-in session and the app's own files in that browser; signing out
  removes the session copy.</li>
  <li><strong>The receipt printer:</strong> to print tokens, the app asks Android
  for the "Nearby devices" permission and lists the printers already paired with
  the phone; in Chrome or Edge, the browser asks you to choose the printer once.
  Which printer was chosen stays on that phone or in that browser and is never sent
  to us; a receipt goes only to that printer. Neither searches for devices nor uses
  your location for this.</li>
  <li><strong>Server logs:</strong> when the app talks to our servers, we log
  the time, the address the request came from (IP address), which account and
  business made it, and whether it succeeded. These are for security and for
  fixing faults.</li>
</ul>
<p>We do not collect your contacts, photos, messages or browsing history. The app
contains no advertising and no third-party analytics or tracking.</p>

<h2>Why we use it</h2>
<ul>
  <li>To run the features you and your business use: sign-in, attendance,
  payroll, sales and reports, supply orders and expenses.</li>
  <li>To send you notifications about your work — for example that you were
  marked present, or that an order was dispatched. You can turn categories of
  notification off in the app's Settings.</li>
  <li>To keep the service secure, prevent abuse, and fix problems.</li>
</ul>
<p>We do not sell personal data, and we do not use it for advertising.</p>

<h2>Who sees it</h2>
<ul>
  <li><strong>The business you belong to.</strong> People in a business see what
  their role allows: for example a manager can see staff attendance, including
  where a punch was made, and an owner can see payroll. Each business's data is
  kept separate from every other business's.</li>
  <li><strong>Service providers who process it for us:</strong> Google Firebase
  Cloud Messaging, which delivers push notifications and receives the device
  token and the text of the notification; and our cloud hosting provider, which
  runs the servers and database the app uses.</li>
  <li><strong>Authorities</strong>, where the law requires us to disclose
  information.</li>
</ul>

<h2>How it is protected</h2>
<p>Data travels between the app and our servers over an encrypted (HTTPS)
connection. Passwords are hashed. Every request is checked against the
account's access, and an account that is disabled or deleted is refused
immediately rather than when its session expires.</p>

<h2>How long we keep it</h2>
<p>We keep your account for as long as you have it. A business's records are
kept for as long as the business uses KitnaPay, because they are its books.
When you delete your account, what happens is set out under <em>Deleting your
account</em> below.</p>

<h2>Deleting your account</h2>
<p>You can delete your account at any time from inside the app:
<strong>Settings → Delete account</strong>. <a href="/delete-account">This page</a>
explains exactly what is removed and how to ask if you no longer have the app.</p>
<ul>
  <li>Your name, phone number, password, notification settings and device tokens
  are removed, and your email address is erased from the account.</li>
  <li>A business that you own alone is deleted with all of its records.</li>
  <li>If you own a business that still has other active members, the app asks
  you to remove them first, so that nobody loses their workplace's records
  without the owner deciding it.</li>
  <li>Records that a business you worked for keeps about you — attendance and
  payslips — stay with that business, because they are its records of paying
  you. Your account's link to them is removed.</li>
</ul>

<h2>Your rights</h2>
<p>You can see your account details in the app's Settings, and delete your
account there as described above. You can also ask us what personal data we hold
about you, ask us to correct or erase it, and raise a grievance, using the
contact details below.</p>

<h2>Children</h2>
<p>KitnaPay is a tool for running a business and is meant for people aged 18
and over.</p>

<h2>Changes to this policy</h2>
<p>When this policy changes, the date at the top changes with it. If a change
affects what we collect or who we share it with, we will tell you before it
takes effect.</p>

${contactSection(operator)}`
  );
}

function renderDeleteAccount(operator) {
  const byEmail = operator.email
    ? `<p>If you no longer have the app, email ${emailLink(operator.email)} from
the address you signed up with, with the subject <strong>Delete my account</strong>.
We will confirm that the request came from you, then delete the account as
described above within 30 days and tell you when it is done.</p>`
    : pendingNotice();

  return page(
    'Delete your KitnaPay account',
    `<h2>In the app</h2>
<ol class="steps">
  <li>Open KitnaPay and go to <strong>Settings</strong>.</li>
  <li>Scroll to the bottom and tap <strong>Delete account</strong>.</li>
  <li>Read what will be deleted, enter your password, and confirm.</li>
</ol>
<p>The deletion happens at once, and you are signed out on every device.</p>

<h2>Before you delete</h2>
<p>If you own a business, download its records first: <strong>Reports →
Export</strong> gives you the month's sales, expenses and summary as a
spreadsheet. Once the business is deleted, they cannot be recovered.</p>

<h2>What is deleted</h2>
<ul>
  <li>Your name, phone number and password. Your email address is erased from the
  account, so you can sign up again with it later if you wish.</li>
  <li>Your notifications, notification settings and the device tokens used to
  send them.</li>
  <li>Every business you own alone, with all of its records: branches, products,
  sales, expenses, supply orders, staff, attendance and payroll.</li>
</ul>

<h2>What is not deleted</h2>
<ul>
  <li>If a business you own still has other active members, the deletion is
  refused until you remove them from the team. This stops a business's records
  disappearing without its owner deciding it.</li>
  <li>If you worked for a business, the attendance and payslips it keeps about you
  stay with it, because they are its records of paying you. Your account's link
  to them is removed.</li>
  <li>Server logs, which record requests but not their content, are kept for a
  limited time for security before being discarded.</li>
</ul>

<h2>Without the app</h2>
${byEmail}

${contactSection(operator)}`
  );
}

module.exports = { renderPrivacy, renderDeleteAccount, escapeHtml, LAST_UPDATED };
