/**
 * publicWebsiteService — transient-failure handling.
 *
 * This read drives every owner-managed section of the public site. Two of those
 * sections (the homepage photo gallery, the contact-page FAQ) default to EMPTY
 * and render only when non-empty, so a read that gives up on its first failure
 * silently deletes them from the page. A 429 off the shared /api rate-limit
 * bucket was the trigger in production, which is why it looked like the gallery
 * vanished on sign-in: signed-in sessions exhaust that bucket, anonymous ones
 * do not.
 */

import { fetchPublicWebsite } from './publicWebsiteService';

const SETTINGS = { gallery: [{ id: 'g1', url: 'https://example.test/1.webp' }] };

const okResponse = () => ({ ok: true, status: 200, json: async () => ({ settings: SETTINGS }) });
const errResponse = (status) => ({ ok: false, status, json: async () => ({}) });

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
});

afterEach(() => {
  delete global.fetch;
});

describe('fetchPublicWebsite', () => {
  it('returns the settings on a first-try success', async () => {
    global.fetch.mockResolvedValue(okResponse());

    await expect(fetchPublicWebsite()).resolves.toEqual({ settings: SETTINGS });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries a 429 and succeeds — the gallery survives a throttled read', async () => {
    global.fetch.mockResolvedValueOnce(errResponse(429)).mockResolvedValue(okResponse());

    await expect(fetchPublicWebsite()).resolves.toEqual({ settings: SETTINGS });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('retries a 503 and a network error', async () => {
    global.fetch
      .mockResolvedValueOnce(errResponse(503))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(okResponse());

    await expect(fetchPublicWebsite()).resolves.toEqual({ settings: SETTINGS });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('gives up after the attempt budget and reports the last status', async () => {
    global.fetch.mockResolvedValue(errResponse(429));

    await expect(fetchPublicWebsite({ attempts: 2 })).rejects.toMatchObject({ status: 429 });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-transient status — a 404 is a real answer', async () => {
    global.fetch.mockResolvedValue(errResponse(404));

    await expect(fetchPublicWebsite()).rejects.toMatchObject({ status: 404 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
