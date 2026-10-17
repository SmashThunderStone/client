import { describe, expect, it } from 'vitest';

import { castImageFrame } from './castImageFrame';

const COLUMN = 560;

describe('castImageFrame', () => {
  it('shows a 4:3 landscape photo at its natural ratio', () => {
    const frame = castImageFrame({
      columnWidth: COLUMN,
      ratio: 4 / 3,
      row: false,
    });
    expect(frame.letterbox).toBe(false);
    expect(frame.width).toBe(COLUMN);
    expect(frame.height).toBe(Math.round(COLUMN / (4 / 3)));
    expect(frame.width / frame.height).toBeCloseTo(4 / 3, 2);
  });

  it('shows a square photo as a square', () => {
    const frame = castImageFrame({
      columnWidth: COLUMN,
      ratio: 1,
      row: false,
    });
    expect(frame.letterbox).toBe(false);
    expect(frame.width).toBe(frame.height);
  });

  it('shows a 3:4 portrait photo without cropping', () => {
    const frame = castImageFrame({
      columnWidth: COLUMN,
      ratio: 3 / 4,
      row: false,
    });
    expect(frame.letterbox).toBe(false);
    expect(frame.width / frame.height).toBeCloseTo(3 / 4, 2);
  });

  it('letterboxes a very tall photo inside a max height', () => {
    const frame = castImageFrame({
      columnWidth: COLUMN,
      ratio: 9 / 16,
      row: false,
    });
    expect(frame.letterbox).toBe(true);
    expect(frame.height).toBe(Math.round(COLUMN * 1.35));
    expect(frame.width).toBe(COLUMN);
  });

  it('gives each image in a row its own width', () => {
    const landscape = castImageFrame({
      columnWidth: COLUMN,
      ratio: 4 / 3,
      row: true,
      rowHeight: 360,
    });
    const square = castImageFrame({
      columnWidth: COLUMN,
      ratio: 1,
      row: true,
      rowHeight: 360,
    });
    const portrait = castImageFrame({
      columnWidth: COLUMN,
      ratio: 3 / 4,
      row: true,
      rowHeight: 360,
    });
    expect(landscape.letterbox).toBe(false);
    expect(square.letterbox).toBe(false);
    expect(portrait.letterbox).toBe(false);
    expect(landscape.width).toBeGreaterThan(square.width);
    expect(square.width).toBeGreaterThan(portrait.width);
    expect(landscape.height).toBe(square.height);
  });
});
