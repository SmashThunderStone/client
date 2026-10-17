import { FarcasterApiClient } from 'farcaster-client-data';

import { protocolReplacesHostedAuth } from '../../../../protocol/runtime';
import { BatchMergeIntoGloballyCachedChannels } from '../../../../types';

const buildHighlightedChannelsFetcher =
  ({
    apiClient,
    batchMergeIntoGloballyCachedChannels,
  }: {
    apiClient: FarcasterApiClient;
    batchMergeIntoGloballyCachedChannels: BatchMergeIntoGloballyCachedChannels;
  }) =>
  async () => {
    if (protocolReplacesHostedAuth(apiClient)) {
      return { channels: [], viewerContext: { defaultFeed: 'home' as const } };
    }
    const response = await apiClient.getHighlightedChannels();

    batchMergeIntoGloballyCachedChannels({
      batchUpdates: response.data.result.channels,
    });

    return response.data.result;
  };

export { buildHighlightedChannelsFetcher };
