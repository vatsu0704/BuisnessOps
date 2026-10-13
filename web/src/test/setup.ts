import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { i18nReady } from '@/i18n';

// jsdom has no matchMedia, which the motion helpers ask for reduced motion.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// Nor does it implement <dialog>'s modal methods; these stand-ins toggle `open`,
// which is all a test reads.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
}

// Every test reads translated sentences, in English.
await i18nReady;

afterEach(() => cleanup());
