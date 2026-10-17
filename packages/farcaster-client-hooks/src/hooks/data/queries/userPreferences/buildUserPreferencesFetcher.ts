import { FarcasterApiClient } from 'farcaster-client-data';

import { protocolUserPreferences } from '../../../../protocol/api';
import { protocolReplacesHostedAuth } from '../../../../protocol/runtime';

const buildUserPreferencesFetcher =
  ({ apiClient }: { apiClient: FarcasterApiClient }) =>
  async () => {
    if (protocolReplacesHostedAuth(apiClient)) {
      return protocolUserPreferences();
    }
    const response = await apiClient.getUserPreferences();
    return response.data;
  };

export { buildUserPreferencesFetcher };
