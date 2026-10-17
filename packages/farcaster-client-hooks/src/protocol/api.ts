import {
  ApiCast,
  ApiCastEmbeds,
  ApiCastFeedItem,
  ApiCastImageEmbed,
  ApiCastUrlEmbed,
  ApiCastVideoEmbed,
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
  ApiGetNotificationsForTab200Response,
  ApiGetUserAppContext200Response,
  ApiGetUserByUsername200Response,
  ApiGetUserCasts200Response,
  ApiGetUserPreferences200Response,
  ApiGetUserThreadCasts200Response,
  ApiNotificationGroup,
  ApiQuoteCastEmbed,
  ApiUser,
} from 'farcaster-client-data';
import {
  buildCastAdd,
  buildFollow,
  buildReaction,
  castReadBackPath,
  classifyEmbedUrl,
  getCastById,
  getCastEngagement,
  getCastsByFid,
  getChronologicalFeed,
  getFollowingPage,
  getHubNotifications,
  getLightProfile,
  getProfileByFid,
  getProfileByUsername,
  getReactionEngagement,
  getReplyPage,
  getThreadByUsername,
  HubCast,
  HubEmbed,
  HubProfile,
  HubReplyNode,
  HubThread,
  linkReadBackPath,
  lookupFidForHash,
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

const DEFAULT_VIDEO_WIDTH = 1280;
const DEFAULT_VIDEO_HEIGHT = 720;

const quoteCache = new Map<string, ApiQuoteCastEmbed>();

function quoteKey(id: { fid: number; hash: string }): string {
  return `${id.fid}:${id.hash.toLowerCase()}`;
}

function fallbackUser(fid: number): ApiUser {
  return {
    fid,
    displayName: `FID ${fid}`,
    profile: { bio: { text: '', mentions: [] } },
    followerCount: 0,
    followingCount: 0,
  };
}

function linkEmbed(url: string): ApiCastUrlEmbed {
  let domain = url;
  try {
    domain = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    domain = url;
  }
  return {
    type: 'url',
    openGraph: {
      url,
      sourceUrl: url,
      domain,
      title: domain,
    },
  };
}

function textWithoutEmbedUrls(
  text: string,
  urls: string[],
): string | undefined {
  let next = text;
  for (const url of urls) {
    if (url) {
      next = next.split(url).join('');
    }
  }
  const trimmed = next
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return trimmed === text ? undefined : trimmed;
}

function embedsForHubCast(
  cast: HubCast,
  quotes: Map<string, ApiQuoteCastEmbed>,
): ApiCastEmbeds | undefined {
  const raw = cast.embeds ?? [];
  if (raw.length === 0) {
    return undefined;
  }
  const images: ApiCastImageEmbed[] = [];
  const videos: ApiCastVideoEmbed[] = [];
  const urls: ApiCastUrlEmbed[] = [];
  const casts: ApiQuoteCastEmbed[] = [];
  for (const embed of raw) {
    if (embed.castId) {
      const quote = quotes.get(quoteKey(embed.castId));
      if (quote) {
        casts.push(quote);
      } else {
        urls.push(
          linkEmbed(
            `https://farcaster.xyz/~/conversations/${embed.castId.hash}`,
          ),
        );
      }
      continue;
    }
    if (!embed.url) {
      continue;
    }
    const kind = classifyEmbedUrl(embed.url);
    if (kind === 'image') {
      images.push({
        type: 'image',
        url: embed.url,
        sourceUrl: embed.url,
        alt: '',
      });
    } else if (kind === 'video') {
      videos.push({
        type: 'video',
        url: embed.url,
        sourceUrl: embed.url,
        width: DEFAULT_VIDEO_WIDTH,
        height: DEFAULT_VIDEO_HEIGHT,
      });
    } else {
      urls.push(linkEmbed(embed.url));
    }
  }
  return {
    images,
    urls,
    videos,
    casts: casts.length > 0 ? casts : undefined,
    unknowns: [],
    processedCastText: textWithoutEmbedUrls(cast.text, [
      ...images.map((image) => image.url),
      ...videos.map((video) => video.url),
      ...urls.map((url) => url.openGraph.url),
    ]),
  };
}

function quoteFromHubCast(cast: HubCast, author: ApiUser): ApiQuoteCastEmbed {
  const apiCast = hubCastToApiCast(cast, author, new Map());
  return {
    hash: apiCast.hash,
    threadHash: apiCast.threadHash,
    parentHash: apiCast.parentHash,
    author: apiCast.author,
    text: apiCast.text,
    timestamp: apiCast.timestamp,
    embeds: apiCast.embeds,
  };
}

async function mapLimit<T, R>(
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
        out[current] = await fn(items[current] as T);
      }
    },
  );
  await Promise.all(workers);
  return out;
}

