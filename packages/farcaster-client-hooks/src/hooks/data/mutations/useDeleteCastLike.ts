import { ApiCast } from 'farcaster-client-data';
import { useCallback } from 'react';

import { UpdateCastLikeError } from '../../../errors';
import { protocolReact, protocolRemoved } from '../../../protocol/api';
import {
  isProtocolSignInRequired,
  isProtocolUnavailable,
  takeProtocolWrite,
} from '../../../protocol/writes';
import { useFarcasterApiClient } from '../../../providers/FarcasterApiClientProvider';
import { useOptimisticallyUpdateCast } from '../optimistic/useOptimisticallyUpdateCast';

const useDeleteCastLike = () => {
  const { apiClient } = useFarcasterApiClient();
  const optimisticallyUpdateCast = useOptimisticallyUpdateCast();

  return useCallback(
    async ({ cast }: { cast: ApiCast }) => {
      const write = takeProtocolWrite();
      const revertOptimisticUpdates = optimisticallyUpdateCast({
        updates: {
          hash: cast.hash,
          reactions: {
            count: Math.max(0, cast.reactions.count - 1),
          },
          viewerContext: {
            reacted: false,
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
          await protocolReact({
            action: 'remove',
            reaction: 'like',
            targetFid: cast.author.fid,
            targetHash: cast.hash,
          });
          return protocolRemoved();
        }
        const response = await apiClient.deleteCastLike({
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

export { useDeleteCastLike };
