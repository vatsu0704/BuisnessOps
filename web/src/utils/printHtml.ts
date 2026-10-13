import i18n from '@/i18n';

/**
 * Print a document the server rendered as HTML — a payslip, the export summary —
 * through the browser's print dialog, where "Save as PDF" is one of the choices.
 *
 * The HTML goes into a hidden iframe rather than a new tab, so no pop-up blocker
 * gets a say and the page the person is on stays put. The app's `printDocument.ts`
 * does the same on its web branch.
 */
export async function printHtml(html: string): Promise<void> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    throw new Error(i18n.t('errors.printUnavailable'));
  }
  doc.open();
  doc.write(html);
  doc.close();

  // Fonts and images inside the document need a moment before the dialog
  // snapshots the page.
  await new Promise((resolve) => setTimeout(resolve, 250));
  iframe.contentWindow?.focus();
  iframe.contentWindow?.print();
  // print() returns before the dialog closes in some browsers; removing the
  // frame too early would print a blank page.
  setTimeout(() => iframe.remove(), 60000);
}
