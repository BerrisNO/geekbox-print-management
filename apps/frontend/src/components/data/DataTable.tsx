import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { useRef, useState } from 'react';
import { cn } from '../../lib/cn';
import { ErrorState, Skeleton } from '../ui/misc';

interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  empty?: React.ReactNode;
  /** Enable row virtualization for large datasets (jobs/ledger/spools). */
  virtualize?: boolean;
  estimateRowHeight?: number;
  getRowId?: (row: T) => string;
}

/**
 * DataTable organism (spec §7.1): TanStack Table + react-virtual, sortable
 * headers (buttons with aria-sort), loading/error/empty slots, virtualized rows.
 */
export function DataTable<T>({
  columns,
  data,
  isLoading,
  isError,
  onRetry,
  onRowClick,
  empty,
  virtualize = false,
  estimateRowHeight = 44,
  getRowId,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const table = useReactTable({
    data: data ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId,
  });

  const rows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateRowHeight,
    overscan: 12,
    enabled: virtualize,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    );
  }
  if (isError) return <ErrorState onRetry={onRetry} />;
  if (!data || data.length === 0) {
    // biome-ignore lint/complexity/noUselessFragments: coerces the ReactNode empty-state prop to a single JSX element for the return type
    return empty ? <>{empty}</> : null;
  }

  const virtualRows = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div ref={scrollRef} className={cn('w-full overflow-auto', virtualize && 'max-h-[70vh]')}>
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-[10] bg-[var(--color-surface-muted)]">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const dir = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={
                        dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'
                      }
                      className="border-b border-border px-3 py-2.5 text-left font-medium text-muted-foreground"
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 hover:text-foreground"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {dir === 'asc' ? (
                            <ArrowUp className="size-3" aria-hidden />
                          ) : dir === 'desc' ? (
                            <ArrowDown className="size-3" aria-hidden />
                          ) : (
                            <ChevronsUpDown className="size-3 opacity-40" aria-hidden />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody style={virtualize ? { height: totalSize, position: 'relative' } : undefined}>
            {(virtualize ? virtualRows : rows.map((_, i) => ({ index: i, start: 0 }))).map(
              (vRow) => {
                const row = rows[vRow.index];
                if (!row) return null;
                return (
                  <tr
                    key={row.id}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    className={cn(
                      'border-b border-border transition-colors hover:bg-[var(--table-row-hover,var(--color-surface-muted))]',
                      onRowClick && 'cursor-pointer',
                    )}
                    style={
                      virtualize
                        ? {
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            display: 'flex',
                            transform: `translateY(${vRow.start}px)`,
                          }
                        : undefined
                    }
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={cn('px-3 py-2.5 align-middle', virtualize && 'flex-1')}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              },
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
