import {
  DEFAULT_TIMEOUT_UNSEEN,
  FarcasterApiClient,
} from 'farcaster-client-data';

import { protocolReplacesHostedAuth } from '../../../../protocol/runtime';

const buildUnseenFetcher =
  ({ apiClient }: { apiClient: FarcasterApiClient }) =>
  async (
    { timeout }: { timeout?: number } = { timeout: DEFAULT_TIMEOUT_UNSEEN },
  ) => {
    if (protocolReplacesHostedAuth(apiClient)) {
      return {
        result: {
          notificationsCount: 0,
          notificationTabs: [],
          inboxCount: 0,
          channelFeeds: [],
          warpTransactionCount: 0,
          articlesCount: 0,
        },
      };
    }
    const response = await apiClient.getUnseen({ timeout });
    return response.data;
  };

export { buildUnseenFetcher };
