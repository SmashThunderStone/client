import {
  buildGaslessKeyAddMessage,
  encodeKeyGatewayAdd,
  encodeSignedKeyRequestMetadata,
  farcasterTimeNow,
  fidOfAddress,
  gaslessKeyAddTypedData,
  gaslessSignedKeyRequestTypedData,
  generateEd25519Keypair,
  getSignersByFid,
  KEY_GATEWAY_ADD_ABI,
  MAX_KEY_TTL_SECONDS,
  onchainSignedKeyRequestTypedData,
  signerKeysInclude,
  SnapchainHub,
  waitForSigner,
} from 'farcaster-protocol';
import { FC, useEffect, useState } from 'react';
import { optimism } from 'viem/chains';
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSignTypedData,
  useSwitchChain,
  useWriteContract,
} from 'wagmi';

import { APP_NAME } from '~/brand/brand';
import { snapHubUrl, walletConnectProjectId } from '~/constants/protocol';
import { useAuth } from '~/contexts/AuthProvider';
import { setProtocolSession } from '~/protocol/bridge';
import {
  loadSigner,
  saveSigner,
  signerBytes,
  signerHex,
  type StoredSigner,
} from '~/protocol/signerStore';

type LoginWithWalletProps = {
  onClose: () => void;
};

const NOT_CUSTODY =
  'This wallet is not a Farcaster custody address. SmashCast can only sign for the address that owns the FID. Import the Farcaster recovery phrase into Rainbow or MetaMask, then connect that wallet. SmashCast never asks for the phrase.';

