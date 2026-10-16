import {
  ApiCast,
  ApiCastFeedItem,
  ApiChannel,
  ApiCreateCast201Response,
  ApiCreateCastLike200Response,
  ApiCreateFollow200Response,
  ApiCreateRecast200Response,
  ApiDeleteCastLike200Response,
  ApiDeleteFollow200Response,
  ApiDeleteRecast200Response,
  ApiGetFeedItems200Response,
  ApiGetFollowing200Response,
  ApiGetUserAppContext200Response,
  ApiGetUserByUsername200Response,
  ApiGetUserCasts200Response,
  ApiGetUserPreferences200Response,
  ApiGetUserThreadCasts200Response,
  ApiUser,
} from 'farcaster-client-data';
import {
  buildCastAdd,
  buildFollow,
  buildReaction,
  castReadBackPath,
  getCastsByFid,
  getChronologicalFeed,
  getFollowingPage,
  getLightProfile,
  getProfileByFid,
  getProfileByUsername,
  getThreadByUsername,
  HubCast,
  HubProfile,
  linkReadBackPath,
  messageHash,
  publishMessage,
  reactionReadBackPath,
  selectFeedCasts,
} from 'farcaster-protocol';

import { protocolHubUrl, ProtocolSession, protocolSession } from './runtime';

export function hubProfileToApiUser(profile: HubProfile): ApiUser {
  return {
    fid: profile.fid,
    username: profile.username,
    displayName: profile.displayName,
    pfp: profile.pfpUrl ? { url: profile.pfpUrl, verified: false } : undefined,
    profile: {
      bio: { text: profile.bio, mentions: [] },
      url: profile.url,
    },
    followerCount: profile.followerCount,
    followingCount: profile.followingCount,
  };
}

function sessionAuthor(session: ProtocolSession): ApiUser {
  return {
    fid: session.fid,
    username: session.username,
    displayName: session.displayName || `FID ${session.fid}`,
    pfp: session.pfpUrl ? { url: session.pfpUrl, verified: false } : undefined,
    profile: { bio: { text: '', mentions: [] } },
    followerCount: 0,
    followingCount: 0,
  };
}

export function hubCastToApiCast(cast: HubCast, author: ApiUser): ApiCast {
  return {
    hash: cast.hash,
    threadHash: cast.parent?.hash || cast.hash,
    parentHash: cast.parent?.hash,
    parentAuthor: cast.parent
      ? {
          fid: cast.parent.fid,
          displayName: `FID ${cast.parent.fid}`,
          profile: { bio: { text: '', mentions: [] } },
          followerCount: 0,
          followingCount: 0,
        }
      : undefined,
    author,
    text: cast.text,
    timestamp: cast.timestampMs,
    replies: { count: 0 },
    reactions: { count: 0 },
    recasts: { count: 0 },
    watches: { count: 0 },
  };
}

export async function protocolUserByUsername(
  username: string,
): Promise<ApiGetUserByUsername200Response | null> {
  const hubUrl = protocolHubUrl();
  if (!hubUrl) {
    return null;
  }
  const profile = await getProfileByUsername(hubUrl, username);
  if (!profile) {
    return null;
  }
  return {
    result: {
      user: hubProfileToApiUser(profile),
      collectionsOwned: [],
      extras: {
        fid: profile.fid,
        custodyAddress: profile.custodyAddress || '',
      },
    },
  };
}

export async function protocolUserCasts(params: {
  fid: number;
  cursor?: string;
  replies: 'exclude' | 'include';
}): Promise<ApiGetUserCasts200Response> {
  const hubUrl = protocolHubUrl();
  if (!hubUrl) {
    throw new Error('Protocol reads are not enabled');
  }
  const [page, authorProfile] = await Promise.all([
    getCastsByFid(hubUrl, params.fid, {
      pageToken: params.cursor,
      replies: params.replies,
    }),
    getLightProfile(hubUrl, params.fid),
  ]);
  const author = hubProfileToApiUser(authorProfile);
  return {
    result: {
      casts: page.casts.map((cast) => hubCastToApiCast(cast, author)),
    },
    next: page.nextPageToken ? { cursor: page.nextPageToken } : undefined,
  };
}

