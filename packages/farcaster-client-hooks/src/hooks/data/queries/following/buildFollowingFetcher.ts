import { FarcasterApiClient } from 'farcaster-client-data';

import { protocolFollowing } from '../../../../protocol/api';
import { protocolHubUrl } from '../../../../protocol/runtime';
import { BatchMergeIntoGloballyCachedUsers } from '../../../../types';
import { wrapPaginatedFetcher } from '../../helpers';

const buildFollowingFetcher = ({
  apiClient,
  batchMergeIntoGloballyCachedUsers,
  fid,
}: {
  apiClient: FarcasterApiClient;
  batchMergeIntoGloballyCachedUsers: BatchMergeIntoGloballyCachedUsers;
  fid: number;
}) =>
  wrapPaginatedFetcher(async ({ pageParam: cursor }) => {
    if (protocolHubUrl()) {
      const response = await protocolFollowing({
        fid,
        cursor: typeof cursor === 'string' ? cursor : undefined,
      });
      batchMergeIntoGloballyCachedUsers({
        batchUpdates: response.result.users,
      });
      return response;
    }
    const response = await apiClient.getFollowing({ cursor, fid, limit: 50 });

    batchMergeIntoGloballyCachedUsers({
      batchUpdates: response.data.result.users,
    });

    return response.data;
  });

export { buildFollowingFetcher };
