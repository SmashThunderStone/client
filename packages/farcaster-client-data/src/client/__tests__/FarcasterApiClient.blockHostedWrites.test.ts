import { FarcasterApiClient } from '../FarcasterApiClient';

describe('FarcasterApiClient hosted write guard', () => {
  it('does not send PUT /v2/cast-likes when hosted writes are blocked', async () => {
    const fetchMock = jest.fn();
    const client = new FarcasterApiClient({
      authToken: { secret: 'hosted-token', expiresAt: Date.now() + 60_000 },
      blockHostedWrites: true,
      getFetch: () => fetchMock as typeof fetch,
    });

    await expect(client.createCastLike({ castHash: '0xabc' })).rejects.toThrow(
      'not available in SmashCast yet',
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still sends likes when the protocol guard is off', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ result: { like: { hash: '0xlike' } } }),
      text: async () => '',
    });
    const client = new FarcasterApiClient({
      authToken: { secret: 'hosted-token', expiresAt: Date.now() + 60_000 },
      getFetch: () => fetchMock as typeof fetch,
    });

    await client.createCastLike({ castHash: '0xabc' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v2/cast-likes');
    expect(init.method).toBe('PUT');
  });
});
