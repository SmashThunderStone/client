import { FarcasterApiClient } from 'farcaster-client-data';

import { protocolReplacesHostedAuth } from '../../../../protocol/runtime';
import { BatchMergeIntoGloballyCachedUsers } from '../../../../types';
import { wrapPaginatedFetcher } from '../../helpers';

const buildFollowersYouKnowFetcher = ({
  apiClient,
  batchMergeIntoGloballyCachedUsers,
  fid,
  limit,
}: {
  apiClient: FarcasterApiClient;
  batchMergeIntoGloballyCachedUsers: BatchMergeIntoGloballyCachedUsers;
  fid: number;
  limit: number;
}) =>
  wrapPaginatedFetcher(async ({ pageParam: cursor }) => {
    if (protocolReplacesHostedAuth(apiClient)) {
      return { result: { users: [], totalCount: 0 } };
    }
    const response = await apiClient.getFollowersYouKnow({
      cursor,
      fid: fid,
      limit: limit,
    });

    batchMergeIntoGloballyCachedUsers({
      batchUpdates: response.data.result.users,
    });

    return response.data;
  });

export { buildFollowersYouKnowFetcher };
