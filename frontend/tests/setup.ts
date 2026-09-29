import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

import '@testing-library/jest-dom/vitest';

// With vitest `globals: false`, RTL cannot auto-register cleanup — do it here.
afterEach(() => cleanup());

/** jsdom lacks matchMedia — stub it for the theme store tests. */
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false
    }) as unknown as typeof window.matchMedia) as typeof window.matchMedia;
}

/** jsdom lacks IntersectionObserver — required by framer-motion's whileInView. */
class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];
  disconnect(): void {}
  observe(): void {}
  unobserve(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}
if (typeof window !== 'undefined') {
  window.IntersectionObserver ??= MockIntersectionObserver;
}

/** jsdom lacks ResizeObserver — used by chart libraries. */
class MockResizeObserver {
  disconnect(): void {}
  observe(): void {}
  unobserve(): void {}
}
if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
  (window as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver =
    MockResizeObserver;
}
