import { FarcasterApiClient } from 'farcaster-client-data';

import { protocolUserAppContext } from '../../../../protocol/api';
import { protocolReplacesHostedAuth } from '../../../../protocol/runtime';

const buildUserAppContextFetcher =
  ({ apiClient }: { apiClient: FarcasterApiClient }) =>
  async () => {
    if (protocolReplacesHostedAuth(apiClient)) {
      return protocolUserAppContext();
    }
    const { data } = await apiClient.getUserAppContext();
    return data.result.context;
  };

export { buildUserAppContextFetcher };
