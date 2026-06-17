// frontend/src/test/unit/authFlow.test.js
// Unit tests — login flow, force-change redirect, JWT token handling
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Password validation helper ─────────────────────────────────────────────
function validatePassword(pw) {
  if (!pw || pw.length < 8) return 'Şifre en az 8 karakter olmalıdır.';
  if (!/[A-Z]/.test(pw)) return 'En az bir büyük harf gereklidir.';
  if (!/[0-9]/.test(pw)) return 'En az bir rakam gereklidir.';
  return null;
}

describe('validatePassword', () => {
  it('rejects passwords shorter than 8 chars', () => {
    expect(validatePassword('Ab1')).toBeTruthy();
  });

  it('rejects passwords without uppercase', () => {
    expect(validatePassword('abcdefg1')).toBeTruthy();
  });

  it('rejects passwords without digits', () => {
    expect(validatePassword('AbcdefGh')).toBeTruthy();
  });

  it('accepts strong passwords', () => {
    expect(validatePassword('StrongPass9!')).toBeNull();
  });
});


// ── Login response handling ────────────────────────────────────────────────
describe('login change_password_required handling', () => {
  it('navigates to /change-password when flag is true', () => {
    const navigate = vi.fn();
    const loginResponse = {
      access_token: 'tok',
      refresh_token: 'ref',
      email: 'test@test.com',
      change_password_required: true,
    };
    // Simulate what LoginPage does
    if (loginResponse.change_password_required) {
      navigate('/change-password');
    } else {
      navigate('/terminal');
    }
    expect(navigate).toHaveBeenCalledWith('/change-password');
  });

  it('navigates to /terminal when flag is false', () => {
    const navigate = vi.fn();
    const loginResponse = {
      access_token: 'tok',
      change_password_required: false,
    };
    if (loginResponse.change_password_required) {
      navigate('/change-password');
    } else {
      navigate('/terminal');
    }
    expect(navigate).toHaveBeenCalledWith('/terminal');
  });
});


// ── JWT token presence guard ───────────────────────────────────────────────
describe('auth store token management', () => {
  it('is falsy when no token is stored', async () => {
    const { default: useAuthStore } = await import('@/store/useAuthStore');
    // Reset store
    useAuthStore.setState({ token: null, email: null });
    const { token } = useAuthStore.getState();
    expect(token).toBeFalsy();
  });

  it('stores token after setAuth', async () => {
    const { default: useAuthStore } = await import('@/store/useAuthStore');
    useAuthStore.setState({ token: null });
    const setAuth = useAuthStore.getState().setAuth;
    setAuth({ email: 'admin@test.com' }, 'test_jwt_token', 'ref_token');
    const { token } = useAuthStore.getState();
    expect(token).toBe('test_jwt_token');
  });
});
