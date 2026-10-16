import { FarcasterApiClient } from 'farcaster-client-data';

import { protocolReplacesHostedAuth } from '../../../../protocol/runtime';

const buildTrendingTopicsFetcher =
  ({ apiClient }: { apiClient: FarcasterApiClient }) =>
  async () => {
    if (protocolReplacesHostedAuth(apiClient)) {
      return { topics: [] };
    }
    const response = await apiClient.getTrendingTopics();

    return response.data.result;
  };

export { buildTrendingTopicsFetcher };
