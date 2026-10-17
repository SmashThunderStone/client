import { useCallback } from 'react';

import { protocolDeleteCast } from '../../../protocol/api';
import { takeProtocolWrite } from '../../../protocol/writes';
import { useFarcasterApiClient } from '../../../providers/FarcasterApiClientProvider';
import { useOptimisticallyUpdateCast } from '../optimistic';
import { useInvalidateActiveChannelStreak } from '../queries/activeChannelStreak/useInvalidateActiveChannelStreak';
import { useInvalidateFeedItems } from '../queries/feedItems/useInvalidateFeedItems';
import { useInvalidateAllUserCasts } from '../queries/userCasts/useInvalidateAllUserCasts';

export type CastToDelete = {
  hash: string;
  author: {
    fid: number;
  };
  deleted?: boolean;
  channel?: {
    key: string;
  };
};

const useDeleteCast = () => {
  const { apiClient } = useFarcasterApiClient();

  const invalidateFeedItems = useInvalidateFeedItems();
  const invalidateAllUserCasts = useInvalidateAllUserCasts();
  const invalidateActiveChannelStreak = useInvalidateActiveChannelStreak();

  const optimisticallyUpdateCast = useOptimisticallyUpdateCast();

  return useCallback(
    async ({ cast }: { cast: CastToDelete }) => {
      const write = takeProtocolWrite();
      const revertOptimisticUpdates = optimisticallyUpdateCast({
        updates: { hash: cast.hash, deleted: true },
        revertUpdates: { hash: cast.hash, deleted: cast.deleted },
      });

      try {
        if (write.mode === 'hub') {
          await protocolDeleteCast(cast.hash);
        } else {
          await apiClient.deleteCast({ castHash: cast.hash });
        }

        invalidateFeedItems({ feedKey: 'home', feedType: 'default' });

        if (cast.channel) {
          invalidateFeedItems({
            feedKey: cast.channel.key,
            feedType: 'default',
          });
          invalidateFeedItems({
            feedKey: cast.channel.key,
            feedType: 'curated',
          });
          invalidateActiveChannelStreak({ fid: cast.author.fid });
        }

        invalidateAllUserCasts();
      } catch (error) {
        revertOptimisticUpdates();
        throw error;
      }
    },
    [
      apiClient,
      invalidateActiveChannelStreak,
      invalidateAllUserCasts,
      invalidateFeedItems,
      optimisticallyUpdateCast,
    ],
  );
};

export { useDeleteCast };
