import { describe, expect, it } from 'vitest';

import { addedActorEvents } from './notifications';

describe('addedActorEvents', () => {
  it('drops the subject and a like that was removed', () => {
    const events = addedActorEvents(
      [
        {
          kind: 'remove',
          actorFid: 9,
          targetKey: '0xabc',
          hash: '0xremove',
          timestampMs: 300,
        },
        {
          kind: 'add',
          actorFid: 9,
          targetKey: '0xabc',
          hash: '0xadd',
          timestampMs: 200,
        },
        {
          kind: 'add',
          actorFid: 4,
          targetKey: '0xabc',
          hash: '0xkeep',
          timestampMs: 100,
        },
        {
          kind: 'add',
          actorFid: 1,
          targetKey: '0xabc',
          hash: '0xself',
          timestampMs: 50,
        },
      ],
      1,
    );
    expect(events.map((event) => event.hash)).toEqual(['0xkeep']);
  });
});
