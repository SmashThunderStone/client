import { fromFarcasterTime } from '@farcaster/core';

import { SnapchainHub } from './hub';
import {
  getCastsByFid,
  getLightProfile,
  HubCast,
  hubMessageToCast,
  HubProfile,
} from './reads';
import { unwrap } from './result';

/** Recent casts whose replies and reactions we ask the hub about. */
export const NOTIFICATION_CAST_LIMIT = 25;
const LIKE_PAGE = 25;
const RECAST_PAGE = 10;
const REPLY_PAGE = 10;
const MENTION_PAGE = 20;
const FOLLOW_PAGE = 25;
const PROFILE_CACHE_MS = 5 * 60_000;
const FEED_CACHE_MS = 60_000;

export type HubActorEvent = {
  hash: string;
  actorFid: number;
  timestampMs: number;
};

export type HubCastReactions = {
  cast: HubCast;
  reactions: HubActorEvent[];
};

export type HubNotificationFeed = {
  likes: HubCastReactions[];
  recasts: HubCastReactions[];
  replies: HubCast[];
  mentions: HubCast[];
  follows: HubActorEvent[];
  profiles: HubProfile[];
};

type ActorMessage = {
  kind: 'add' | 'remove';
  actorFid: number;
  /** Reaction target hash, or the actor fid for follows. */
  targetKey: string;
  hash: string;
  timestampMs: number;
};

/**
 * Newest-first hub pages. A remove hides an earlier add from the same actor
 * on the same target. The subject's own actions are not notifications.
 */
export function addedActorEvents(
  events: ActorMessage[],
  selfFid: number,
): HubActorEvent[] {
  const removed = new Set<string>();
  const added: HubActorEvent[] = [];
  for (const event of events) {
    if (!event.actorFid || event.actorFid === selfFid) {
      continue;
    }
    const key = `${event.actorFid}:${event.targetKey}`;
    if (event.kind === 'remove') {
      removed.add(key);
      continue;
    }
    if (removed.has(key)) {
      continue;
    }
    added.push({
      hash: event.hash,
      actorFid: event.actorFid,
      timestampMs: event.timestampMs,
    });
  }
  return added;
}

type RawMessage = {
  hash?: string;
  data?: {
    type?: string;
    fid?: number;
    timestamp?: number;
    reactionBody?: {
      targetCastId?: { hash?: string } | null;
    } | null;
  };
};

function eventFromMessage(
  message: RawMessage,
  targetKey: string,
): ActorMessage | null {
  const type = message.data?.type;
  const actorFid = message.data?.fid;
  const timestamp = message.data?.timestamp;
  if (
    !message.hash ||
    typeof actorFid !== 'number' ||
    typeof timestamp !== 'number'
  ) {
    return null;
  }
  const kind =
    type === 'MESSAGE_TYPE_REACTION_ADD' || type === 'MESSAGE_TYPE_LINK_ADD'
      ? 'add'
      : type === 'MESSAGE_TYPE_REACTION_REMOVE' ||
          type === 'MESSAGE_TYPE_LINK_REMOVE'
        ? 'remove'
        : null;
  if (!kind) {
    return null;
  }
  return {
    kind,
    actorFid,
    targetKey,
    hash: message.hash,
    timestampMs: unwrap(fromFarcasterTime(timestamp), 'notification time'),
  };
}

type MessagePage = { messages?: RawMessage[] };

const profileCache = new Map<number, { at: number; profile: HubProfile }>();
let feedCache: { fid: number; at: number; feed: HubNotificationFeed } | null =
  null;

async function cachedProfile(hubUrl: string, fid: number): Promise<HubProfile> {
  const hit = profileCache.get(fid);
  if (hit && Date.now() - hit.at < PROFILE_CACHE_MS) {
    return hit.profile;
  }
  const profile = await getLightProfile(hubUrl, fid);
  profileCache.set(fid, { at: Date.now(), profile });
  return profile;
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
        out[current] = await fn(items[current] as T);
      }
    },
  );
  await Promise.all(workers);
  return out;
}

async function reactionPage(
  hub: SnapchainHub,
  fid: number,
  hash: string,
  reactionType: 'Like' | 'Recast',
  pageSize: number,
): Promise<HubActorEvent[]> {
  const page = await hub.getJson<MessagePage>(
    `/v1/reactionsByCast?target_fid=${fid}&target_hash=${encodeURIComponent(hash)}&reaction_type=${reactionType}&pageSize=${pageSize}&reverse=true`,
  );
  const events = (page.messages ?? [])
    .map((message) =>
      eventFromMessage(
        message,
        message.data?.reactionBody?.targetCastId?.hash || hash,
      ),
    )
    .filter((event): event is ActorMessage => event !== null);
  return addedActorEvents(events, fid).slice(0, pageSize);
}

