import { fromFarcasterTime } from '@farcaster/core';

import { embedsFromCastBody } from './embeds';
import { SnapchainHub } from './hub';
import type { HubCast } from './reads';
import { unwrap } from './result';

/**
 * haatz accepts `0x` + 40 hex chars and the same hash without `0x`.
 * It rejects base64 message bytes. Always send lowercase `0x` hex.
 */
export function hubHashParam(hash: string): string {
  const trimmed = hash.trim();
  const prefixed =
    trimmed.startsWith('0x') || trimmed.startsWith('0X')
      ? trimmed
      : `0x${trimmed}`;
  if (/^0x[0-9a-fA-F]{40}$/.test(prefixed)) {
    return prefixed.toLowerCase();
  }
  return trimmed;
}

type WireMessage = {
  hash?: string;
  data?: {
    type?: string;
    fid?: number;
    timestamp?: number;
    castAddBody?: {
      text?: string;
      parentCastId?: { fid?: number; hash?: string } | null;
      embeds?: Array<{
        url?: string;
        castId?: { fid?: number; hash?: string } | null;
      } | null> | null;
      embedsDeprecated?: Array<string | { url?: string } | null> | null;
    } | null;
    reactionBody?: {
      type?: string;
      targetCastId?: { fid?: number; hash?: string } | null;
    } | null;
  };
};

type WirePage = {
  messages?: WireMessage[];
  nextPageToken?: string;
};

const idByHash = new Map<string, { fid: number; hash: string }>();
const idByPrefix = new Map<string, { fid: number; hash: string }>();
const fidByHash = new Map<string, number>();

export function rememberCastId(fid: number, hash: string): void {
  const normalized = hubHashParam(hash);
  if (!/^0x[0-9a-f]{40}$/.test(normalized)) {
    return;
  }
  const id = { fid, hash: normalized };
  idByHash.set(`${fid}:${normalized}`, id);
  idByPrefix.set(`${fid}:${normalized.slice(0, 10)}`, id);
  fidByHash.set(normalized, fid);
}

export function lookupFidForHash(hash: string): number | undefined {
  return fidByHash.get(hubHashParam(hash));
}

/** Full hash when the caller has one. Prefix matches casts this session already loaded. */
export function lookupCastId(
  fid: number,
  hashOrPrefix: string,
): { fid: number; hash: string } | undefined {
  const raw = hashOrPrefix.trim().toLowerCase();
  const prefixed = raw.startsWith('0x') ? raw : `0x${raw}`;
  if (/^0x[0-9a-f]{40}$/.test(prefixed)) {
    return idByHash.get(`${fid}:${prefixed}`) ?? { fid, hash: prefixed };
  }
  return idByPrefix.get(`${fid}:${prefixed.slice(0, 10)}`);
}

export function tallyReactions(
  messages: Array<{ data?: { type?: string; fid?: number } }>,
  viewerFid?: number,
): { count: number; viewer: boolean } {
  const latest = new Map<number, 'add' | 'remove'>();
  for (const message of messages) {
    const fid = message.data?.fid;
    const type = message.data?.type;
    if (!fid || latest.has(fid)) {
      continue;
    }
    if (type === 'MESSAGE_TYPE_REACTION_ADD') {
      latest.set(fid, 'add');
    } else if (type === 'MESSAGE_TYPE_REACTION_REMOVE') {
      latest.set(fid, 'remove');
    }
  }
  let count = 0;
  let viewer = false;
  for (const [fid, kind] of latest) {
    if (kind !== 'add') {
      continue;
    }
    count += 1;
    if (fid === viewerFid) {
      viewer = true;
    }
  }
  return { count, viewer };
}

const REPLY_PAGE_CAP = 40;
const REACTION_PAGE_CAP = 6;
const VIEWER_REACTION_PAGE_CAP = 4;
const STATS_CACHE_MS = 120_000;
const THREAD_VISIBLE_DIRECT = 40;
const THREAD_CHILD_PAGES = 1;

export type CastEngagement = {
  replyCount: number;
  repliesPartial: boolean;
  likeCount: number;
  recastCount: number;
  viewerLiked: boolean;
  viewerRecast: boolean;
  preview?: HubCast;
};

export type HubReplyNode = {
  cast: HubCast;
  replyCount: number;
  children: HubReplyNode[];
};

const statsCache = new Map<string, { at: number; value: CastEngagement }>();
const reactionCache = new Map<
  string,
  {
    at: number;
    value: Pick<
      CastEngagement,
      'likeCount' | 'recastCount' | 'viewerLiked' | 'viewerRecast'
    >;
  }
>();
const viewerTargetCache = new Map<
  string,
  { at: number; hashes: Set<string> }
>();

