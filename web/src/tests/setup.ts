import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom implements neither of these, and framer-motion's in-view hook plus the
// theme provider both reach for them during render.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// Scroll and intersection behaviour used by reveal animations.
Element.prototype.scrollIntoView ??= () => {};
globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: number[] = [];
} as unknown as typeof IntersectionObserver;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
