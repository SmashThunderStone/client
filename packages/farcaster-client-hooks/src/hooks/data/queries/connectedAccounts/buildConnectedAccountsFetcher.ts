import { FarcasterApiClient } from 'farcaster-client-data';

import { protocolReplacesHostedAuth } from '../../../../protocol/runtime';
import { wrapPaginatedFetcher } from '../../helpers';

const buildConnectedAccountsFetcher = ({
  apiClient,
}: {
  apiClient: FarcasterApiClient;
}) =>
  wrapPaginatedFetcher(async ({ pageParam: cursor }) => {
    if (protocolReplacesHostedAuth(apiClient)) {
      return { result: { accounts: [] } };
    }
    const response = await apiClient.getConnectedAccounts({
      cursor,
      limit: 15,
    });
    return response.data;
  });

export { buildConnectedAccountsFetcher };