const LoginWithWallet: FC<LoginWithWalletProps> = ({ onClose }) => {
  const { connect, connectors, isPending } = useConnect();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { signTypedDataAsync } = useSignTypedData();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { signOut } = useAuth();
  const [fid, setFid] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  const injected = connectors.find((connector) => connector.id === 'injected');
  const walletConnect = connectors.find(
    (connector) => connector.id === 'walletConnect',
  );

  useEffect(() => {
    if (!address) {
      setFid(null);
      setReady(false);
      return;
    }
    let cancelled = false;
    setError(null);
    setMessage('Looking up the FID owned by this wallet…');
    void fidOfAddress(address, snapHubUrl)
      .then(async (found) => {
        if (cancelled) {
          return;
        }
        if (!found) {
          setFid(null);
          setMessage(null);
          setError(NOT_CUSTODY);
          return;
        }
        setFid(found);
        const existing = await loadSigner(address);
        if (
          existing?.registered &&
          existing.fid === found &&
          signerKeysInclude(
            (await getSignersByFid(snapHubUrl, found)).signers,
            existing.publicKeyHex,
          )
        ) {
          activate(existing);
          setReady(true);
          setMessage(`Signer ready for FID ${found}.`);
          return;
        }
        setReady(false);
        setMessage(
          `This wallet owns FID ${found}. Approve a signer to cast, like, recast, and follow. Your wallet will ask for two signatures. Neither one is a transaction.`,
        );
      })
      .catch((lookupError: unknown) => {
        if (!cancelled) {
          setError(
            lookupError instanceof Error
              ? lookupError.message
              : 'Could not look up this wallet.',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  async function ensureKey(): Promise<StoredSigner> {
    if (!address || !fid) {
      throw new Error('Connect the custody wallet first.');
    }
    const existing = await loadSigner(address);
    if (existing && existing.fid === fid) {
      return existing;
    }
    const keypair = generateEd25519Keypair();
    const stored: StoredSigner = {
      address,
      fid,
      privateKeyHex: signerHex(keypair.privateKey),
      publicKeyHex: signerHex(keypair.publicKey),
      registered: false,
    };
    await saveSigner(stored);
    return stored;
  }

  async function approveGasless() {
    if (!address || !fid) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const stored = await ensureKey();
      const signers = await getSignersByFid(snapHubUrl, fid);
      const deadline = farcasterTimeNow() + 6 * 60 * 60;
      const publicKey = stored.publicKeyHex;
      setMessage('Approve the signed key request in your wallet.');
      const signedKeyRequestSignature = await signTypedDataAsync(
        gaslessSignedKeyRequestTypedData({
          requestFid: fid,
          publicKey,
          deadline,
        }),
      );
      setMessage('Approve the key registration in your wallet.');
      const custodySignature = await signTypedDataAsync(
        gaslessKeyAddTypedData({
          fid,
          publicKey,
          nonce: signers.currentUserNonce + 1,
          deadline,
          ttl: MAX_KEY_TTL_SECONDS,
        }),
      );
      setMessage('Submitting the signer to Snapchain…');
      const messageBytes = await buildGaslessKeyAddMessage({
        fid,
        privateKey: signerBytes(stored.privateKeyHex),
        publicKey: signerBytes(publicKey),
        requestSigner: address,
        signedKeyRequestSignature,
        custodySignature,
        nonce: signers.currentUserNonce + 1,
        deadline,
      });
      await new SnapchainHub(snapHubUrl).submitMessage(messageBytes);
      const listed = await waitForSigner({
        hubUrl: snapHubUrl,
        fid,
        publicKeyHex: publicKey,
      });
      if (!listed) {
        throw new Error(
          'Snapchain accepted the submit, but the signer is not listed yet. Wait a moment and tap Approve signer again.',
        );
      }
      const registered = { ...stored, registered: true };
      await saveSigner(registered);
      activate(registered);
      setReady(true);
      setMessage(`Signer ready for FID ${fid}.`);
      onClose();
    } catch (approveError) {
      setError(
        approveError instanceof Error
          ? approveError.message
          : 'Could not register the signer.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function approveOnchain() {
    if (!address || !fid) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const stored = await ensureKey();
      const deadlineUnix = BigInt(Math.floor(Date.now() / 1000) + 60 * 60);
      setMessage('Switching to Optimism and asking for the onchain signature.');
      await switchChainAsync({ chainId: optimism.id });
      const signature = await signTypedDataAsync(
        onchainSignedKeyRequestTypedData({
          requestFid: fid,
          publicKey: stored.publicKeyHex,
          deadlineUnix,
        }),
      );
      const metadata = encodeSignedKeyRequestMetadata({
        requestFid: fid,
        requestSigner: address,
        signature,
        deadline: deadlineUnix,
      });
      const tx = encodeKeyGatewayAdd({
        publicKey: stored.publicKeyHex,
        metadata,
      });
      setMessage(
        'Confirm the Optimism transaction in your wallet. You pay gas.',
      );
      await writeContractAsync({
        address: tx.to,
        abi: KEY_GATEWAY_ADD_ABI,
        functionName: 'add',
        args: [1, stored.publicKeyHex, 1, metadata],
        chainId: optimism.id,
      });
      const listed = await waitForSigner({
        hubUrl: snapHubUrl,
        fid,
        publicKeyHex: stored.publicKeyHex,
        attempts: 20,
      });
      if (!listed) {
        throw new Error(
          'The transaction was sent, but the hub has not listed the signer yet.',
        );
      }
      const registered = { ...stored, registered: true };
      await saveSigner(registered);
      activate(registered);
      onClose();
    } catch (approveError) {
      setError(
        approveError instanceof Error
          ? approveError.message
          : 'Onchain key registration failed.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-3 text-white">
      <div>
        <div className="text-lg font-semibold">Sign in with wallet</div>
        <p className="mt-1 text-sm text-white/70">
          Connect the custody wallet for your FID. On a phone, use WalletConnect
          from Rainbow or MetaMask after importing the recovery phrase there.{' '}
          {APP_NAME} never asks for that phrase.
        </p>
      </div>
      {!isConnected && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="rounded-full bg-[var(--smashcast-red)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={!injected || isPending}
            onClick={() => injected && connect({ connector: injected })}
          >
            Browser wallet
          </button>
          {walletConnect ? (
            <button
              type="button"
              className="rounded-full border border-white/30 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={isPending}
              onClick={() => connect({ connector: walletConnect })}
            >
              WalletConnect
            </button>
          ) : (
            <p className="text-sm text-white/60">
              Mobile WalletConnect needs{' '}
              <span className="font-mono">VITE_WALLETCONNECT_PROJECT_ID</span>{' '}
              at build time
              {walletConnectProjectId ? '' : ' (not set).'}
            </p>
          )}
        </div>
      )}
      {isConnected && address && (
        <div className="flex flex-col gap-2">
          <div className="text-sm text-white/80">
            {address.slice(0, 6)}…{address.slice(-4)}
            {fid ? ` · FID ${fid}` : ''}
          </div>
          {message && <p className="text-sm text-white/80">{message}</p>}
          {fid && !ready && (
            <>
              <button
                type="button"
                className="rounded-full bg-[var(--smashcast-red)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={busy}
                onClick={() => {
                  void approveGasless();
                }}
              >
                Approve signer
              </button>
              <button
                type="button"
                className="rounded-full border border-white/30 px-4 py-2 text-sm text-white disabled:opacity-50"
                disabled={busy}
                onClick={() => {
                  void approveOnchain();
                }}
              >
                Register onchain instead (pays Optimism gas)
              </button>
            </>
          )}
          {ready && (
            <button
              type="button"
              className="rounded-full bg-[var(--smashcast-red)] px-4 py-2 text-sm font-semibold text-white"
              onClick={onClose}
            >
              Continue
            </button>
          )}
          <button
            type="button"
            className="text-left text-sm text-white/60 underline"
            onClick={() => {
              disconnect();
              if (ready) {
                void signOut();
              }
            }}
          >
            {ready ? 'Sign out and remove signer' : 'Disconnect wallet'}
          </button>
        </div>
      )}
      {error && (
        <p className="rounded-md bg-black/40 p-2 text-sm text-[#FFB4B0]">
          {error}
        </p>
      )}
    </div>
  );
};

function activate(stored: StoredSigner) {
  setProtocolSession({
    fid: stored.fid,
    address: stored.address,
    privateKey: signerBytes(stored.privateKeyHex),
    publicKey: signerBytes(stored.publicKeyHex),
    displayName: `FID ${stored.fid}`,
  });
}

export { LoginWithWallet };