export async function protocolFollowing(params: {
  fid: number;
  cursor?: string;
}): Promise<ApiGetFollowing200Response> {
  const hubUrl = protocolHubUrl();
  if (!hubUrl) {
    throw new Error('Protocol reads are not enabled');
  }
  const page = await getFollowingPage(hubUrl, params.fid, params.cursor);
  return {
    result: {
      users: page.users.map(hubProfileToApiUser),
      leastInteractedWith: { count: 0, users: [] },
    },
    next: page.nextPageToken ? { cursor: page.nextPageToken } : undefined,
  };
}

function requireSession(): { hubUrl: string; session: ProtocolSession } {
  const hubUrl = protocolHubUrl();
  const session = protocolSession();
  if (!hubUrl || !session) {
    throw new Error(
      'Connect a custody wallet and approve a SmashCast signer first.',
    );
  }
  return { hubUrl, session };
}

export async function protocolCreateCast(params: {
  text: string;
  embeds?: string[];
  parentCastHash?: string;
  parentAuthorFid?: number;
}): Promise<ApiCreateCast201Response> {
  const { hubUrl, session } = requireSession();
  if (params.parentCastHash && !params.parentAuthorFid) {
    throw new Error('A reply needs the parent cast author FID.');
  }
  const message = await buildCastAdd(
    { fid: session.fid, privateKey: session.privateKey },
    {
      text: params.text,
      embeds: params.embeds,
      parent: params.parentCastHash
        ? { fid: params.parentAuthorFid as number, hash: params.parentCastHash }
        : undefined,
    },
  );
  const hash = await publishMessage(
    hubUrl,
    message,
    castReadBackPath(session.fid, messageHash(message)),
  );
  const cast = hubCastToApiCast(
    {
      hash,
      fid: session.fid,
      text: params.text,
      timestampMs: Date.now(),
      parent: params.parentCastHash
        ? {
            fid: params.parentAuthorFid as number,
            hash: params.parentCastHash,
          }
        : undefined,
    },
    sessionAuthor(session),
  );
  return { result: { cast } };
}

export async function protocolReact(params: {
  action: 'add' | 'remove';
  reaction: 'like' | 'recast';
  targetFid: number;
  targetHash: string;
}): Promise<string> {
  const { hubUrl, session } = requireSession();
  const message = await buildReaction(
    { fid: session.fid, privateKey: session.privateKey },
    params.action,
    params.reaction,
    { fid: params.targetFid, hash: params.targetHash },
  );
  return publishMessage(
    hubUrl,
    message,
    reactionReadBackPath({
      fid: session.fid,
      reaction: params.reaction,
      targetFid: params.targetFid,
      targetHash: params.targetHash,
    }),
    params.action === 'add' ? 'present' : 'absent',
  );
}

export function protocolLikeResponse(
  hash: string,
  castHash: string,
  session: ProtocolSession,
): ApiCreateCastLike200Response {
  return {
    result: {
      like: {
        type: 'like',
        hash,
        reactor: sessionAuthor(session),
        timestamp: Date.now(),
        castHash,
      },
    },
  };
}

export function protocolRecastResponse(
  hash: string,
): ApiCreateRecast200Response {
  return { result: { castHash: hash } };
}

export function protocolFollowResponse(): ApiCreateFollow200Response {
  return { result: { success: true, userAppContext: { canAddLinks: true } } };
}

export function protocolRemoved(): ApiDeleteCastLike200Response &
  ApiDeleteRecast200Response &
  ApiDeleteFollow200Response {
  return {
    result: {
      success: true,
      userAppContext: { canAddLinks: true },
    },
  };
}

export function protocolUserPreferences(): ApiGetUserPreferences200Response {
  return {
    result: {
      preferences: {
        defaultFeed: 'home',
        replyFilterLevel: 'medium',
        expandFavoriteFeeds: true,
        expandActiveFeeds: true,
        expandAllFeeds: true,
      },
    },
  };
}

export function protocolUserAppContext(): ApiGetUserAppContext200Response['result']['context'] {
  return {
    canAddLinks: true,
    showConnectedApps: false,
    signerRequestsEnabled: false,
    prompts: [],
    castActions: [],
    canAddCastAction: false,
    regularCastByteLimit: 320,
    longCastByteLimit: 320,
    castEmbedLimit: 2,
  };
}

