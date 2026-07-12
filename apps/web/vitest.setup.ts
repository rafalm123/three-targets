import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Odmontowuje wyrenderowane drzewo po każdym teście — inaczej kolejne render() nakładają się
// w tym samym document i zapytania trafiają na "multiple elements".
afterEach(() => {
  cleanup();
});

/**
 * Polyfill natywnego `<dialog>` dla jsdom (nie implementuje `showModal`/`close`/`cancel`).
 * Odwzorowuje minimum, którego używa `StreakReset`: property `open`, `showModal()`/`close()`
 * z eventem `close`, oraz `Escape` → event `cancel` (anulowalny) → `close()` gdy nie zapobieżono.
 * Produkcja używa natywnej implementacji przeglądarki; to wyłącznie środowisko testowe.
 */
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  const proto = HTMLDialogElement.prototype;
  const escHandlers = new WeakMap<HTMLDialogElement, (e: KeyboardEvent) => void>();

  Object.defineProperty(proto, 'open', {
    configurable: true,
    get(this: HTMLDialogElement) {
      return this.hasAttribute('open');
    },
    set(this: HTMLDialogElement, value: boolean) {
      if (value) this.setAttribute('open', '');
      else this.removeAttribute('open');
    },
  });

  proto.showModal = function showModal(this: HTMLDialogElement): void {
    this.setAttribute('open', '');
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      const cancelEvt = new Event('cancel', { cancelable: true });
      const notPrevented = this.dispatchEvent(cancelEvt);
      if (notPrevented) this.close();
    };
    document.addEventListener('keydown', onKeyDown);
    escHandlers.set(this, onKeyDown);
  };

  proto.close = function close(this: HTMLDialogElement, returnValue?: string): void {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    if (returnValue !== undefined) this.returnValue = returnValue;
    const handler = escHandlers.get(this);
    if (handler) {
      document.removeEventListener('keydown', handler);
      escHandlers.delete(this);
    }
    this.dispatchEvent(new Event('close'));
  };
}
