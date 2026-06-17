// frontend/src/test/unit/cn.test.js
import { describe, it, expect } from 'vitest';
import { cn } from '../../shared/utils/cn';

describe('cn utility', () => {
  it('should merge class names', () => {
    expect(cn('class1', 'class2')).toBe('class1 class2');
  });

  it('should handle conditional classes', () => {
    expect(cn('base', true && 'active', false && 'hidden')).toBe('base active');
  });

  it('should handle tailwind conflicts (via tailwind-merge if integrated)', () => {
    // If cn uses tailwind-merge, 'p-2 p-4' should become 'p-4'
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('should handle undefined and null', () => {
    expect(cn('base', undefined, null, 'end')).toBe('base end');
  });
});
