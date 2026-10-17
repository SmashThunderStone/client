import { FarcasterApiClient } from 'farcaster-client-data';

import { protocolUserCasts } from '../../../../protocol/api';
import { protocolHubUrl } from '../../../../protocol/runtime';
import { BatchMergeIntoGloballyCachedCasts } from '../../../../types';
import { wrapPaginatedFetcher } from '../../helpers';

const buildUserCastsFetcher = ({
  apiClient,
  batchMergeIntoGloballyCachedCasts,
  fid,
}: {
  apiClient: FarcasterApiClient;
  batchMergeIntoGloballyCachedCasts: BatchMergeIntoGloballyCachedCasts;
  fid: number;
}) =>
  wrapPaginatedFetcher(async ({ pageParam: cursor }) => {
    if (protocolHubUrl()) {
      const response = await protocolUserCasts({
        fid,
        cursor: typeof cursor === 'string' ? cursor : undefined,
        replies: 'exclude',
      });
      batchMergeIntoGloballyCachedCasts({
        batchUpdates: response.result.casts,
      });
      return response;
    }
    const response = await apiClient.getUserCasts({
      cursor,
      fid,
      limit: 15,
    });

    // Populate the cast cache in addition to this specific query cache
    batchMergeIntoGloballyCachedCasts({
      batchUpdates: response.data.result.casts,
    });

    return response.data;
  });

export { buildUserCastsFetcher };
