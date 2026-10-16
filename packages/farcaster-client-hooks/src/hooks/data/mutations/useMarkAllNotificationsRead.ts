import { useCallback } from 'react';

import { protocolReplacesHostedAuth } from '../../../protocol/runtime';
import { useFarcasterApiClient } from '../../../providers/FarcasterApiClientProvider';

const useMarkAllNotificationsRead = () => {
  const { apiClient } = useFarcasterApiClient();

  return useCallback(() => {
    if (protocolReplacesHostedAuth(apiClient)) {
      return Promise.resolve();
    }
    return apiClient.markAllNotificationsRead();
  }, [apiClient]);
};

export { useMarkAllNotificationsRead };
