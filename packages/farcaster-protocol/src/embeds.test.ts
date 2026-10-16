import { describe, expect, it } from 'vitest';

import { classifyEmbedUrl, embedsFromCastBody } from './embeds';

describe('classifyEmbedUrl', () => {
  it('treats Farcaster Cloudflare images with no extension as images', () => {
    expect(
      classifyEmbedUrl(
        'https://imagedelivery.net/BXluQx4ige9GuW0Ia56BHw/ee8182fa-c3eb-4010-2481-81dbb93b2d00/original',
      ),
    ).toBe('image');
  });

  it('treats imgur and the Warpcast CDN as images', () => {
    expect(classifyEmbedUrl('https://i.imgur.com/abc123')).toBe('image');
    expect(
      classifyEmbedUrl(
        'https://wrpcd.net/cdn-cgi/imagedelivery/BXluQx4ige9GuW0Ia56BHw/ee8182fa/original',
      ),
    ).toBe('image');
  });

  it('treats image extensions as images and ignores the query string', () => {
    expect(classifyEmbedUrl('https://example.com/photo.PNG?size=large')).toBe(
      'image',
    );
    expect(classifyEmbedUrl('https://cdn.example.com/a/b.jpeg')).toBe('image');
    expect(classifyEmbedUrl('https://cdn.example.com/a/b.gif')).toBe('image');
    expect(classifyEmbedUrl('https://cdn.example.com/a/b.webp')).toBe('image');
  });

  it('treats stream.farcaster.xyz and video extensions as video', () => {
    expect(
      classifyEmbedUrl(
        'https://stream.farcaster.xyz/v1/video/01a0da54-1694-ab35-3396-7e58bb2cc394.m3u8',
      ),
    ).toBe('video');
    expect(classifyEmbedUrl('https://cdn.example.com/clip.mp4')).toBe('video');
    expect(classifyEmbedUrl('https://cdn.example.com/clip.webm?x=1')).toBe(
      'video',
    );
  });

  it('leaves unknown urls as links', () => {
    expect(
      classifyEmbedUrl('https://www.imdb.com/title/tt0387808?ref_=ext_shr_lnk'),
    ).toBe('link');
    expect(
      classifyEmbedUrl(
        'https://x.com/SmashThndrStone/status/2097543009374224767?s=20',
      ),
    ).toBe('link');
  });
});

describe('embedsFromCastBody', () => {
  it('keeps url embeds and castId quotes', () => {
    expect(
      embedsFromCastBody({
        embeds: [
          {
            url: 'https://imagedelivery.net/BXluQx4ige9GuW0Ia56BHw/abc/original',
          },
          {
            castId: {
              fid: 218142,
              hash: '0x01afacae137caa4168c3b3ff33925518974ea857',
            },
          },
        ],
        embedsDeprecated: ['https://example.com/old.jpg'],
      }),
    ).toEqual([
      {
        url: 'https://imagedelivery.net/BXluQx4ige9GuW0Ia56BHw/abc/original',
      },
      {
        castId: {
          fid: 218142,
          hash: '0x01afacae137caa4168c3b3ff33925518974ea857',
        },
      },
      { url: 'https://example.com/old.jpg' },
    ]);
  });
});
