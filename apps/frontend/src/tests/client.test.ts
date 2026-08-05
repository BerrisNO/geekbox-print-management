import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../api/client';

describe('api client — RFC 7807 parsing', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses problem+json into a typed ApiError with field errors', async () => {
    // Fresh Response per call — a Response body can only be read once.
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            type: 'about:blank',
            title: 'Validation failed',
            status: 400,
            code: 'IMPLAUSIBLE_WEIGHT',
            errors: { initialNetWeightG: ['must be > 0'] },
          }),
          { status: 400, headers: { 'content-type': 'application/problem+json' } },
        ),
    );

    await expect(api.post('/spools', {})).rejects.toMatchObject({
      status: 400,
      code: 'IMPLAUSIBLE_WEIGHT',
    });

    try {
      await api.post('/spools', {});
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).fieldErrors.initialNetWeightG).toEqual(['must be > 0']);
    }
  });

  it('returns undefined for 204 responses', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    await expect(api.post('/auth/logout')).resolves.toBeUndefined();
  });

  it('serializes JSON body and sets credentials: include', async () => {
    const mock = fetch as unknown as ReturnType<typeof vi.fn>;
    mock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await api.post('/vendors', { name: 'Acme' });
    const call = mock.mock.calls[0]!;
    const init = call[1] as RequestInit;
    expect(init.credentials).toBe('include');
    expect(init.body).toBe(JSON.stringify({ name: 'Acme' }));
  });
});
