import { describe, expect, it } from 'vitest';

import {
  hubHashParam,
  isTerminalPageToken,
  lookupCastId,
  lookupFidForHash,
  rememberCastId,
  tallyReactions,
} from './engagement';

describe('hubHashParam', () => {
  it('normalizes hex hashes to lowercase 0x form', () => {
    expect(hubHashParam('0x35F104E944DE03C93CC4EB513E8B84CEF58D9B77')).toBe(
      '0x35f104e944de03c93cc4eb513e8b84cef58d9b77',
    );
    expect(hubHashParam('35F104E944DE03C93CC4EB513E8B84CEF58D9B77')).toBe(
      '0x35f104e944de03c93cc4eb513e8b84cef58d9b77',
    );
    expect(hubHashParam('  0x35f104e944de03c93cc4eb513e8b84cef58d9b77  ')).toBe(
      '0x35f104e944de03c93cc4eb513e8b84cef58d9b77',
    );
  });

  it('leaves non-hex values untouched so callers can see a bad hash', () => {
    expect(hubHashParam('not-a-hash')).toBe('not-a-hash');
  });
});

describe('rememberCastId', () => {
  it('resolves a cast from its 0x prefix and from the bare hash', () => {
    rememberCastId(3, '0x35F104E944DE03C93CC4EB513E8B84CEF58D9B77');
    expect(lookupCastId(3, '0x35f104e9')).toEqual({
      fid: 3,
      hash: '0x35f104e944de03c93cc4eb513e8b84cef58d9b77',
    });
    expect(lookupFidForHash('35f104e944de03c93cc4eb513e8b84cef58d9b77')).toBe(
      3,
    );
  });
});

describe('isTerminalPageToken', () => {
  it('treats the haatz end sentinel as done and keeps real cursors', () => {
    expect(isTerminalPageToken(undefined)).toBe(true);
    expect(isTerminalPageToken('')).toBe(true);
    expect(isTerminalPageToken(btoa('[null,null]'))).toBe(true);
    expect(isTerminalPageToken(btoa('[null,[4,1]]'))).toBe(false);
    expect(isTerminalPageToken(btoa('[[4,1],[4,2]]'))).toBe(false);
  });
});

describe('tallyReactions', () => {
  const add = (fid: number) => ({
    data: { type: 'MESSAGE_TYPE_REACTION_ADD', fid },
  });
  const remove = (fid: number) => ({
    data: { type: 'MESSAGE_TYPE_REACTION_REMOVE', fid },
  });

  it('counts the newest add per fid and marks the viewer', () => {
    const tally = tallyReactions([add(3), add(9), add(3)], 9);
    expect(tally).toEqual({ count: 2, viewer: true });
  });

  it('lets a newer remove cancel an older add', () => {
    const tally = tallyReactions([remove(9), add(9), add(4)], 9);
    expect(tally).toEqual({ count: 1, viewer: false });
  });
});
