// Polyfill browser APIs jsdom does not implement but our UI primitives rely on.

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  (globalThis as any).ResizeObserver = ResizeObserverStub;
}

if (typeof globalThis.IntersectionObserver === "undefined") {
  (globalThis as any).IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
    root = null;
    rootMargin = "";
    thresholds = [];
  };
}

if (typeof window !== "undefined" && typeof window.matchMedia === "undefined") {
  (window as any).matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

if (typeof Element !== "undefined" && !(Element.prototype as any).scrollIntoView) {
  (Element.prototype as any).scrollIntoView = function () {};
}

// Mock Canvas getContext for jsdom (canvas.getContext('2d') returns null in jsdom)
if (typeof HTMLCanvasElement !== 'undefined') {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type: string) {
    if (type === '2d') {
      return {
        clearRect: () => {},
        fillRect: () => {},
        scale: () => {},
        fillStyle: '',
        canvas: this,
      } as any;
    }
    return originalGetContext.call(this, type);
  };
}

if (typeof HTMLElement !== "undefined" && !(HTMLElement.prototype as any).releasePointerCapture) {
  (HTMLElement.prototype as any).releasePointerCapture = function () {};
  (HTMLElement.prototype as any).setPointerCapture = function () {};
  (HTMLElement.prototype as any).hasPointerCapture = function () { return false; };
}

// Ensure cleanup runs between tests to prevent DOM accumulation across test files
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
afterEach(cleanup);

import '@testing-library/jest-dom/vitest';