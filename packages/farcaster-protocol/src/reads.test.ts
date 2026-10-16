import { describe, expect, it } from 'vitest';

import { HubCast, selectFeedCasts } from './reads';

function cast(hash: string, timestampMs: number): HubCast {
  return { hash, fid: 1, text: hash, timestampMs };
}

describe('selectFeedCasts', () => {
  it('drops casts whose id prefix was already shown', () => {
    const casts = [
      cast('0xaaaa111122223333444455556666777788889999', 300),
      cast('0xbbbb111122223333444455556666777788889999', 200),
      cast('0xcccc111122223333444455556666777788889999', 100),
    ];
    const page = selectFeedCasts(casts, {
      excludePrefixes: ['aaaa1111'],
      limit: 2,
    });
    expect(page.map((item) => item.hash.slice(0, 6))).toEqual([
      '0xbbbb',
      '0xcccc',
    ]);
  });
});
