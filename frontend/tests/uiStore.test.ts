import { beforeEach, describe, expect, it } from 'vitest';

import { applyTheme, useUiStore } from '@/store/uiStore';

describe('uiStore', () => {
  beforeEach(() => {
    useUiStore.setState({ theme: 'dark', sidebarOpen: true });
    document.documentElement.className = '';
  });

  it('cycles theme values through setTheme', () => {
    useUiStore.getState().setTheme('light');
    expect(useUiStore.getState().theme).toBe('light');
    useUiStore.getState().setTheme('system');
    expect(useUiStore.getState().theme).toBe('system');
  });

  it('toggles the sidebar flag', () => {
    const before = useUiStore.getState().sidebarOpen;
    useUiStore.getState().toggleSidebar();
    expect(useUiStore.getState().sidebarOpen).toBe(!before);
  });

  it('applyTheme toggles the dark class based on preference', () => {
    applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    applyTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('applyTheme resolves system to dark when matchMedia prefers dark', () => {
    const prefersDark = (query: string) =>
      ({
        matches: query.includes('dark'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false
      }) as unknown as MediaQueryList;
    window.matchMedia = prefersDark as unknown as typeof window.matchMedia;

    applyTheme('system');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
