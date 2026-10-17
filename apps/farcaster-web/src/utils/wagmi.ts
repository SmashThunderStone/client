import { injected, walletConnect } from '@wagmi/connectors';
import { robinhood } from 'farcaster-client-data';
import { bsc, degen, monadTestnet, unichain } from 'viem/chains';
import { Config, createConfig, http, Transport } from 'wagmi';
import {
  arbitrum,
  arbitrumSepolia,
  base,
  baseSepolia,
  celo,
  gnosis,
  mainnet,
  optimism,
  optimismSepolia,
  polygon,
  sepolia,
  zora,
} from 'wagmi/chains';

const chains = [
  arbitrum,
  arbitrumSepolia,
  base,
  baseSepolia,
  degen,
  gnosis,
  optimism,
  optimismSepolia,
  polygon,
  zora,
  unichain,
  monadTestnet,
  celo,
  sepolia,
  mainnet,
  bsc,
  robinhood,
] as const;

const transports = chains.reduce(
  (acc, chain) => {
    acc[chain.id] = http();
    return acc;
  },
  {} as Record<number, Transport>,
);

const protocolDirect = import.meta.env.VITE_PROTOCOL_DIRECT === '1';
const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

const wagmiConfig: Config = createConfig({
  chains,
  transports,
  connectors: protocolDirect
    ? [
        injected({ shimDisconnect: true }),
        ...(walletConnectProjectId
          ? [
              walletConnect({
                projectId: walletConnectProjectId,
                showQrModal: true,
                metadata: {
                  name: 'SmashCast',
                  description:
                    'SmashCast is a client for the Farcaster protocol.',
                  url:
                    typeof window !== 'undefined'
                      ? window.location.origin
                      : 'https://smashcast.vercel.app',
                  icons: ['https://smashcast.vercel.app/brand/icon-192.png'],
                },
              }),
            ]
          : []),
      ]
    : [],
});

export { wagmiConfig };
