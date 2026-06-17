// frontend/src/test/unit/apiClient.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '../../core/api/client';

describe('API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock global fetch if necessary or use msw
    global.fetch = vi.fn();
  });

  it('should have correct base configuration', () => {
    expect(api.get).toBeDefined();
    expect(api.post).toBeDefined();
  });

  it('should handle successful GET request', async () => {
    const mockData = { status: 'ok' };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
      headers: new Headers({ 'content-type': 'application/json' })
    });

    const result = await api.get('/health');
    expect(result).toEqual(mockData);
  });

  it('should handle API errors', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ detail: 'Not Found' })
    });

    await expect(api.get('/invalid')).rejects.toThrow();
  });
});
