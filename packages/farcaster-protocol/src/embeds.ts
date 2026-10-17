/**
 * Hub CastAdd embeds are `{ url }` or `{ castId }` with no media metadata.
 * FID 218142 on haatz (800 casts): imagedelivery.net images with no file
 * extension, stream.farcaster.xyz m3u8 videos, ordinary links, and castId quotes.
 * wrpcd.net is the Warpcast image CDN this client already rewrites those
 * Cloudflare URLs through. supercast hosts did not appear in that sample.
 */

export type HubEmbed = {
  url?: string;
  castId?: {
    fid: number;
    hash: string;
  };
};

export type EmbedKind = 'image' | 'video' | 'link';

const IMAGE_HOSTS = new Set([
  'imagedelivery.net',
  'i.imgur.com',
  'wrpcd.net',
  'public.blob.vercel-storage.com',
]);

const VIDEO_HOSTS = new Set(['stream.farcaster.xyz']);

const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp)$/i;
const VIDEO_EXTENSION = /\.(m3u8|mp4|webm)$/i;

type RawEmbed = {
  url?: string;
  castId?: { fid?: number; hash?: string } | null;
};

type RawCastBody = {
  embeds?: Array<RawEmbed | null> | null;
  embedsDeprecated?: Array<string | { url?: string } | null> | null;
};

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url.split(/[?#]/, 1)[0] ?? url;
  }
}

function hostIs(host: string | null, names: Set<string>): boolean {
  if (!host) {
    return false;
  }
  if (names.has(host)) {
    return true;
  }
  for (const name of names) {
    if (host.endsWith(`.${name}`)) {
      return true;
    }
  }
  return false;
}

export function classifyEmbedUrl(url: string): EmbedKind {
  const host = hostOf(url);
  const path = pathOf(url);
  if (hostIs(host, VIDEO_HOSTS) || VIDEO_EXTENSION.test(path)) {
    return 'video';
  }
  if (hostIs(host, IMAGE_HOSTS) || IMAGE_EXTENSION.test(path)) {
    return 'image';
  }
  return 'link';
}

function urlEmbed(url: string): HubEmbed | null {
  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }
  return { url: trimmed };
}

export function embedsFromCastBody(
  body: RawCastBody | null | undefined,
): HubEmbed[] {
  if (!body) {
    return [];
  }
  const embeds: HubEmbed[] = [];
  for (const embed of body.embeds ?? []) {
    if (!embed) {
      continue;
    }
    if (typeof embed.url === 'string') {
      const parsed = urlEmbed(embed.url);
      if (parsed) {
        embeds.push(parsed);
      }
      continue;
    }
    const fid = embed.castId?.fid;
    const hash = embed.castId?.hash;
    if (
      typeof fid === 'number' &&
      typeof hash === 'string' &&
      hash.length > 0
    ) {
      embeds.push({ castId: { fid, hash } });
    }
  }
  for (const deprecated of body.embedsDeprecated ?? []) {
    if (typeof deprecated === 'string') {
      const parsed = urlEmbed(deprecated);
      if (parsed) {
        embeds.push(parsed);
      }
    } else if (deprecated && typeof deprecated.url === 'string') {
      const parsed = urlEmbed(deprecated.url);
      if (parsed) {
        embeds.push(parsed);
      }
    }
  }
  return embeds;
}