/**
 * Replies, mentions, likes, recasts, and follows for one FID.
 * One page each: the latest casts, then reactions and replies on those casts,
 * plus one page of mentions and one page of follows. `reactionsByTarget` is
 * not served by haatz; likes and recasts use `reactionsByCast`.
 */
export async function getHubNotifications(
  hubUrl: string,
  fid: number,
): Promise<HubNotificationFeed> {
  if (
    feedCache &&
    feedCache.fid === fid &&
    Date.now() - feedCache.at < FEED_CACHE_MS
  ) {
    return feedCache.feed;
  }
  const hub = new SnapchainHub(hubUrl);
  const [castsPage, mentionPage, followPage] = await Promise.all([
    getCastsByFid(hubUrl, fid, {
      pageSize: NOTIFICATION_CAST_LIMIT,
      replies: 'exclude',
    }).catch(() => ({ casts: [] as HubCast[] })),
    hub
      .getJson<{
        messages?: Parameters<typeof hubMessageToCast>[0][];
      }>(`/v1/castsByMention?fid=${fid}&pageSize=${MENTION_PAGE}&reverse=true`)
      .catch(() => ({ messages: [] })),
    hub
      .getJson<MessagePage>(
        `/v1/linksByTargetFid?target_fid=${fid}&link_type=follow&pageSize=${FOLLOW_PAGE}&reverse=true`,
      )
      .catch(() => ({ messages: [] })),
  ]);

  const perCast = await mapPool(castsPage.casts, 4, async (cast) => {
    const [likes, recasts, replies] = await Promise.all([
      reactionPage(hub, fid, cast.hash, 'Like', LIKE_PAGE).catch(
        () => [] as HubActorEvent[],
      ),
      reactionPage(hub, fid, cast.hash, 'Recast', RECAST_PAGE).catch(
        () => [] as HubActorEvent[],
      ),
      hub
        .getJson<{ messages?: Parameters<typeof hubMessageToCast>[0][] }>(
          `/v1/castsByParent?fid=${fid}&hash=${encodeURIComponent(cast.hash)}&pageSize=${REPLY_PAGE}&reverse=true`,
        )
        .then((page) =>
          (page.messages ?? [])
            .map((message) => hubMessageToCast(message))
            .filter(
              (reply): reply is HubCast => reply !== null && reply.fid !== fid,
            )
            .slice(0, REPLY_PAGE),
        )
        .catch(() => [] as HubCast[]),
    ]);
    return { cast, likes, recasts, replies };
  });

  const likes = perCast
    .filter((row) => row.likes.length > 0)
    .map((row) => ({ cast: row.cast, reactions: row.likes }));
  const recasts = perCast
    .filter((row) => row.recasts.length > 0)
    .map((row) => ({ cast: row.cast, reactions: row.recasts }));
  const replyHashes = new Set<string>();
  const replies: HubCast[] = [];
  for (const row of perCast) {
    for (const reply of row.replies) {
      if (replyHashes.has(reply.hash)) {
        continue;
      }
      replyHashes.add(reply.hash);
      replies.push(reply);
    }
  }

  const mentions: HubCast[] = [];
  for (const message of mentionPage.messages ?? []) {
    const cast = hubMessageToCast(message);
    if (!cast || cast.fid === fid || replyHashes.has(cast.hash)) {
      continue;
    }
    if (cast.parent?.fid === fid) {
      replyHashes.add(cast.hash);
      replies.push(cast);
      continue;
    }
    mentions.push(cast);
    if (mentions.length >= MENTION_PAGE) {
      break;
    }
  }

  const follows = addedActorEvents(
    (followPage.messages ?? [])
      .map((message) =>
        eventFromMessage(message, String(message.data?.fid ?? '')),
      )
      .filter((event): event is ActorMessage => event !== null),
    fid,
  ).slice(0, FOLLOW_PAGE);

  const actorFids = new Set<number>([fid]);
  for (const row of [...likes, ...recasts]) {
    for (const reaction of row.reactions) {
      actorFids.add(reaction.actorFid);
    }
  }
  for (const cast of [...replies, ...mentions]) {
    actorFids.add(cast.fid);
  }
  for (const follow of follows) {
    actorFids.add(follow.actorFid);
  }
  const profiles = await mapPool([...actorFids], 6, (actorFid) =>
    cachedProfile(hubUrl, actorFid).catch(() => fidOnly(actorFid)),
  );

  const feed: HubNotificationFeed = {
    likes,
    recasts,
    replies,
    mentions,
    follows,
    profiles,
  };
  feedCache = { fid, at: Date.now(), feed };
  return feed;
}

function fidOnly(fid: number): HubProfile {
  return {
    fid,
    displayName: `FID ${fid}`,
    bio: '',
    followerCount: 0,
    followingCount: 0,
    countsPartial: false,
  };
}
