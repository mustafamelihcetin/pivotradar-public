// frontend/src/test/useFeatureFlags.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function wrapper({ children }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useFeatureFlags', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('API başarısız olunca varsayılan flag\'ler döner', async () => {
    vi.doMock('@/core/api/client', () => ({
      api: { features: vi.fn().mockRejectedValue(new Error('network')) },
    }));
    const { useFeatureFlags } = await import('../store/useFeatureFlags');
    const { result } = renderHook(() => useFeatureFlags(), { wrapper });
    await waitFor(() => {
      expect(result.current.registration_enabled).toBe(true);
      expect(result.current.scanner_enabled).toBe(true);
    });
  });

  it('API başarılı olunca sunucu değerleri kullanılır', async () => {
    vi.doMock('@/core/api/client', () => ({
      api: {
        features: vi.fn().mockResolvedValue({
          registration_enabled: false,
          maintenance_mode: true,
        }),
      },
    }));
    const { useFeatureFlags } = await import('../store/useFeatureFlags');
    const { result } = renderHook(() => useFeatureFlags(), { wrapper });
    await waitFor(() => {
      expect(result.current.registration_enabled).toBe(false);
      expect(result.current.maintenance_mode).toBe(true);
      // Diğer bayraklar default kalır
      expect(result.current.scanner_enabled).toBe(true);
    });
  });
});
