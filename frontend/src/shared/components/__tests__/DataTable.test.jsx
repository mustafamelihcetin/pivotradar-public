import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { DataTable } from '../DataTable';

const columns = [
  { header: 'Sembol', accessorKey: 'symbol' },
  { header: 'Fiyat', accessorKey: 'price' },
];

const data = [
  { symbol: 'THYAO', price: 280.5 },
  { symbol: 'ASELS', price: 54.2 },
];

describe('DataTable Component', () => {
  it('renders table headers and data correctly', () => {
    render(<DataTable columns={columns} data={data} />);
    
    expect(screen.getByText('THYAO')).toBeInTheDocument();
    expect(screen.getByText('ASELS')).toBeInTheDocument();
    expect(screen.getByText('SHYAO')).not.toBeInTheDocument();
  });

  it('filters data based on search input', () => {
    render(<DataTable columns={columns} data={data} />);
    
    const searchInput = screen.getByPlaceholderText('Ara...');
    fireEvent.change(searchInput, { target: { value: 'THY' } });
    
    expect(screen.getByText('THYAO')).toBeInTheDocument();
    expect(screen.queryByText('ASELS')).not.toBeInTheDocument();
  });

  it('shows loading state skeletons', () => {
    const { container } = render(<DataTable columns={columns} data={[]} isLoading={true} />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });
});
