/** Taller than this (height / width) is letterboxed instead of growing the feed. */
const MAX_HEIGHT_TO_WIDTH = 1.35;

/** In a multi-image row, tiles narrower than this are letterboxed. */
const MIN_ROW_RATIO = 0.7;

const ROW_HEIGHT_CAP = 400;

type CastImageFrame = {
  width: number;
  height: number;
  letterbox: boolean;
};

function castImageFrame({
  columnWidth,
  ratio,
  row,
  rowHeight,
}: {
  columnWidth: number;
  ratio: number | null;
  row: boolean;
  rowHeight?: number;
}): CastImageFrame {
  if (row) {
    const height = Math.min(
      rowHeight && rowHeight > 0 ? rowHeight : ROW_HEIGHT_CAP,
      ROW_HEIGHT_CAP,
    );
    if (!ratio || ratio <= 0) {
      return { width: height, height, letterbox: false };
    }
    if (ratio < MIN_ROW_RATIO) {
      return {
        width: Math.round(height * MIN_ROW_RATIO),
        height,
        letterbox: true,
      };
    }
    return { width: Math.round(height * ratio), height, letterbox: false };
  }

  const width = Math.max(columnWidth, 1);
  if (!ratio || ratio <= 0) {
    return {
      width,
      height: Math.round(width / (4 / 3)),
      letterbox: false,
    };
  }
  const naturalHeight = width / ratio;
  const maxHeight = width * MAX_HEIGHT_TO_WIDTH;
  if (naturalHeight > maxHeight) {
    return { width, height: Math.round(maxHeight), letterbox: true };
  }
  return { width, height: Math.round(naturalHeight), letterbox: false };
}

export { castImageFrame, MAX_HEIGHT_TO_WIDTH };
