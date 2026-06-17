/**
 * useFeatureFlags — fetches system feature flags from /api/features
 * Falls back to all-enabled defaults if the request fails.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/core/api/client';

const DEFAULTS = {
  ticker_bar_enabled: true,
  scanner_enabled: true,
  backtest_enabled: true,
  strategy_enabled: true,
  logs_enabled: true,
  help_enabled: true,
  registration_enabled: true,
  maintenance_mode: false,
};

export function useFeatureFlags() {
  const { data } = useQuery({
    queryKey: ['feature-flags'],
    queryFn: () => api.features(),
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
    // On error, return defaults — feature flag failure must not break the UI
    onError: () => {},
  });
  return { ...(DEFAULTS), ...(data || {}) };
}

export default useFeatureFlags;
