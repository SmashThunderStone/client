import { ApiCast } from 'farcaster-client-data';
import { useCallback } from 'react';

import { UpdateCastLikeError } from '../../../errors';
import { protocolLikeResponse, protocolReact } from '../../../protocol/api';
import { protocolSession } from '../../../protocol/runtime';
import { useFarcasterApiClient } from '../../../providers/FarcasterApiClientProvider';
import { useOptimisticallyUpdateCast } from '../optimistic/useOptimisticallyUpdateCast';

const useCreateCastLike = () => {
  const { apiClient } = useFarcasterApiClient();
  const optimisticallyUpdateCast = useOptimisticallyUpdateCast();

  return useCallback(
    async ({ cast }: { cast: ApiCast }) => {
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
        const session = protocolSession();
        if (session) {
          const hash = await protocolReact({
            action: 'add',
            reaction: 'like',
            targetFid: cast.author.fid,
            targetHash: cast.hash,
          });
          return protocolLikeResponse(hash, cast.hash, session);
        }
        const response = await apiClient.createCastLike({
          castHash: cast.hash,
        });
        return response.data;
      } catch (error) {
        revertOptimisticUpdates();
        throw new UpdateCastLikeError({ castHash: cast.hash, error });
      }
    },
    [apiClient, optimisticallyUpdateCast],
  );
};

export { useCreateCastLike };
