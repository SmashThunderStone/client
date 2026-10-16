import { FarcasterApiClient } from 'farcaster-client-data';

import { protocolUserByFid } from '../../../../protocol/api';
import { protocolReplacesHostedAuth } from '../../../../protocol/runtime';
import { MergeIntoGloballyCachedUser } from '../../../../types';

const buildUserByFidFetcher =
  ({
    apiClient,
    fid,
    mergeIntoGloballyCachedUser,
  }: {
    apiClient: FarcasterApiClient;
    fid: number;
    mergeIntoGloballyCachedUser: MergeIntoGloballyCachedUser;
  }) =>
  async () => {
    if (protocolReplacesHostedAuth(apiClient)) {
      const response = await protocolUserByFid(fid);
      if (!response) {
        throw new Error('Not available in SmashCast direct mode');
      }
      mergeIntoGloballyCachedUser({ updates: response.result.user });
      return response;
    }
    const response = await apiClient.getUserByFID({
      fid,
    });

    mergeIntoGloballyCachedUser({ updates: response.data.result.user });

    return response.data;
  };

export { buildUserByFidFetcher };
