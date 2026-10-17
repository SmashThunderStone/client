import { useQueryClient } from '@tanstack/react-query';
import {
  ApiGetUserPreferences200Response,
  ApiUserPreferences,
} from 'farcaster-client-data';
import { useCallback } from 'react';

import { protocolUserPreferences } from '../../../protocol/api';
import { protocolReplacesHostedAuth } from '../../../protocol/runtime';
import { useFarcasterApiClient } from '../../../providers/FarcasterApiClientProvider';
import { buildUserPreferencesKey } from '../queries/userPreferences/buildUserPreferencesKey';
import { useInvalidateUserPreferences } from '../queries/userPreferences/useInvalidateUsePreferences';

const useOptimisticSetUserPreferences = () => {
  const queryClient = useQueryClient();

  return useCallback(
    async ({ preferences }: { preferences: Partial<ApiUserPreferences> }) => {
      queryClient.setQueryData(
        buildUserPreferencesKey(),
        (current: ApiGetUserPreferences200Response) => {
          if (!current) {
            return {
              result: {
                preferences: preferences,
              },
            };
          }
          return {
            result: {
              preferences: {
                ...current.result.preferences,
                ...preferences,
              },
            },
          };
        },
      );
    },
    [queryClient],
  );
};

const useSetUserPreferences = (setOptimistically = false) => {
  const { apiClient } = useFarcasterApiClient();
  const queryClient = useQueryClient();
  const invalidateUserPreferences = useInvalidateUserPreferences();
  const setOptimisticSetUserPreferences = useOptimisticSetUserPreferences();
  return useCallback(
    async ({ preferences }: { preferences: ApiUserPreferences }) => {
      if (setOptimistically) {
        setOptimisticSetUserPreferences({ preferences });
      }

      if (protocolReplacesHostedAuth(apiClient)) {
        const current =
          queryClient.getQueryData<ApiGetUserPreferences200Response>(
            buildUserPreferencesKey(),
          ) ?? protocolUserPreferences();
        const next: ApiGetUserPreferences200Response = {
          result: {
            preferences: { ...current.result.preferences, ...preferences },
          },
        };
        queryClient.setQueryData(buildUserPreferencesKey(), next);
        return next;
      }

      const response = await apiClient.setUserPreferences({ preferences });

      invalidateUserPreferences();

      return response.data;
    },
    [
      apiClient,
      invalidateUserPreferences,
      queryClient,
      setOptimisticSetUserPreferences,
      setOptimistically,
    ],
  );
};

export { useOptimisticSetUserPreferences, useSetUserPreferences };