function messageToHubCast(message: WireMessage): HubCast | null {
  if (message.data?.type !== 'MESSAGE_TYPE_CAST_ADD') {
    return null;
  }
  const body = message.data.castAddBody;
  const fid = message.data.fid;
  if (!message.hash || typeof message.data.timestamp !== 'number' || !fid) {
    return null;
  }
  const parent = body?.parentCastId?.fid
    ? {
        fid: body.parentCastId.fid,
        hash: hubHashParam(body.parentCastId.hash || ''),
      }
    : undefined;
  const cast: HubCast = {
    hash: hubHashParam(message.hash),
    fid,
    text: body?.text || '',
    timestampMs: unwrap(fromFarcasterTime(message.data.timestamp), 'cast time'),
    embeds: embedsFromCastBody(body),
  };
  if (parent?.hash) {
    cast.parent = parent;
  }
  rememberCastId(cast.fid, cast.hash);
  return cast;
}

async function readPages(
  hub: SnapchainHub,
  path: string,
  maxPages: number,
): Promise<{ messages: WireMessage[]; partial: boolean }> {
  const messages: WireMessage[] = [];
  const seen = new Set<string>();
  let token = '';
  let partial = false;
  for (let page = 0; page < maxPages; page += 1) {
    const joiner = path.includes('?') ? '&' : '?';
    const url =
      path + (token ? `${joiner}pageToken=${encodeURIComponent(token)}` : '');
    let body: WirePage;
    try {
      body = await hub.getJson<WirePage>(url);
    } catch {
      partial = true;
      break;
    }
    let added = 0;
    for (const message of body.messages ?? []) {
      const id = message.hash;
      if (id && seen.has(id)) {
        continue;
      }
      if (id) {
        seen.add(id);
      }
      messages.push(message);
      added += 1;
    }
    const next = body.nextPageToken || '';
    if (added === 0 || isTerminalPageToken(next) || next === token) {
      return { messages, partial };
    }
    token = next;
  }
  if (token) {
    partial = true;
  }
  return { messages, partial };
}

/**
 * haatz uses a base64 JSON cursor. `[null,null]` means the page is done, but
 * the hub still returns that token. Following it repeats the same messages.
 */
export function isTerminalPageToken(token: string | undefined): boolean {
  if (!token) {
    return true;
  }
  const trimmed = token.trim();
  if (!trimmed) {
    return true;
  }
  try {
    const parsed = JSON.parse(atob(trimmed)) as unknown;
    return (
      Array.isArray(parsed) &&
      parsed.every((item) => item === null || item === undefined)
    );
  } catch {
    return false;
  }
}

function replyPath(fid: number, hash: string): string {
  return `/v1/castsByParent?fid=${fid}&hash=${encodeURIComponent(hubHashParam(hash))}&pageSize=100&reverse=true`;
}

function reactionPath(
  fid: number,
  hash: string,
  reactionType: 'Like' | 'Recast',
): string {
  return `/v1/reactionsByCast?target_fid=${fid}&target_hash=${encodeURIComponent(hubHashParam(hash))}&reaction_type=${reactionType}&pageSize=100&reverse=true`;
}

async function viewerTargetHashes(
  hub: SnapchainHub,
  viewerFid: number,
  reactionType: 'Like' | 'Recast',
): Promise<Set<string>> {
  const key = `${viewerFid}:${reactionType}`;
  const cached = viewerTargetCache.get(key);
  if (cached && Date.now() - cached.at < STATS_CACHE_MS) {
    return cached.hashes;
  }
  const page = await readPages(
    hub,
    `/v1/reactionsByFid?fid=${viewerFid}&reaction_type=${reactionType}&pageSize=100&reverse=true`,
    VIEWER_REACTION_PAGE_CAP,
  );
  const hashes = new Set<string>();
  const removed = new Set<string>();
  for (const message of page.messages) {
    const target = message.data?.reactionBody?.targetCastId?.hash;
    if (!target) {
      continue;
    }
    const normalized = hubHashParam(target);
    if (message.data?.type === 'MESSAGE_TYPE_REACTION_REMOVE') {
      removed.add(normalized);
      continue;
    }
    if (
      message.data?.type === 'MESSAGE_TYPE_REACTION_ADD' &&
      !removed.has(normalized)
    ) {
      hashes.add(normalized);
    }
  }
  viewerTargetCache.set(key, { at: Date.now(), hashes });
  return hashes;
}

async function reactionEngagement(
  hub: SnapchainHub,
  fid: number,
  normalized: string,
  viewerFid?: number,
): Promise<
  Pick<
    CastEngagement,
    'likeCount' | 'recastCount' | 'viewerLiked' | 'viewerRecast'
  >
