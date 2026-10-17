import { getCloudflareImageUrl } from 'farcaster-client-hooks';
import React from 'react';

import { castImageFrame } from '~/components/attachments/castImageFrame';

type MeasuredCastImageProps = {
  src: string;
  maxWidth?: number;
  row: boolean;
  rowHeight?: number;
  onClick: (event: React.MouseEvent<HTMLImageElement>) => void;
  onMouseOver: () => void;
};

const MeasuredCastImage: React.FC<MeasuredCastImageProps> = ({
  src,
  maxWidth,
  row,
  rowHeight,
  onClick,
  onMouseOver,
}) => {
  const [ratio, setRatio] = React.useState<number | null>(null);
  const [columnWidth, setColumnWidth] = React.useState(
    maxWidth && maxWidth > 0 ? maxWidth : 560,
  );
  const displaySrc = React.useMemo(
    () =>
      getCloudflareImageUrl({
        url: src,
        windowWidth: 1200,
        width: 1200,
        blockAnimated: false,
        applyWidthLimits: true,
      }),
    [src],
  );
  const frame = castImageFrame({
    columnWidth,
    ratio,
    row,
    rowHeight,
  });

  return (
    <img
      className={
        row
          ? 'relative shrink-0 rounded-[12px] border object-contain object-center bg-elevated border-default'
          : 'relative max-w-full rounded-[12px] border object-contain object-center bg-elevated border-default'
      }
      style={
        ratio
          ? {
              width: row ? frame.width : '100%',
              maxWidth: row ? frame.width : maxWidth,
              height: frame.height,
              objectFit: 'contain',
            }
          : row
            ? {
                width: frame.height,
                height: frame.height,
                objectFit: 'contain',
              }
            : {
                width: '100%',
                maxWidth,
                height: frame.height,
                objectFit: 'contain',
              }
      }
      src={displaySrc}
      draggable={false}
      alt="Cast image embed"
      loading="lazy"
      onLoad={(event) => {
        const image = event.currentTarget;
        if (image.naturalWidth > 0 && image.naturalHeight > 0) {
          if (!row && image.clientWidth > 0) {
            setColumnWidth(image.clientWidth);
          }
          setRatio(image.naturalWidth / image.naturalHeight);
        }
      }}
      onClick={onClick}
      onMouseOver={onMouseOver}
    />
  );
};

MeasuredCastImage.displayName = 'MeasuredCastImage';

export { MeasuredCastImage };
