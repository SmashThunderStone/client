import { useQueryClient } from '@tanstack/react-query';
import { getProfileByFid, HubProfile } from 'farcaster-protocol';
import {
  FC,
  ReactNode,
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

const ProtocolSessionProvider: FC<ProtocolSessionProviderProps> = ({
  children,
}) => {
  const session = useSyncExternalStore(
    subscribeProtocolSession,
    getProtocolSession,
    getProtocolSession,
  );
  const { authToken, addSignOutListener } = useAuth();
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
    void loadSigner(address)
      .then((stored) => {
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
      })
      .finally(() => {
        if (!cancelled) {
          setHydrated(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!protocolDirectEnabled || !hydrated || authToken) {
      return;
    }
    if (!session) {
      queryClient.removeQueries({ queryKey: ['onboardingState'] });
      return;
    }
    let cancelled = false;
    void getProfileByFid(snapHubUrl, session.fid)
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

  return children;
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

export { ProtocolSessionProvider };
