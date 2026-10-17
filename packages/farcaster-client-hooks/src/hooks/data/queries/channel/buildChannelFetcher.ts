import { FarcasterApiClient } from 'farcaster-client-data';

import { protocolChannelPlaceholder } from '../../../../protocol/api';
import { protocolReplacesHostedAuth } from '../../../../protocol/runtime';
import { MergeIntoGloballyCachedChannel } from '../../../../types';

const buildChannelFetcher =
  ({
    apiClient,
    key,
    mergeIntoGloballyCachedChannel,
  }: {
    apiClient: FarcasterApiClient;
    key: string;
    mergeIntoGloballyCachedChannel: MergeIntoGloballyCachedChannel;
  }) =>
  async () => {
    if (protocolReplacesHostedAuth(apiClient)) {
      const channel = protocolChannelPlaceholder(key);
      mergeIntoGloballyCachedChannel({ updates: channel });
      return channel;
    }
    const response = await apiClient.getChannel({ key });

    // Returning the same value as the one stored in the global cache so that
    // getChannelFromGlobalCache works seamlessly
    mergeIntoGloballyCachedChannel({ updates: response.data.result.channel });
    return response.data.result.channel;
  };

export { buildChannelFetcher };
