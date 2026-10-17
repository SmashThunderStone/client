import { FarcasterApiClient } from 'farcaster-client-data';

import { protocolReplacesHostedAuth } from '../../../../protocol/runtime';

const buildAudioRoomsListFetcher =
  ({ apiClient, limit }: { apiClient: FarcasterApiClient; limit?: number }) =>
  async () => {
    if (protocolReplacesHostedAuth(apiClient)) {
      return [];
    }
    const response = await apiClient.listLiveAudioRooms({ limit });
    return response.data.result.rooms;
  };

export { buildAudioRoomsListFetcher };
