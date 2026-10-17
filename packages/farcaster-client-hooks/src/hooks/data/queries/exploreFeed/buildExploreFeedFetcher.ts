import { FarcasterApiClient } from 'farcaster-client-data';

import { protocolReplacesHostedAuth } from '../../../../protocol/runtime';

const buildExploreFeedFetcher =
  ({ apiClient }: { apiClient: FarcasterApiClient }) =>
  async () => {
    if (protocolReplacesHostedAuth(apiClient)) {
      return { feed: { farcasterCoins: [] } };
    }
    const response = await apiClient.getExploreFeed();

    return response.data.result;
  };

export { buildExploreFeedFetcher };
