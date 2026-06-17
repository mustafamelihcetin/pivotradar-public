import React, { useState, useMemo } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { 
  ChevronUp, 
  ChevronDown, 
  ChevronsUpDown,
  Search,
  Filter,
  ArrowRight
} from 'lucide-react';
import { cn } from '@/shared/utils/cn';

export function DataTable({ 
  columns, 
  data, 
  isLoading,
  onRowClick,
  searchPlaceholder = "Ara..."
}) {
  const [sorting, setSorting] = useState([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-20 bg-surface-variant/20 animate-pulse rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search & Meta */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-96 group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/40 group-focus-within:text-primary transition-colors" size={16} />
          <input
            value={globalFilter ?? ''}
            onChange={e => setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full bg-surface-variant/30 border-outline-variant/10 rounded-2xl pl-10 pr-4 py-2.5 text-sm focus:ring-primary/20 transition-all placeholder:text-on-surface-variant/40"
          />
        </div>
        <div className="flex items-center gap-2 text-xs font-bold text-on-surface-variant/60 uppercase tracking-widest pl-2">
          <Filter size={14} />
          <span>{table.getRowModel().rows.length} KALEM</span>
        </div>
      </div>

      {/* Responsive Wrapper */}
      <div className="rounded-3xl border border-outline-variant/10 bg-surface/50 overflow-hidden shadow-2xl backdrop-blur-sm">
        
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id} className="border-b border-outline-variant/10 bg-surface-variant/10">
                  {headerGroup.headers.map(header => (
                    <th 
                      key={header.id}
                      className="px-6 py-4 font-headline font-bold text-on-surface-variant/80 uppercase tracking-wider select-none cursor-pointer hover:bg-surface-variant/20 transition-colors group"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-center gap-2">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <span className="text-on-surface-variant/20 group-hover:text-primary transition-colors">
                          {{
                            asc: <ChevronUp size={14} />,
                            desc: <ChevronDown size={14} />,
                          }[header.column.getIsSorted()] ?? <ChevronsUpDown size={14} />}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-outline-variant/5">
              {table.getRowModel().rows.map(row => (
                <tr 
                  key={row.id}
                  onClick={() => onRowClick?.(row.original)}
                  className={cn(
                    "group transition-all duration-200",
                    onRowClick ? "hover:bg-primary/5 cursor-pointer" : "hover:bg-surface-variant/10"
                  )}
                >
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-6 py-5 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-outline-variant/10">
          {table.getRowModel().rows.map(row => (
            <div 
              key={row.id}
              onClick={() => onRowClick?.(row.original)}
              className="p-6 space-y-4 active:bg-primary/5 touch-manipulation"
            >
              <div className="flex justify-between items-start">
                 {/* Mobile Card Header using first column if possible */}
                 <div className="font-bold text-lg">
                    {flexRender(row.getVisibleCells()[0].column.columnDef.cell, row.getVisibleCells()[0].getContext())}
                 </div>
                 <ArrowRight size={16} className="text-primary/40" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                {row.getVisibleCells().slice(1).map(cell => (
                  <div key={cell.id} className="space-y-1">
                    <p className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest">
                       {cell.column.columnDef.header}
                    </p>
                    <div className="text-sm font-medium">
                       {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Empty State */}
        {table.getRowModel().rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
             <div className="w-16 h-16 rounded-3xl bg-surface-variant/30 flex items-center justify-center mb-4">
                <Search size={32} className="text-on-surface-variant/20" />
             </div>
             <p className="text-lg font-bold">Veri Bulunamadı</p>
             <p className="text-sm text-on-surface-variant/60">Arama kriterlerinize uygun sonuç bulunamadı.</p>
          </div>
        )}
      </div>
    </div>
  );
}
