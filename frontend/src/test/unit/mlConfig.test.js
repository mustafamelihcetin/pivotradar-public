// frontend/src/test/unit/mlConfig.test.js
// Unit tests — ML config form helpers and admin API client
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Helpers ───────────────────────────────────────────────────────────────────
function validateMlConfig(cfg) {
  const errors = [];
  if (cfg.min_samples < 5)  errors.push('min_samples too small (min 5)');
  if (cfg.calib_window_days < 30) errors.push('calib_window_days too small (min 30)');
  if (cfg.half_life_days < 1) errors.push('half_life_days must be >= 1');
  if (cfg.w_rule + cfg.w_ml < 0.99 || cfg.w_rule + cfg.w_ml > 1.01)
    errors.push('w_rule + w_ml must equal 1.0');
  const { soft_weights } = cfg;
  if (soft_weights) {
    for (const [k, v] of Object.entries(soft_weights)) {
      if (v < 0 || v > 1) errors.push(`soft_weights.${k} out of [0,1]`);
    }
    if ((soft_weights.near_miss ?? 0) >= (soft_weights.target_hit ?? 1))
      errors.push('near_miss weight should be < target_hit weight');
  }
  return errors;
}

describe('validateMlConfig', () => {
  const VALID_CONFIG = {
    min_samples: 30,
    calib_window_days: 150,
    half_life_days: 45,
    soft_weights: { target_hit: 1.0, near_miss: 0.8, partial: 0.4, miss: 0.0 },
    w_rule: 0.6,
    w_ml: 0.4,
  };

  it('accepts a valid config', () => {
    expect(validateMlConfig(VALID_CONFIG)).toHaveLength(0);
  });

  it('rejects min_samples < 5', () => {
    const errors = validateMlConfig({ ...VALID_CONFIG, min_samples: 3 });
    expect(errors.some(e => e.includes('min_samples'))).toBe(true);
  });

  it('rejects weights not summing to 1', () => {
    const errors = validateMlConfig({ ...VALID_CONFIG, w_rule: 0.7, w_ml: 0.7 });
    expect(errors.some(e => e.includes('w_rule'))).toBe(true);
  });

  it('rejects soft_weight out of [0,1]', () => {
    const errors = validateMlConfig({
      ...VALID_CONFIG,
      soft_weights: { ...VALID_CONFIG.soft_weights, near_miss: 1.5 },
    });
    expect(errors.some(e => e.includes('near_miss'))).toBe(true);
  });

  it('rejects near_miss >= target_hit', () => {
    const errors = validateMlConfig({
      ...VALID_CONFIG,
      soft_weights: { ...VALID_CONFIG.soft_weights, near_miss: 1.0, target_hit: 0.9 },
    });
    expect(errors.some(e => e.includes('near_miss'))).toBe(true);
  });
});


// ── API client contract ───────────────────────────────────────────────────────
describe('api.admin model-status contract', () => {
  it('getCalibrationModelStatus resolves to object with global + profiles', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ global: { exists: true }, profiles: {} }),
    });
    globalThis.fetch = mockFetch;

    // Import the actual api client
    const { api } = await import('@/core/api/client');
    const result = await api.admin.getCalibrationModelStatus();

    expect(result).toHaveProperty('global');
    expect(result).toHaveProperty('profiles');
    expect(typeof result.global.exists).toBe('boolean');
  });
});
