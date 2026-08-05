import { Download } from 'lucide-react';
import { useState } from 'react';
import { apiUrl } from '../../api/client';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';

/**
 * Backup download (NFR-RE-04). Streams a VACUUM INTO SQLite file.
 *
 * Uses a POST fetch (not a GET link) because creating a backup is a
 * state-changing, sensitive operation; a GET is CSRF-triggerable cross-site
 * (MR-002). The response blob is turned into a client-side download.
 */
export function BackupSettings() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function downloadBackup() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/backup'), {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/octet-stream' },
      });
      if (!res.ok) {
        throw new Error(`Backup failed (${res.status})`);
      }
      const disposition = res.headers.get('content-disposition') ?? '';
      const match = /filename="?([^"]+)"?/.exec(disposition);
      const filename = match?.[1] ?? 'geekbox-backup.sqlite';
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Backup failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Backup</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Download a consistent single-file backup of the entire database. This file is sensitive —
          it contains all inventory, jobs, and encrypted integration tokens. Store it securely.
        </p>
        <div>
          <Button type="button" variant="primary" onClick={downloadBackup} disabled={busy}>
            <Download aria-hidden /> {busy ? 'Preparing backup…' : 'Download backup'}
          </Button>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
