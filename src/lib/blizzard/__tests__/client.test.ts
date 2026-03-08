import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { BlizzardClient, BlizzardApiError, TokenExpiredError } from '../client';

const testSchema = z.object({ id: z.number(), name: z.string() });

describe('BlizzardClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches and parses data with Zod schema', async () => {
    const mockResponse = new Response(JSON.stringify({ id: 1, name: 'Test' }), {
      status: 200,
      headers: { 'Last-Modified': 'Thu, 01 Jan 2026 00:00:00 GMT' },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    const client = new BlizzardClient('test-token', 'us');
    const result = await client.fetch('/test', testSchema);

    expect(result.data).toEqual({ id: 1, name: 'Test' });
    expect(result.lastModified).toBe('Thu, 01 Jan 2026 00:00:00 GMT');
    expect(result.notModified).toBe(false);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://us.api.blizzard.com/test?namespace=profile-us',
      { headers: { Authorization: 'Bearer test-token' } },
    );
  });

  it('sends If-Modified-Since header when provided', async () => {
    const mockResponse = new Response(JSON.stringify({ id: 1, name: 'Test' }), {
      status: 200,
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    const client = new BlizzardClient('token', 'eu');
    await client.fetch('/test', testSchema, 'Thu, 01 Jan 2026 00:00:00 GMT');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://eu.api.blizzard.com/test?namespace=profile-eu',
      {
        headers: {
          Authorization: 'Bearer token',
          'If-Modified-Since': 'Thu, 01 Jan 2026 00:00:00 GMT',
        },
      },
    );
  });

  it('handles 304 Not Modified', async () => {
    const mockResponse = new Response(null, { status: 304 });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    const client = new BlizzardClient('token', 'us');
    const result = await client.fetch(
      '/test',
      testSchema,
      'Thu, 01 Jan 2026 00:00:00 GMT',
    );

    expect(result.data).toBeNull();
    expect(result.notModified).toBe(true);
    expect(result.lastModified).toBe('Thu, 01 Jan 2026 00:00:00 GMT');
  });

  it('throws TokenExpiredError on 401', async () => {
    const mockResponse = new Response('Unauthorized', { status: 401 });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    const client = new BlizzardClient('expired-token', 'us');
    await expect(client.fetch('/test', testSchema)).rejects.toThrow(
      TokenExpiredError,
    );
  });

  it('throws BlizzardApiError on other errors', async () => {
    const mockResponse = new Response('Not Found', { status: 404 });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    const client = new BlizzardClient('token', 'us');
    await expect(client.fetch('/test', testSchema)).rejects.toThrow(
      BlizzardApiError,
    );
  });

  it('throws on Zod validation failure', async () => {
    const mockResponse = new Response(JSON.stringify({ invalid: true }), {
      status: 200,
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    const client = new BlizzardClient('token', 'us');
    await expect(client.fetch('/test', testSchema)).rejects.toThrow();
  });

  it('uses correct API host for each region', async () => {
    const regions = ['us', 'eu', 'kr', 'tw'] as const;
    const expectedHosts = {
      us: 'https://us.api.blizzard.com',
      eu: 'https://eu.api.blizzard.com',
      kr: 'https://kr.api.blizzard.com',
      tw: 'https://tw.api.blizzard.com',
    };

    for (const region of regions) {
      const mockResponse = new Response(
        JSON.stringify({ id: 1, name: 'Test' }),
        { status: 200 },
      );
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

      const client = new BlizzardClient('token', region);
      await client.fetch('/path', testSchema);

      expect(globalThis.fetch).toHaveBeenLastCalledWith(
        `${expectedHosts[region]}/path?namespace=profile-${region}`,
        expect.any(Object),
      );
    }
  });
});
