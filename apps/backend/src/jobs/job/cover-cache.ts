import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { and, eq, isNotNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { printJob } from '../../db/schema/jobs.js';
import type { Logger } from '../../shared/logger.js';

/**
 * Downloads and serves Bambu task cover images. The app CSP blocks external images
 * (imgSrc 'self'), and Bambu's cover URLs are signed and expire — so each cover is
 * fetched once into {coversDir}/{jobId} and served same-origin. Best-effort: a
 * failed download just leaves cover_cached=0 and is retried on the next sync.
 */
export class CoverCache {
  constructor(
    private readonly db: Db,
    private readonly coversDir: string,
    private readonly log: Logger,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  filePath(jobId: string): string {
    return join(this.coversDir, jobId);
  }

  async ensureDir(): Promise<void> {
    await mkdir(this.coversDir, { recursive: true });
  }

  /** Read a cached cover with its sniffed content-type, or null when absent. */
  async read(jobId: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    const path = this.filePath(jobId);
    if (!existsSync(path)) return null;
    const buffer = await readFile(path);
    return { buffer, contentType: sniffImageType(buffer) };
  }

  /**
   * Fetch and cache every job that has a cover URL but no cached file yet.
   * Returns the number newly cached. Never throws — errors are logged per-job.
   */
  async cacheMissing(): Promise<number> {
    await this.ensureDir();
    const rows = this.db
      .select({ id: printJob.id, coverUrl: printJob.coverUrl })
      .from(printJob)
      .where(and(isNotNull(printJob.coverUrl), eq(printJob.coverCached, 0)))
      .all();

    let cached = 0;
    for (const row of rows) {
      if (!row.coverUrl) continue;
      try {
        const res = await this.fetchFn(row.coverUrl);
        if (!res.ok) continue;
        const buffer = Buffer.from(await res.arrayBuffer());
        if (buffer.length === 0) continue;
        await writeFile(this.filePath(row.id), buffer);
        this.db.update(printJob).set({ coverCached: 1 }).where(eq(printJob.id, row.id)).run();
        cached += 1;
      } catch (err) {
        this.log.warn({ err, jobId: row.id }, 'cover cache fetch failed');
      }
    }
    return cached;
  }
}

/** Sniff a common image content-type from magic bytes; defaults to image/png. */
function sniffImageType(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return 'image/png';
}
