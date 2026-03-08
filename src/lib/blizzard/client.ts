import type { z } from 'zod';
import type { Region } from '~/lib/activities/resets';

const API_HOSTS: Record<Region, string> = {
  us: 'https://us.api.blizzard.com',
  eu: 'https://eu.api.blizzard.com',
  kr: 'https://kr.api.blizzard.com',
  tw: 'https://tw.api.blizzard.com',
};

export class BlizzardClient {
  constructor(
    private accessToken: string,
    private region: Region,
  ) {}

  async fetch<T>(
    path: string,
    schema: z.ZodType<T>,
    ifModifiedSince?: string,
  ): Promise<{
    data: T | null;
    lastModified: string | null;
    notModified: boolean;
  }> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
    };
    if (ifModifiedSince) {
      headers['If-Modified-Since'] = ifModifiedSince;
    }

    const separator = path.includes('?') ? '&' : '?';
    const url = `${API_HOSTS[this.region]}${path}${separator}namespace=profile-${this.region}`;
    const res = await globalThis.fetch(url, { headers });

    if (res.status === 304) {
      return { data: null, lastModified: ifModifiedSince ?? null, notModified: true };
    }

    if (res.status === 401) {
      throw new TokenExpiredError();
    }

    if (!res.ok) {
      throw new BlizzardApiError(res.status, await res.text());
    }

    const json = await res.json();
    const data = schema.parse(json);
    return {
      data,
      lastModified: res.headers.get('Last-Modified'),
      notModified: false,
    };
  }
}

export class BlizzardApiError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`Blizzard API ${status}: ${body}`);
  }
}

export class TokenExpiredError extends Error {
  constructor() {
    super('Access token expired');
  }
}