export function protocolChannelPlaceholder(key: string): ApiChannel {
  return {
    type: 'channel',
    key,
    name: key,
    description: 'Channels are not available in SmashCast direct mode.',
    showCastSourceLabels: false,
    showCastTags: false,
    sectionRank: 0,
    subscribable: false,
    viewerContext: {
      following: false,
      isMember: false,
      hasUnseenItems: false,
      canCast: false,
    },
  };
}

export async function protocolUserByFid(
  fid: number,
): Promise<ApiGetUserByUsername200Response | null> {
  const hubUrl = protocolHubUrl();
  if (!hubUrl) {
    return null;
  }
  const profile = await getProfileByFid(hubUrl, fid);
  return {
    result: {
      user: hubProfileToApiUser(profile),
      collectionsOwned: [],
      extras: {
        fid: profile.fid,
        custodyAddress: profile.custodyAddress || '',
      },
    },
  };
}

export async function protocolHomeFeed(params: {
  fid: number;
  excludePrefixes?: string[];
}): Promise<ApiGetFeedItems200Response> {
  const hubUrl = protocolHubUrl();
  if (!hubUrl) {
    return { result: { items: [] } };
  }
  let all;
  try {
    all = await getChronologicalFeed(hubUrl, params.fid);
  } catch {
    return { result: { items: [] } };
  }
  const page = selectFeedCasts(all, {
    excludePrefixes: params.excludePrefixes,
    limit: 20,
  });
  const authors = new Map<number, ApiUser>();
  await Promise.all(
    [...new Set(page.map((cast) => cast.fid))].map(async (fid) => {
      const profile = await getLightProfile(hubUrl, fid).catch(() => null);
      authors.set(
        fid,
        profile
          ? hubProfileToApiUser(profile)
          : {
              fid,
              displayName: `FID ${fid}`,
              profile: { bio: { text: '', mentions: [] } },
              followerCount: 0,
              followingCount: 0,
            },
      );
    }),
  );
  const items: ApiCastFeedItem[] = page.map((cast) => ({
    id: cast.hash,
    timestamp: cast.timestampMs,
    cast: hubCastToApiCast(cast, authors.get(cast.fid) as ApiUser),
    otherParticipants: [],
  }));
  return {
    result: {
      items,
      latestMainCastTimestamp: items[0]?.timestamp,
    },
  };
}

export async function protocolThread(params: {
  username: string;
  hashPrefix: string;
}): Promise<ApiGetUserThreadCasts200Response> {
  const hubUrl = protocolHubUrl();
  if (!hubUrl) {
    return { result: { casts: [] } };
  }
  const thread = await getThreadByUsername(
    hubUrl,
    params.username,
    params.hashPrefix,
  );
  if (!thread) {
    return { result: { casts: [] } };
  }
  const authors = new Map<number, ApiUser>();
  authors.set(thread.author.fid, hubProfileToApiUser(thread.author));
  await Promise.all(
    [...new Set(thread.casts.map((cast) => cast.fid))]
      .filter((fid) => !authors.has(fid))
      .map(async (fid) => {
        const profile = await getLightProfile(hubUrl, fid).catch(() => null);
        authors.set(
          fid,
          profile
            ? hubProfileToApiUser(profile)
            : {
                fid,
                displayName: `FID ${fid}`,
                profile: { bio: { text: '', mentions: [] } },
                followerCount: 0,
                followingCount: 0,
              },
        );
      }),
  );
  return {
    result: {
      casts: thread.casts.map((cast) => {
        const apiCast = hubCastToApiCast(
          cast,
          authors.get(cast.fid) as ApiUser,
        );
        if (cast.hash === thread.casts[0]?.hash) {
          apiCast.replies = { count: 0 };
        }
        return apiCast;
      }),
    },
  };
}

export async function protocolFollow(params: {
  action: 'add' | 'remove';
  targetFid: number;
}): Promise<void> {
  const { hubUrl, session } = requireSession();
  const message = await buildFollow(
    { fid: session.fid, privateKey: session.privateKey },
    params.action,
    params.targetFid,
  );
  await publishMessage(
    hubUrl,
    message,
    linkReadBackPath(session.fid, params.targetFid),
    params.action === 'add' ? 'present' : 'absent',
  );
}
