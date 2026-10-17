import { FarcasterApiClient } from 'farcaster-client-data';

import { protocolReplacesHostedAuth } from '../../../../protocol/runtime';
import { BatchMergeIntoGloballyCachedCasts } from '../../../../types';
import { wrapPaginatedFetcher } from '../../helpers';

const buildUserThreadHiddenRepliesFetcher = ({
  apiClient,
  focusedCastHash,
  batchMergeIntoGloballyCachedCasts,
}: {
  apiClient: FarcasterApiClient;
  focusedCastHash: string;
  batchMergeIntoGloballyCachedCasts: BatchMergeIntoGloballyCachedCasts;
}) =>
  wrapPaginatedFetcher(async ({ pageParam: cursor }) => {
    if (protocolReplacesHostedAuth(apiClient)) {
      return { result: { casts: [] } };
    }
    const response = await apiClient.getUserThreadHiddenReplies({
      focusedCastHash,
      cursor,
      limit: 15,
    });

    // Populate the cast cache in addition to this specific query cache
    batchMergeIntoGloballyCachedCasts({
      batchUpdates: response.data.result.casts,
    });

    return response.data;
  });

export { buildUserThreadHiddenRepliesFetcher };
