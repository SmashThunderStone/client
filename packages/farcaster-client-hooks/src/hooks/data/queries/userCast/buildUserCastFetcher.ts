import { CastHashPrefix, FarcasterApiClient } from 'farcaster-client-data';

import { protocolThread } from '../../../../protocol/api';
import { protocolReplacesHostedAuth } from '../../../../protocol/runtime';
import { MergeIntoGloballyCachedCast } from '../../../../types';
import { wrapPaginatedFetcher } from '../../helpers';

const buildUserCastFetcher = ({
  apiClient,
  mergeIntoGloballyCachedCast,
  hashPrefix,
  username,
}: {
  apiClient: FarcasterApiClient;
  mergeIntoGloballyCachedCast: MergeIntoGloballyCachedCast;
  hashPrefix: CastHashPrefix;
  username: string;
}) =>
  wrapPaginatedFetcher(async () => {
    if (protocolReplacesHostedAuth(apiClient)) {
      const thread = await protocolThread({ username, hashPrefix });
      const cast = thread.result.casts[0];
      if (cast) {
        mergeIntoGloballyCachedCast({ updates: cast });
      }
      return { result: { cast } };
    }
    const response = await apiClient.getUserCast({
      username,
      hashPrefix,
    });

    // Populate the cast cache in addition to this specific query cache
    mergeIntoGloballyCachedCast({
      updates: response.data.result.cast,
    });

    return response.data;
  });

export { buildUserCastFetcher };
