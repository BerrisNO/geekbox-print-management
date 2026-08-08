import { useSearch } from '@tanstack/react-router';
import { ArrowLeft, Printer } from 'lucide-react';
import { useMemo } from 'react';
import { useSpools } from '../api/hooks';
import { SpoolLabel } from '../components/print/SpoolLabel';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/misc';

const PRINT_CSS = `
@media print {
  @page { margin: 8mm; }
  .no-print { display: none !important; }
  body { background: #fff !important; }
}
`;

/**
 * Chrome-less print page. Reads `ids` (comma-separated) + optional `copies`
 * from the search params, resolves the matching spools and lays them out as
 * printable 85x20mm labels that flow across A4 pages. Renders WITHOUT AppShell.
 */
export function PrintLabelsPage() {
  const { ids, copies } = useSearch({ from: '/print/labels' });
  // Backend list endpoint returns every spool (incl. archived) when unfiltered.
  const spools = useSpools();

  const requestedIds = useMemo(
    () =>
      ids
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    [ids],
  );

  const labels = useMemo(() => {
    if (!spools.data) return [];
    const byId = new Map(spools.data.map((s) => [s.id, s]));
    const out = [];
    for (const id of requestedIds) {
      const spool = byId.get(id);
      if (!spool) continue;
      for (let i = 0; i < copies; i++) out.push(spool);
    }
    return out;
  }, [spools.data, requestedIds, copies]);

  return (
    <div style={{ minHeight: '100vh' }} className="bg-gray-100 text-foreground">
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static print stylesheet */}
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-background px-4 py-3">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden /> Back
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {labels.length} {labels.length === 1 ? 'label' : 'labels'}
          </span>
          <Button onClick={() => window.print()} disabled={labels.length === 0}>
            <Printer className="size-4" aria-hidden /> Print / Save as PDF
          </Button>
        </div>
      </div>

      <div className="p-4">
        {spools.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : requestedIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">No spools requested.</p>
        ) : labels.length === 0 ? (
          <p className="text-sm text-muted-foreground">No matching spools found.</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4mm' }}>
            {labels.map((spool, i) => (
              <SpoolLabel key={`${spool.id}-${i}`} spool={spool} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