> {
  const cacheKey = `${fid}:${normalized}:${viewerFid ?? 0}`;
  const cached = reactionCache.get(cacheKey);
  if (cached && Date.now() - cached.at < STATS_CACHE_MS) {
    return cached.value;
  }
  const [likes, recasts, viewerLikes, viewerRecasts] = await Promise.all([
    readPages(hub, reactionPath(fid, normalized, 'Like'), REACTION_PAGE_CAP),
    readPages(hub, reactionPath(fid, normalized, 'Recast'), REACTION_PAGE_CAP),
    viewerFid
      ? viewerTargetHashes(hub, viewerFid, 'Like').catch(
          () => new Set<string>(),
        )
      : Promise.resolve(new Set<string>()),
    viewerFid
      ? viewerTargetHashes(hub, viewerFid, 'Recast').catch(
          () => new Set<string>(),
        )
      : Promise.resolve(new Set<string>()),
  ]);
  const likeTally = tallyReactions(likes.messages, viewerFid);
  const recastTally = tallyReactions(recasts.messages, viewerFid);
  const value = {
    likeCount: likeTally.count,
    recastCount: recastTally.count,
    viewerLiked: likeTally.viewer || viewerLikes.has(normalized),
    viewerRecast: recastTally.viewer || viewerRecasts.has(normalized),
  };
  reactionCache.set(cacheKey, { at: Date.now(), value });
  return value;
}

export async function getCastEngagement(
  hubUrl: string,
  fid: number,
  hash: string,
  viewerFid?: number,
): Promise<CastEngagement> {
  const normalized = hubHashParam(hash);
  const cacheKey = `${fid}:${normalized}:${viewerFid ?? 0}`;
  const cached = statsCache.get(cacheKey);
  if (cached && Date.now() - cached.at < STATS_CACHE_MS) {
    return cached.value;
  }
  const hub = new SnapchainHub(hubUrl);
  const [replies, reactions] = await Promise.all([
    readPages(hub, replyPath(fid, normalized), REPLY_PAGE_CAP),
    reactionEngagement(hub, fid, normalized, viewerFid),
  ]);
  let preview: HubCast | undefined;
  let replyCount = 0;
  for (const message of replies.messages) {
    const cast = messageToHubCast(message);
    if (!cast) {
      continue;
    }
    replyCount += 1;
    if (!preview) {
      preview = cast;
    }
  }
  const value: CastEngagement = {
    replyCount,
    repliesPartial: replies.partial,
    ...reactions,
    preview,
  };
  statsCache.set(cacheKey, { at: Date.now(), value });
  return value;
}

export async function getReactionEngagement(
  hubUrl: string,
  fid: number,
  hash: string,
  viewerFid?: number,
): Promise<
  Pick<
    CastEngagement,
    'likeCount' | 'recastCount' | 'viewerLiked' | 'viewerRecast'
  >
> {
  const hub = new SnapchainHub(hubUrl);
  return reactionEngagement(hub, fid, hubHashParam(hash), viewerFid);
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

async function replyNodes(
  hub: SnapchainHub,
  fid: number,
  hash: string,
  maxPages: number,
  childDepth: number,
): Promise<{ nodes: HubReplyNode[]; replyCount: number }> {
  const page = await readPages(hub, replyPath(fid, hash), maxPages);
  const casts = page.messages
    .map(messageToHubCast)
    .filter((cast): cast is HubCast => cast !== null);
  const visible = casts.slice(0, THREAD_VISIBLE_DIRECT);
  const children = await mapPool(visible, 6, async (cast) => {
    if (childDepth <= 0) {
      return { cast, replyCount: 0, children: [] as HubReplyNode[] };
    }
    const nested = await replyNodes(
      hub,
      cast.fid,
      cast.hash,
      THREAD_CHILD_PAGES,
      childDepth - 1,
    );
    return {
      cast,
      replyCount: nested.replyCount,
      children: nested.nodes,
    };
  });
  // A leftover page token means the hub has more replies than this walk
  // kept. Bump the count so "Show more" stays available. The number is a
  // lower bound once REPLY_PAGE_CAP is hit.
  const replyCount =
    page.partial && casts.length > 0 ? casts.length + 1 : casts.length;
  return { nodes: children, replyCount };
}

/** Direct replies, then one level of replies-to-replies. Counts follow pagination. */
export async function getReplyTree(
  hubUrl: string,
  fid: number,
  hash: string,
): Promise<{ nodes: HubReplyNode[]; replyCount: number }> {
  const hub = new SnapchainHub(hubUrl);
  return replyNodes(hub, fid, hubHashParam(hash), REPLY_PAGE_CAP, 1);
}

export async function getReplyPage(
  hubUrl: string,
  fid: number,
  hash: string,
  pageToken?: string,
): Promise<{ casts: HubCast[]; nextPageToken?: string }> {
  const hub = new SnapchainHub(hubUrl);
  const path =
    replyPath(fid, hash) +
    (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
  const page = await hub.getJson<WirePage>(path);
  const casts = (page.messages ?? [])
    .map(messageToHubCast)
    .filter((cast): cast is HubCast => cast !== null);
  const next = page.nextPageToken;
  return {
    casts,
    nextPageToken:
      next && !isTerminalPageToken(next) && next !== pageToken
        ? next
        : undefined,
  };
}