async function loadQuotes(
  hubUrl: string,
  casts: HubCast[],
  authors: Map<number, ApiUser>,
): Promise<Map<string, ApiQuoteCastEmbed>> {
  const wanted: HubEmbed[] = [];
  const seen = new Set<string>();
  for (const cast of casts) {
    for (const embed of cast.embeds ?? []) {
      if (!embed.castId) {
        continue;
      }
      const key = quoteKey(embed.castId);
      if (seen.has(key) || quoteCache.has(key)) {
        continue;
      }
      seen.add(key);
      wanted.push(embed);
    }
  }
  const fetched = await mapLimit(wanted, 4, async (embed) => {
    const id = embed.castId as { fid: number; hash: string };
    const hubCast = await getCastById(hubUrl, id.fid, id.hash).catch(
      () => null,
    );
    return { id, hubCast };
  });
  const missingAuthors = new Set<number>();
  for (const item of fetched) {
    if (item.hubCast && !authors.has(item.hubCast.fid)) {
      missingAuthors.add(item.hubCast.fid);
    }
  }
  await Promise.all(
    [...missingAuthors].map(async (fid) => {
      const profile = await getLightProfile(hubUrl, fid).catch(() => null);
      authors.set(
        fid,
        profile ? hubProfileToApiUser(profile) : fallbackUser(fid),
      );
    }),
  );
  for (const item of fetched) {
    if (!item.hubCast) {
      continue;
    }
    quoteCache.set(
      quoteKey(item.id),
      quoteFromHubCast(
        item.hubCast,
        authors.get(item.hubCast.fid) ?? fallbackUser(item.hubCast.fid),
      ),
    );
  }
  const quotes = new Map<string, ApiQuoteCastEmbed>();
  for (const cast of casts) {
    for (const embed of cast.embeds ?? []) {
      if (!embed.castId) {
        continue;
      }
      const quote = quoteCache.get(quoteKey(embed.castId));
      if (quote) {
        quotes.set(quoteKey(embed.castId), quote);
      }
    }
  }
  return quotes;
}

