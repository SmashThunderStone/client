import { type Address, createPublicClient, http } from 'viem';
import { optimism } from 'viem/chains';

import {
  ID_REGISTRY_ABI,
  ID_REGISTRY_ADDRESS,
  OPTIMISM_RPC_URL,
} from './constants';
import { SnapchainHub } from './hub';

export async function fidOfAddress(
  address: Address,
  hubUrl: string,
): Promise<number> {
  try {
    const client = createPublicClient({
      chain: optimism,
      transport: http(OPTIMISM_RPC_URL),
    });
    const fid = await client.readContract({
      address: ID_REGISTRY_ADDRESS,
      abi: ID_REGISTRY_ABI,
      functionName: 'idOf',
      args: [address],
    });
    return Number(fid);
  } catch {
    return fidFromHub(address, hubUrl);
  }
}

async function fidFromHub(address: string, hubUrl: string): Promise<number> {
  const hub = new SnapchainHub(hubUrl);
  const json = await hub.getOptionalJson<Record<string, unknown>>(
    `/v1/onChainIdRegistryEventByAddress?address=${address}`,
  );
  if (!json) {
    return 0;
  }
  const direct = json.fid;
  if (typeof direct === 'number') {
    return direct;
  }
  const event = json.event as { fid?: number } | undefined;
  if (typeof event?.fid === 'number') {
    return event.fid;
  }
  return 0;
}
