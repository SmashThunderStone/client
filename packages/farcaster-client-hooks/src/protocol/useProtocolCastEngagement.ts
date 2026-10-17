import { useQueryClient } from '@tanstack/react-query';
import { ApiCast } from 'farcaster-client-data';
import { useEffect, useRef } from 'react';

import { useBatchMergeIntoGloballyCachedCasts } from '../hooks/data/queries/globallyCachedCast/useBatchMergeIntoGloballyCachedCasts';
import { protocolCastStats, protocolReactionStats } from './api';
import { protocolHubUrl, protocolSession } from './runtime';

const CONCURRENCY = 3;
const SESSION_WAIT_MS = 8_000;
const POLL_MS = 200;

type EngagementPatch = {
  replies?: ApiCast['replies'];
  reactions: ApiCast['reactions'];
  recasts: ApiCast['recasts'];
  viewerContext: NonNullable<ApiCast['viewerContext']>;
  preview?: ApiCast;
};

const done = new Set<string>();
const inFlight = new Set<string>();
const queue: Array<() => Promise<void>> = [];
let active = 0;

function pump() {
  while (active < CONCURRENCY && queue.length > 0) {
    const job = queue.shift();
    if (!job) {
      return;
    }
    active += 1;
    void job().finally(() => {
      active -= 1;
      pump();
    });
  }
}

function enqueue(job: () => Promise<void>) {
  queue.push(job);
  pump();
}

function sameHash(left: string | undefined, right: string): boolean {
  return left?.toLowerCase() === right.toLowerCase();
}

function applyCast(
  cast: ApiCast,
  stats: EngagementPatch,
  includePreview: boolean,
): ApiCast {
  const replies = stats.replies
    ? {
        ...cast.replies,
        count: stats.replies.count,
        ...(includePreview && stats.preview ? { casts: [stats.preview] } : {}),
      }
    : cast.replies;
  return {
    ...cast,
    replies,
    reactions: { ...cast.reactions, count: stats.reactions.count },
    recasts: { ...cast.recasts, count: stats.recasts.count },
    viewerContext: { ...cast.viewerContext, ...stats.viewerContext },
  };
}

function patchCastList(
  data: unknown,
  hash: string,
  stats: EngagementPatch,
  includePreview: boolean,
): unknown {
  if (!data || typeof data !== 'object' || !('pages' in data)) {
    return data;
  }
  const pages = (data as { pages: unknown[] }).pages;
  if (!Array.isArray(pages)) {
    return data;
  }
  let changed = false;
  const nextPages = pages.map((page) => {
    if (!page || typeof page !== 'object' || !('result' in page)) {
      return page;
    }
    const result = (page as { result?: { casts?: ApiCast[] } }).result;
    if (!result?.casts) {
      return page;
    }
    let castsChanged = false;
    const casts = result.casts.map((cast) => {
      if (!sameHash(cast.hash, hash)) {
        return cast;
      }
      castsChanged = true;
      return applyCast(cast, stats, includePreview);
    });
    if (!castsChanged) {
      return page;
    }
    changed = true;
    return { ...page, result: { ...result, casts } };
  });
  if (!changed) {
    return data;
  }
  return { ...(data as object), pages: nextPages };
}

function patchFeed(
  data: unknown,
  hash: string,
  stats: EngagementPatch,
): unknown {
  if (!data || typeof data !== 'object' || !('pages' in data)) {
    return data;
  }
  const pages = (data as { pages: unknown[] }).pages;
  if (!Array.isArray(pages)) {
    return data;
  }
  let changed = false;
  const nextPages = pages.map((page) => {
    if (!page || typeof page !== 'object' || !('result' in page)) {
      return page;
    }
    const result = (
      page as {
        result?: { items?: Array<{ cast: ApiCast; replies?: ApiCast[] }> };
      }
    ).result;
    if (!result?.items) {
      return page;
    }
    let itemsChanged = false;
    const items = result.items.map((item) => {
      if (!sameHash(item.cast?.hash, hash)) {
        return item;
      }
      itemsChanged = true;
      const next = { ...item, cast: applyCast(item.cast, stats, false) };
      if ((!item.replies || item.replies.length === 0) && stats.preview) {
        next.replies = [stats.preview];
      }
      return next;
    });
    if (!itemsChanged) {
      return page;
    }
    changed = true;
    return { ...page, result: { ...result, items } };
  });
  if (!changed) {
    return data;
  }
  return { ...(data as object), pages: nextPages };
}

function patchCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  hash: string,
  stats: EngagementPatch,
) {
  queryClient.setQueriesData({ queryKey: ['feedItems'] }, (current) =>
    patchFeed(current, hash, stats),
  );
  queryClient.setQueriesData({ queryKey: ['userCasts'] }, (current) =>
    patchCastList(current, hash, stats, true),
  );
  queryClient.setQueriesData({ queryKey: ['userCastsAndReplies'] }, (current) =>
    patchCastList(current, hash, stats, false),
  );
  queryClient.setQueriesData({ queryKey: ['userThreadCasts'] }, (current) =>
    patchCastList(current, hash, stats, false),
  );
}

/**
 * Fills reply, like, and recast counts for a cast that was loaded from the
 * hub without them. Visible casts are queued a few at a time so a feed does
 * not walk every reaction page at once.
 */
export function useProtocolCastEngagement(cast: ApiCast): void {
  const merge = useBatchMergeIntoGloballyCachedCasts();
  const queryClient = useQueryClient();
  const hash = cast.hash;
  const fid = cast.author.fid;
  const details = useRef({
    parentHash: cast.parentHash,
    replyCount: cast.replies.count,
    recast: cast.recast,
  });
  details.current = {
    parentHash: cast.parentHash,
    replyCount: cast.replies.count,
    recast: cast.recast,
  };

  useEffect(() => {
    if (!protocolHubUrl()) {
      return;
    }
    let cancelled = false;
    let observer: IntersectionObserver | undefined;
    let timer: number | undefined;
    const started = Date.now();

    const start = () => {
      if (cancelled) {
        return;
      }
      const current = details.current;
      const viewerFid = protocolSession()?.fid ?? 0;
      const key = `${fid}:${hash.toLowerCase()}:${viewerFid}:${current.recast ? 1 : 0}`;
      if (done.has(key) || inFlight.has(key)) {
        return;
      }
      inFlight.add(key);
      const reactionsOnly =
        current.replyCount > 0 || Boolean(current.parentHash);
      enqueue(async () => {
        try {
          if (reactionsOnly) {
            const stats = await protocolReactionStats({ fid, hash });
            merge({
              batchUpdates: [
                {
                  hash,
                  recast: current.recast,
                  reactions: stats.reactions,
                  recasts: stats.recasts,
                  viewerContext: stats.viewerContext,
                },
              ],
            });
            patchCaches(queryClient, hash, stats);
          } else {
            const stats = await protocolCastStats({ fid, hash });
            merge({
              batchUpdates: [
                {
                  hash,
                  recast: current.recast,
                  replies: stats.replies,
                  reactions: stats.reactions,
                  recasts: stats.recasts,
                  viewerContext: stats.viewerContext,
                },
              ],
            });
            patchCaches(queryClient, hash, stats);
          }
          done.add(key);
        } catch {
          // Leave the key out of `done` so a later mount can retry.
        } finally {
          inFlight.delete(key);
        }
      });
    };

    const watch = () => {
      if (cancelled) {
        return;
      }
      const node = document.getElementById(`cast:${hash}`);
      if (!node || typeof IntersectionObserver === 'undefined') {
        start();
        return;
      }
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer?.disconnect();
            start();
          }
        },
        { rootMargin: '400px 0px' },
      );
      observer.observe(node);
    };

    const tryArm = () => {
      if (cancelled) {
        return;
      }
      if (!protocolSession() && Date.now() - started < SESSION_WAIT_MS) {
        timer = window.setTimeout(tryArm, POLL_MS);
        return;
      }
      watch();
    };
    tryArm();

    return () => {
      cancelled = true;
      if (timer) {
        window.clearTimeout(timer);
      }
      observer?.disconnect();
    };
  }, [fid, hash, merge, queryClient]);
}
