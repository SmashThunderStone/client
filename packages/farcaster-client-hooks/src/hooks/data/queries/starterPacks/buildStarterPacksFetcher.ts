import { FarcasterApiClient } from 'farcaster-client-data';

import { protocolReplacesHostedAuth } from '../../../../protocol/runtime';
import { wrapPaginatedFetcher } from '../../helpers';

const buildStarterPacksFetcher = ({
  apiClient,
  fid,
}: {
  apiClient: FarcasterApiClient;
  fid: number;
}) =>
  wrapPaginatedFetcher(async ({ pageParam: cursor }) => {
    if (protocolReplacesHostedAuth(apiClient)) {
      return { result: { starterPacks: [] } };
    }
    const response = await apiClient.getStarterPacks({
      fid,
      cursor,
      limit: 15,
    });
    return response.data;
  });

export { buildStarterPacksFetcher };
