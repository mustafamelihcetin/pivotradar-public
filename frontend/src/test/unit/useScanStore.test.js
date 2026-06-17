// frontend/src/test/unit/useScanStore.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { useScanStore } from '../../core/store/useScanStore';

describe('useScanStore', () => {
  beforeEach(() => {
    // Reset store manually if needed
    const { results, setResults } = useScanStore.getState();
    setResults([]);
  });

  it('should initialize with empty results', () => {
    const state = useScanStore.getState();
    expect(state.results).toEqual([]);
    expect(state.isLoading).toBe(false);
  });

  it('should update results', () => {
    const { setResults } = useScanStore.getState();
    const mockResults = [{ symbol: 'THYAO', qrs: 85 }];
    
    setResults(mockResults);
    
    const state = useScanStore.getState();
    expect(state.results).toEqual(mockResults);
  });

  it('should set loading state', () => {
    const { setIsLoading } = useScanStore.getState();
    setIsLoading(true);
    expect(useScanStore.getState().isLoading).toBe(true);
  });
});
