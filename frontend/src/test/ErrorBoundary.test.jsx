// frontend/src/test/ErrorBoundary.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import ErrorBoundary from '../shared/components/ErrorBoundary';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

function ThrowingChild({ shouldThrow }) {
  if (shouldThrow) throw new Error('Test error mesajı');
  return <div>Çalışıyor</div>;
}

describe('ErrorBoundary', () => {
  it('hata olmadan children render edilmeli', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Çalışıyor')).toBeTruthy();
  });

  it('hata olunca kurtarma modu gösterilmeli', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('SİSTEM KURTARMA MODU')).toBeTruthy();
  });

  it('hata mesajı UI\'da görünmeli', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText(/Test error mesajı/i)).toBeTruthy();
  });

  it('yeniden yükle butonu mevcut olmalı', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('SİSTEMİ YENİDEN YÜKLE')).toBeTruthy();
  });
});
