import { ApiCast } from 'farcaster-client-data';
import { useCallback } from 'react';

import { UpdateCastLikeError } from '../../../errors';
import { protocolLikeResponse, protocolReact } from '../../../protocol/api';
import {
  isProtocolSignInRequired,
  isProtocolUnavailable,
  takeProtocolWrite,
} from '../../../protocol/writes';
import { useFarcasterApiClient } from '../../../providers/FarcasterApiClientProvider';
import { useOptimisticallyUpdateCast } from '../optimistic/useOptimisticallyUpdateCast';

const useCreateCastLike = () => {
  const { apiClient } = useFarcasterApiClient();
  const optimisticallyUpdateCast = useOptimisticallyUpdateCast();

  return useCallback(
    async ({ cast }: { cast: ApiCast }) => {
      const write = takeProtocolWrite();
      const revertOptimisticUpdates = optimisticallyUpdateCast({
        updates: {
          hash: cast.hash,
          reactions: {
            count: cast.reactions.count + 1,
          },
          viewerContext: {
            reacted: true,
          },
        },
        revertUpdates: {
          hash: cast.hash,
          reactions: {
            count: cast.reactions.count,
          },
          viewerContext: {
            reacted: cast.viewerContext?.reacted,
          },
        },
      });

      try {
        if (write.mode === 'hub') {
          const hash = await protocolReact({
            action: 'add',
            reaction: 'like',
            targetFid: cast.author.fid,
            targetHash: cast.hash,
          });
          return protocolLikeResponse(hash, cast.hash, write.session);
        }
        const response = await apiClient.createCastLike({
          castHash: cast.hash,
        });
        return response.data;
      } catch (error) {
        revertOptimisticUpdates();
        if (isProtocolSignInRequired(error) || isProtocolUnavailable(error)) {
          throw error;
        }
        throw new UpdateCastLikeError({ castHash: cast.hash, error });
      }
    },
    [apiClient, optimisticallyUpdateCast],
  );
};

export { useCreateCastLike };
