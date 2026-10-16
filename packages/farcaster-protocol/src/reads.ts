import { fromFarcasterTime } from '@farcaster/core';

import { SnapchainHub } from './hub';
import { unwrap } from './result';

export type HubProfile = {
  fid: number;
  username?: string;
  displayName: string;
  bio: string;
  pfpUrl?: string;
  url?: string;
  custodyAddress?: string;
  followerCount: number;
  followingCount: number;
  /** True when either count stopped at the page cap. */
  countsPartial: boolean;
};

export type HubCast = {
  hash: string;
  fid: number;
  text: string;
  timestampMs: number;
  parent?: {
    fid: number;
    hash: string;
  };
};

type HubMessage = {
  hash?: string;
  data?: {
    type?: string;
    fid?: number;
    timestamp?: number;
    castAddBody?: {
      text?: string;
      parentCastId?: { fid?: number; hash?: string } | null;
      parentUrl?: string | null;
    };
    userDataBody?: { type?: string; value?: string };
    linkBody?: { type?: string; targetFid?: number };
  };
};

type MessagePage = {
  messages?: HubMessage[];
  nextPageToken?: string;
};

const COUNT_PAGE_SIZE = 1000;
const COUNT_PAGE_CAP = 5;

type UsernameProof = {
  name?: string;
  type?: string;
  owner?: string;
};

export async function getLightProfile(
  hubUrl: string,
  fid: number,
): Promise<HubProfile> {
  const hub = new SnapchainHub(hubUrl);
  const [userData, proofs] = await Promise.all([
    hub.getJson<MessagePage>(`/v1/userDataByFid?fid=${fid}&pageSize=100`),
    hub.getOptionalJson<{ proofs?: UsernameProof[] }>(
      `/v1/userNameProofsByFid?fid=${fid}`,
    ),
  ]);

  const values = new Map<string, string>();
  for (const message of userData.messages ?? []) {
    const body = message.data?.userDataBody;
    if (body?.type && body.value) {
      values.set(body.type, body.value);
    }
  }

  const fnameProof = proofs?.proofs?.find(
    (proof) => proof.type === 'USERNAME_TYPE_FNAME' && proof.name,
  );
  const username =
    fnameProof?.name || values.get('USER_DATA_TYPE_USERNAME') || undefined;

  return {
    fid,
    username,
    displayName:
      values.get('USER_DATA_TYPE_DISPLAY') || username || `FID ${fid}`,
    bio: values.get('USER_DATA_TYPE_BIO') || '',
    pfpUrl: values.get('USER_DATA_TYPE_PFP'),
    url: values.get('USER_DATA_TYPE_URL'),
    custodyAddress: fnameProof?.owner,
    followerCount: 0,
    followingCount: 0,
    countsPartial: false,
  };
}

export async function getProfileByFid(
  hubUrl: string,
  fid: number,
): Promise<HubProfile> {
  const hub = new SnapchainHub(hubUrl);
  const [profile, following, followers] = await Promise.all([
    getLightProfile(hubUrl, fid),
    countMessages(hub, `/v1/linksByFid?fid=${fid}&link_type=follow`),
    countMessages(
      hub,
      `/v1/linksByTargetFid?target_fid=${fid}&link_type=follow`,
    ),
  ]);
  return {
    ...profile,
    followerCount: followers.count,
    followingCount: following.count,
    countsPartial: followers.partial || following.partial,
  };
}

export async function getProfileByUsername(
  hubUrl: string,
  username: string,
): Promise<HubProfile | null> {
  const hub = new SnapchainHub(hubUrl);
  const proof = await hub.getOptionalJson<{ fid?: number }>(
    `/v1/userNameProofByName?name=${encodeURIComponent(username.toLowerCase())}`,
  );
  if (!proof?.fid) {
    return null;
  }
  return getProfileByFid(hubUrl, proof.fid);
}

export async function getCastsByFid(
  hubUrl: string,
  fid: number,
  options: {
    pageToken?: string;
    pageSize?: number;
    replies: 'exclude' | 'include';
  },
): Promise<{ casts: HubCast[]; nextPageToken?: string }> {
  const hub = new SnapchainHub(hubUrl);
  const pageSize = options.pageSize ?? 15;
  const params = new URLSearchParams({
    fid: String(fid),
    pageSize: String(options.replies === 'exclude' ? pageSize * 3 : pageSize),
    reverse: 'true',
  });
  if (options.pageToken) {
    params.set('pageToken', options.pageToken);
  }
  const page = await hub.getJson<MessagePage>(`/v1/castsByFid?${params}`);
  const casts: HubCast[] = [];
  for (const message of page.messages ?? []) {
    if (message.data?.type !== 'MESSAGE_TYPE_CAST_ADD') {
      continue;
    }
    const body = message.data.castAddBody;
    const parent = body?.parentCastId?.fid
      ? {
          fid: body.parentCastId.fid,
          hash: body.parentCastId.hash || '',
        }
      : undefined;
    // parentUrl is a channel or embed parent, not a reply. Replies set parentCastId.
    if (options.replies === 'exclude' && parent) {
      continue;
    }
    if (!message.hash || typeof message.data.timestamp !== 'number') {
      continue;
    }
    casts.push({
      hash: message.hash,
      fid,
      text: body?.text || '',
      timestampMs: unwrap(
        fromFarcasterTime(message.data.timestamp),
        'cast time',
      ),
      parent,
    });
    if (casts.length >= pageSize) {
      break;
    }
  }
  return { casts, nextPageToken: page.nextPageToken };
}

export async function getFollowingPage(
  hubUrl: string,
  fid: number,
  pageToken?: string,
): Promise<{ users: HubProfile[]; nextPageToken?: string }> {
  const hub = new SnapchainHub(hubUrl);
  const params = new URLSearchParams({
    fid: String(fid),
    link_type: 'follow',
    pageSize: '25',
  });
  if (pageToken) {
    params.set('pageToken', pageToken);
  }
  const page = await hub.getJson<MessagePage>(`/v1/linksByFid?${params}`);
  const targetFids = (page.messages ?? [])
    .map((message) => message.data?.linkBody?.targetFid)
    .filter((target): target is number => typeof target === 'number');
  const users = await mapPool(targetFids, 5, (targetFid) =>
    getLightProfile(hubUrl, targetFid).catch(() => fidOnlyProfile(targetFid)),
  );
  return { users, nextPageToken: page.nextPageToken };
}

function fidOnlyProfile(fid: number): HubProfile {
  return {
    fid,
    displayName: `FID ${fid}`,
    bio: '',
    followerCount: 0,
    followingCount: 0,
    countsPartial: false,
  };
}

async function countMessages(
  hub: SnapchainHub,
  path: string,
): Promise<{ count: number; partial: boolean }> {
  let count = 0;
  let pageToken: string | undefined;
  for (let page = 0; page < COUNT_PAGE_CAP; page += 1) {
    const params = new URLSearchParams({ pageSize: String(COUNT_PAGE_SIZE) });
    if (pageToken) {
      params.set('pageToken', pageToken);
    }
    const joiner = path.includes('?') ? '&' : '?';
    const body = await hub.getJson<MessagePage>(`${path}${joiner}${params}`);
    count += body.messages?.length ?? 0;
    if (!body.nextPageToken) {
      return { count, partial: false };
    }
    pageToken = body.nextPageToken;
  }
  return { count, partial: true };
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let index = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (index < items.length) {
        const current = index;
        index += 1;
        out[current] = await fn(items[current]);
      }
    },
  );
  await Promise.all(workers);
  return out;
}
