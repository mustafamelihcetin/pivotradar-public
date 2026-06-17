// frontend/src/test/useAuthStore.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import useAuthStore from '../store/useAuthStore';

beforeEach(() => {
  useAuthStore.setState({
    user: null,
    token: null,
    refreshToken: null,
    isAuthenticated: false,
    isGuest: true,
    isAuthResolved: false,
    _sessionId: 0,
  });
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('useAuthStore', () => {
  it('başlangıçta kimliği doğrulanmamış durumda olmalı', () => {
    const { result } = renderHook(() => useAuthStore());
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
  });

  it('setAuth çağrısından sonra isAuthenticated true olmalı', () => {
    const { result } = renderHook(() => useAuthStore());
    act(() => {
      result.current.setAuth({ id: 1, email: 'test@test.com' }, 'access-token-123', 'refresh-token-456');
    });
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.token).toBe('access-token-123');
    expect(result.current.refreshToken).toBe('refresh-token-456');
    expect(result.current.isGuest).toBe(false);
  });

  it('logout sonrası tüm auth state temizlenmeli', () => {
    const { result } = renderHook(() => useAuthStore());
    act(() => {
      result.current.setAuth({ id: 1, email: 'test@test.com' }, 'token', 'refresh');
    });
    act(() => {
      result.current.logout();
    });
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.token).toBeNull();
    expect(result.current.refreshToken).toBeNull();
    expect(result.current.user).toBeNull();
    expect(result.current.isGuest).toBe(true);
  });

  it('logout localStorage temizlemeli', () => {
    localStorage.setItem('pivotradar_auth', JSON.stringify({ token: 'x' }));
    const { result } = renderHook(() => useAuthStore());
    act(() => {
      result.current.logout();
    });
    expect(localStorage.getItem('pivotradar_auth')).toBeNull();
  });

  it('setAuth isAuthResolved=true yapmalı', () => {
    const { result } = renderHook(() => useAuthStore());
    act(() => {
      result.current.setAuth({ id: 1 }, 'tok', null);
    });
    expect(result.current.isAuthResolved).toBe(true);
  });

  it('refreshToken yokken performRefresh null dönmeli', async () => {
    const { result } = renderHook(() => useAuthStore());
    let val;
    await act(async () => {
      val = await result.current.performRefresh();
    });
    expect(val).toBeNull();
  });

  it('fetchUser token yokken isAuthResolved=true yapmalı', async () => {
    const { result } = renderHook(() => useAuthStore());
    await act(async () => {
      await result.current.fetchUser();
    });
    expect(result.current.isAuthResolved).toBe(true);
  });

  it('fetchUser başarılı yanıtta user set edilmeli', async () => {
    const mockUser = { id: 5, email: 'user@test.com' };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockUser,
    });
    const { result } = renderHook(() => useAuthStore());
    act(() => {
      result.current.setAuth(null, 'valid-token', 'ref');
    });
    await act(async () => {
      await result.current.fetchUser();
    });
    expect(result.current.user).toEqual(mockUser);
  });

  it('fetchUser 401 yanıtında logout tetiklemeli (refresh başarısız)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    });
    const { result } = renderHook(() => useAuthStore());
    act(() => {
      result.current.setAuth(null, 'expired-token', null);
    });
    await act(async () => {
      await result.current.fetchUser();
    });
    expect(result.current.isAuthenticated).toBe(false);
  });
});
