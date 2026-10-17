import { useQueryClient } from '@tanstack/react-query';
import { useFarcasterApiClient } from 'farcaster-client-hooks';
import { getLightProfile, HubProfile } from 'farcaster-protocol';
import {
  createContext,
  FC,
  ReactNode,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';

import { protocolDirectEnabled, snapHubUrl } from '~/constants/protocol';
import { useAuth } from '~/contexts/AuthProvider';
import {
  getProtocolSession,
  setProtocolSession,
  subscribeProtocolSession,
} from '~/protocol/bridge';
import {
  deleteSigner,
  loadSigner,
  readMetaAddress,
  signerBytes,
} from '~/protocol/signerStore';

type ProtocolSessionProviderProps = {
  children: ReactNode;
};

const ProtocolHydrationContext = createContext(true);

const useProtocolHydrated = () => useContext(ProtocolHydrationContext);

const ProtocolSessionProvider: FC<ProtocolSessionProviderProps> = ({
  children,
}) => {
  const session = useSyncExternalStore(
    subscribeProtocolSession,
    getProtocolSession,
    getProtocolSession,
  );
  const { authToken, addSignOutListener } = useAuth();
  const { apiClient } = useFarcasterApiClient();
  const queryClient = useQueryClient();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    return addSignOutListener(() => {
      const current = getProtocolSession();
      if (current) {
        void deleteSigner(current.address);
      }
      setProtocolSession(null);
    });
  }, [addSignOutListener]);

  useEffect(() => {
    if (!protocolDirectEnabled) {
      setHydrated(true);
      return;
    }
    let cancelled = false;
    const address = readMetaAddress();
    if (!address) {
      setHydrated(true);
      return;
    }
    const restore = async () => {
      let stored = await loadSigner(address);
      if (!stored?.registered) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        if (cancelled) {
          return;
        }
        stored = await loadSigner(address);
      }
      if (cancelled || !stored?.registered) {
        return;
      }
      setProtocolSession({
        fid: stored.fid,
        address: stored.address,
        privateKey: signerBytes(stored.privateKeyHex),
        publicKey: signerBytes(stored.publicKeyHex),
        displayName: `FID ${stored.fid}`,
      });
    };
    void restore().finally(() => {
      if (cancelled) {
        return;
      }
      const current = getProtocolSession();
      if (current) {
        queryClient.setQueryData(
          ['onboardingState'],
          onboardingState(
            {
              fid: current.fid,
              username: current.username,
              displayName: current.displayName,
              bio: '',
              pfpUrl: current.pfpUrl,
              followerCount: 0,
              followingCount: 0,
              countsPartial: false,
            },
            current.address,
          ),
        );
      }
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  useEffect(() => {
    apiClient.updateOptions({
      protocolDirectAnonymous:
        protocolDirectEnabled && Boolean(session) && !authToken,
    });
  }, [apiClient, authToken, session]);

  useEffect(() => {
    if (!protocolDirectEnabled || !hydrated || authToken) {
      return;
    }
    if (!session) {
      queryClient.removeQueries({ queryKey: ['onboardingState'] });
      return;
    }
    queryClient.setQueryData(
      ['onboardingState'],
      onboardingState(
        {
          fid: session.fid,
          username: session.username,
          displayName: session.displayName,
          bio: '',
          pfpUrl: session.pfpUrl,
          followerCount: 0,
          followingCount: 0,
          countsPartial: false,
        },
        session.address,
      ),
    );
    let cancelled = false;
    void getLightProfile(snapHubUrl, session.fid)
      .then((profile) => {
        if (cancelled) {
          return;
        }
        const current = getProtocolSession();
        if (current && current.displayName !== profile.displayName) {
          setProtocolSession({
            ...current,
            username: profile.username,
            displayName: profile.displayName,
            pfpUrl: profile.pfpUrl,
          });
        }
        queryClient.setQueryData(
          ['onboardingState'],
          onboardingState(profile, session.address),
        );
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        queryClient.setQueryData(
          ['onboardingState'],
          onboardingState(
            {
              fid: session.fid,
              displayName: session.displayName,
              bio: '',
              followerCount: 0,
              followingCount: 0,
              countsPartial: false,
            },
            session.address,
          ),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [authToken, hydrated, queryClient, session]);

  return (
    <ProtocolHydrationContext.Provider
      value={!protocolDirectEnabled || hydrated}
    >
      {children}
    </ProtocolHydrationContext.Provider>
  );
};

function onboardingState(profile: HubProfile, address: string) {
  return {
    result: {
      state: {
        address,
        email: undefined,
        user: {
          fid: profile.fid,
          username: profile.username,
          displayName: profile.displayName,
          pfp: profile.pfpUrl
            ? { url: profile.pfpUrl, verified: false }
            : undefined,
          profile: {
            bio: { text: profile.bio, mentions: [] },
          },
          followerCount: profile.followerCount,
          followingCount: profile.followingCount,
        },
        hasOnboarding: true,
        needsRegistrationPayment: false,
        hasFid: true,
        hasFname: Boolean(profile.username),
        hasConfirmedEmail: false,
        hasDelegatedSigner: true,
        hasStorage: true,
        hasCompletedRegistration: true,
        hasSetupProfile: true,
        hasWarpcastWalletAddress: false,
        hasWarpcastSolanaWalletAddress: false,
        geoRestricted: false,
      },
    },
  };
}

ProtocolSessionProvider.displayName = 'ProtocolSessionProvider';

export { ProtocolSessionProvider, useProtocolHydrated };