export function hubCastToApiCast(
  cast: HubCast,
  author: ApiUser,
  quotes: Map<string, ApiQuoteCastEmbed> = new Map(),
): ApiCast {
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
    embeds: embedsForHubCast(cast, quotes),
    replies: { count: 0 },
    reactions: { count: 0 },
    recasts: { count: 0 },
    watches: { count: 0 },
    viewerContext: {},
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
  const authors = new Map<number, ApiUser>([[params.fid, author]]);
  const quotes = await loadQuotes(hubUrl, page.casts, authors);
  return {
    result: {
      casts: page.casts.map((cast) => hubCastToApiCast(cast, author, quotes)),
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
      embeds: (params.embeds ?? [])
        .filter((url) => url.length > 0)
        .map((url) => ({ url })),
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

const NOTIFICATION_PREVIEW_LIMIT = 8;
const NOTIFICATION_GROUP_LIMIT = 80;
const SEEN_KEY_PREFIX = 'smashcast.notificationsSeenAt.';

export function protocolNotificationsSeenAt(fid: number): number {
  try {
    const raw = globalThis.localStorage?.getItem(`${SEEN_KEY_PREFIX}${fid}`);
    const value = raw ? Number(raw) : 0;
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

export function markProtocolNotificationsSeen(fid: number): void {
  try {
    globalThis.localStorage?.setItem(
      `${SEEN_KEY_PREFIX}${fid}`,
      String(Date.now()),
    );
  } catch {
    // Storage can be blocked. The list still renders.
  }
}

function unreadSince(seenAt: number, timestamp: number): boolean {
  return seenAt > 0 && timestamp > seenAt;
}

export async function protocolNotificationGroups(
  fid: number,
): Promise<ApiGetNotificationsForTab200Response['result']['notifications']> {
  const hubUrl = protocolHubUrl();
  if (!hubUrl) {
    return [];
  }
  const feed = await getHubNotifications(hubUrl, fid);
  const profiles = new Map(
    feed.profiles.map((profile) => [profile.fid, hubProfileToApiUser(profile)]),
  );
  const userOf = (actorFid: number): ApiUser =>
    profiles.get(actorFid) ?? fallbackUser(actorFid);
  const self = userOf(fid);
  const seenAt = protocolNotificationsSeenAt(fid);
  const groups: ApiNotificationGroup[] = [];

  for (const row of feed.likes) {
    const latest = row.reactions[0]?.timestampMs ?? 0;
    const preview = row.reactions.slice(0, NOTIFICATION_PREVIEW_LIMIT);
    groups.push({
      id: `like:${row.cast.hash}`,
      type: 'cast-reaction',
      latestTimestamp: latest,
      totalItemCount: row.reactions.length,
      isUnread: unreadSince(seenAt, latest),
      previewItems: preview.map((reaction) => ({
        type: 'cast-reaction',
        id: reaction.hash,
        timestamp: reaction.timestampMs,
        actor: userOf(reaction.actorFid),
        content: {
          cast: hubCastToApiCast(row.cast, self),
          reaction: {
            type: 'like',
            hash: reaction.hash,
            reactor: userOf(reaction.actorFid),
            timestamp: reaction.timestampMs,
            castHash: row.cast.hash,
          },
        },
      })),
    });
  }

  for (const row of feed.recasts) {
    const latest = row.reactions[0]?.timestampMs ?? 0;
    const preview = row.reactions.slice(0, NOTIFICATION_PREVIEW_LIMIT);
    const recastedCast = hubCastToApiCast(row.cast, self);
    groups.push({
      id: `recast:${row.cast.hash}`,
      type: 'recast',
      latestTimestamp: latest,
      totalItemCount: row.reactions.length,
      isUnread: unreadSince(seenAt, latest),
      previewItems: preview.map((reaction) => ({
        type: 'recast',
        id: reaction.hash,
        timestamp: reaction.timestampMs,
        actor: userOf(reaction.actorFid),
        content: {
          recastedCast,
          recast: hubCastToApiCast(
            {
              hash: reaction.hash,
              fid: reaction.actorFid,
              text: '',
              timestampMs: reaction.timestampMs,
              embeds: [],
            },
            userOf(reaction.actorFid),
          ),
        },
      })),
    });
  }

  for (const reply of feed.replies) {
    const actor = userOf(reply.fid);
    groups.push({
      id: `reply:${reply.hash}`,
      type: 'cast-reply',
      latestTimestamp: reply.timestampMs,
      totalItemCount: 1,
      isUnread: unreadSince(seenAt, reply.timestampMs),
      previewItems: [
        {
          type: 'cast-reply',
          id: reply.hash,
          timestamp: reply.timestampMs,
          actor,
          content: { cast: hubCastToApiCast(reply, actor) },
        },
      ],
    });
  }

  for (const mention of feed.mentions) {
    const actor = userOf(mention.fid);
    groups.push({
      id: `mention:${mention.hash}`,
      type: 'cast-mention',
      latestTimestamp: mention.timestampMs,
      totalItemCount: 1,
      isUnread: unreadSince(seenAt, mention.timestampMs),
      previewItems: [
        {
          type: 'cast-mention',
          id: mention.hash,
          timestamp: mention.timestampMs,
          actor,
          content: { cast: hubCastToApiCast(mention, actor) },
        },
      ],
    });
  }

  for (const follow of feed.follows) {
    groups.push({
      id: `follow:${follow.hash}`,
      type: 'follow',
      latestTimestamp: follow.timestampMs,
      totalItemCount: 1,
      isUnread: unreadSince(seenAt, follow.timestampMs),
      previewItems: [
        {
          type: 'follow',
          id: follow.hash,
          timestamp: follow.timestampMs,
          actor: userOf(follow.actorFid),
        },
      ],
    });
  }

  groups.sort((a, b) => b.latestTimestamp - a.latestTimestamp);
  return groups.slice(0, NOTIFICATION_GROUP_LIMIT);
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
    notificationTabsV2: [{ id: 'all', name: 'All' }],
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
  const quotes = await loadQuotes(hubUrl, page, authors);
  const items: ApiCastFeedItem[] = page.map((cast) => ({
    id: cast.hash,
    timestamp: cast.timestampMs,
    cast: hubCastToApiCast(
      cast,
      authors.get(cast.fid) ?? fallbackUser(cast.fid),
      quotes,
    ),
    otherParticipants: [],
  }));
  return {
    result: {
      items,
      latestMainCastTimestamp: items[0]?.timestamp,
    },
  };
}

function flattenThread(thread: HubThread): Array<{
  cast: HubCast;
  replyCount: number;
}> {
  const flat: Array<{ cast: HubCast; replyCount: number }> = [
    { cast: thread.root, replyCount: thread.replyCount },
  ];
  const walk = (nodes: HubReplyNode[]) => {
    for (const node of nodes) {
      flat.push({ cast: node.cast, replyCount: node.replyCount });
      walk(node.children);
    }
  };
  walk(thread.replies);
  return flat;
}

async function authorsForFids(
  hubUrl: string,
  fids: number[],
  seed?: Map<number, ApiUser>,
): Promise<Map<number, ApiUser>> {
  const authors = seed ?? new Map<number, ApiUser>();
  await Promise.all(
    fids
      .filter((fid) => !authors.has(fid))
      .map(async (fid) => {
        const profile = await getLightProfile(hubUrl, fid).catch(() => null);
        authors.set(
          fid,
          profile ? hubProfileToApiUser(profile) : fallbackUser(fid),
        );
      }),
  );
  return authors;
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
    protocolSession()?.fid,
  );
  if (!thread) {
    return { result: { casts: [] } };
  }
  const flat = flattenThread(thread);
  const authors = await authorsForFids(
    hubUrl,
    flat.map((item) => item.cast.fid),
    new Map([[thread.author.fid, hubProfileToApiUser(thread.author)]]),
  );
  const quotes = await loadQuotes(
    hubUrl,
    flat.map((item) => item.cast),
    authors,
  );
  return {
    result: {
      casts: flat.map((item) => {
        const apiCast = hubCastToApiCast(
          item.cast,
          authors.get(item.cast.fid) ?? fallbackUser(item.cast.fid),
          quotes,
        );
        const parentFid = item.cast.parent?.fid;
        if (parentFid && authors.has(parentFid)) {
          apiCast.parentAuthor = authors.get(parentFid);
        }
        apiCast.replies = { count: item.replyCount };
        if (item.cast.hash === thread.root.hash) {
          apiCast.reactions = { count: thread.likeCount };
          apiCast.recasts = { count: thread.recastCount };
          apiCast.viewerContext = {
            reacted: thread.viewerLiked,
            recast: thread.viewerRecast,
          };
        }
        return apiCast;
      }),
    },
  };
}

export async function protocolCastStats(params: {
  fid: number;
  hash: string;
}): Promise<{
  replies: ApiCast['replies'];
  reactions: ApiCast['reactions'];
  recasts: ApiCast['recasts'];
  viewerContext: NonNullable<ApiCast['viewerContext']>;
  preview?: ApiCast;
}> {
  const hubUrl = protocolHubUrl();
  if (!hubUrl) {
    return {
      replies: { count: 0 },
      reactions: { count: 0 },
      recasts: { count: 0 },
      viewerContext: {},
    };
  }
  const stats = await getCastEngagement(
    hubUrl,
    params.fid,
    params.hash,
    protocolSession()?.fid,
  );
  let preview: ApiCast | undefined;
  if (stats.preview) {
    const authors = await authorsForFids(hubUrl, [stats.preview.fid]);
    preview = hubCastToApiCast(
      stats.preview,
      authors.get(stats.preview.fid) ?? fallbackUser(stats.preview.fid),
    );
    if (!preview.parentHash) {
      preview.parentHash = params.hash;
    }
  }
  return {
    replies: { count: stats.replyCount },
    reactions: { count: stats.likeCount },
    recasts: { count: stats.recastCount },
    viewerContext: {
      reacted: stats.viewerLiked,
      recast: stats.viewerRecast,
    },
    preview,
  };
}

export async function protocolReactionStats(params: {
  fid: number;
  hash: string;
}): Promise<{
  reactions: ApiCast['reactions'];
  recasts: ApiCast['recasts'];
  viewerContext: NonNullable<ApiCast['viewerContext']>;
}> {
  const hubUrl = protocolHubUrl();
  if (!hubUrl) {
    return {
      reactions: { count: 0 },
      recasts: { count: 0 },
      viewerContext: {},
    };
  }
  const stats = await getReactionEngagement(
    hubUrl,
    params.fid,
    params.hash,
    protocolSession()?.fid,
  );
  return {
    reactions: { count: stats.likeCount },
    recasts: { count: stats.recastCount },
    viewerContext: {
      reacted: stats.viewerLiked,
      recast: stats.viewerRecast,
    },
  };
}

export async function protocolCastReplies(params: {
  parentHash: string;
  cursor?: string;
  excludeHashes?: string[];
}): Promise<{ casts: ApiCast[]; next?: string }> {
  const hubUrl = protocolHubUrl();
  const fid = lookupFidForHash(params.parentHash);
  if (!hubUrl || !fid) {
    return { casts: [] };
  }
  const excluded = new Set(
    (params.excludeHashes ?? []).map((hash) => hash.toLowerCase()),
  );
  let cursor = params.cursor;
  let casts: HubCast[] = [];
  let next: string | undefined;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const page = await getReplyPage(hubUrl, fid, params.parentHash, cursor);
    next = page.nextPageToken;
    casts = page.casts.filter((cast) => !excluded.has(cast.hash.toLowerCase()));
    if (casts.length > 0 || !next) {
      break;
    }
    cursor = next;
  }
  const authors = await authorsForFids(
    hubUrl,
    casts.map((cast) => cast.fid),
  );
  return {
    casts: casts.map((cast) => {
      const apiCast = hubCastToApiCast(
        cast,
        authors.get(cast.fid) ?? fallbackUser(cast.fid),
      );
      const parent = authors.get(fid);
      if (parent) {
        apiCast.parentAuthor = parent;
      }
      return apiCast;
    }),
    next,
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
