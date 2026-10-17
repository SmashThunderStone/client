import { useCallback } from 'react';

import { markProtocolNotificationsSeen } from '../../../protocol/api';
import {
  protocolReplacesHostedAuth,
  protocolSession,
} from '../../../protocol/runtime';
import { useFarcasterApiClient } from '../../../providers/FarcasterApiClientProvider';

const useSetLastCheckedTimestamp = () => {
  const { apiClient } = useFarcasterApiClient();

  return useCallback(() => {
    if (protocolReplacesHostedAuth(apiClient)) {
      const session = protocolSession();
      if (session) {
        markProtocolNotificationsSeen(session.fid);
      }
      return Promise.resolve();
    }
    return apiClient.setLastCheckedTimestamp();
  }, [apiClient]);
};

export { useSetLastCheckedTimestamp };
