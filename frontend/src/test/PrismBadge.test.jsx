// frontend/src/test/PrismBadge.test.jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PrismBadge } from '../shared/components/PrismBadge';

describe('PrismBadge', () => {
  it('varsayılan varyant render edilmeli', () => {
    const { container } = render(<PrismBadge />);
    expect(container.firstChild).toBeTruthy();
  });

  it('small varyant "PRISM CORE" metnini içermeli', () => {
    render(<PrismBadge variant="small" />);
    expect(screen.getByText('PRISM CORE')).toBeTruthy();
  });

  it('default varyant "PRISM ENGINE" metnini içermeli', () => {
    render(<PrismBadge />);
    expect(screen.getByText('PRISM ENGINE')).toBeTruthy();
  });

  it('className prop aktarılmalı', () => {
    const { container } = render(<PrismBadge variant="small" className="test-class" />);
    expect(container.querySelector('.test-class')).toBeTruthy();
  });
});
