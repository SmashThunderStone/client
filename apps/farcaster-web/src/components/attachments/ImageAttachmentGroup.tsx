import classNames from 'classnames';
import { ApiMediaV2 } from 'farcaster-client-data';
import {
  CastClickType,
  processMediasForRendering,
  useTrackCastClick,
} from 'farcaster-client-hooks';
import React from 'react';

import { MeasuredCastImage } from '~/components/attachments/MeasuredCastImage';
import { Image as ImageRenderComponent } from '~/components/images/Image';
import { useFullScreenImages } from '~/hooks/casts/useCastBody';

type ImageAttachmentGroupProps = {
  medias: ApiMediaV2[];
  height?: number;
  width?: number;
  maxWidth?: number;
  ignoreAspectRatio: boolean;
  carouselIndex?: number;
  /** @deprecated when `snapContext` is false — pre-snap casts ignore this. */
  noShrink?: boolean;
  /**
   * Post-snap carousel/flex behavior (#9602). Pre-snap cast bodies pass `false`
   * to restore e27118ec3 image chrome + sizing.
   */
  snapContext?: boolean;
};

const ImageAttachmentGroup: React.FC<ImageAttachmentGroupProps> = React.memo(
  ({
    medias,
    height,
    width,
    maxWidth,
    ignoreAspectRatio,
    carouselIndex,
    noShrink,
    snapContext = false,
  }) => {
    const trackCastClick = useTrackCastClick();

    const { open } = useFullScreenImages();

    const imagesToRender = React.useMemo(() => {
      const knownIndexes: number[] = [];
      const knownMedias = medias.filter((media, index) => {
        if (media.width > 0 && media.height > 0) {
          knownIndexes.push(index);
          return true;
        }
        return false;
      });
      // Hard-code web client pixel density to 3 for now since users are
      // reporting some blurry rendering with pixelDensity of < 3.
      const processed = processMediasForRendering({
        medias: knownMedias,
        pixelDensity: 3,
        blockAnimated: false,
        increasedWidth: true,
      });
      const byIndex = new Map<number, (typeof processed)[number]>();
      processed.forEach((image, index) => {
        byIndex.set(knownIndexes[index], image);
      });
      return byIndex;
    }, [medias]);

    // In a mixed carousel (image next to a snap/OG), use the shared tile height
    // instead of stretching to the row. Snap cards can expand vertically, and
    // sibling media should not grow with that expanded row.
    const fillTile = snapContext && noShrink && ignoreAspectRatio;

    const openImage = (event: React.MouseEvent, imageIndex: number) => {
      trackCastClick({ type: CastClickType.Image });
      event.stopPropagation();
      open?.({ initialIndex: carouselIndex ?? imageIndex });
    };

    return (
      <>
        {medias.map((media, imageIndex) => {
          const image = imagesToRender.get(imageIndex);
          if (!image) {
            return (
              <MeasuredCastImage
                key={`${media.staticRaster}-${imageIndex}`}
                src={media.staticRaster}
                maxWidth={maxWidth ?? width}
                row={typeof height === 'number'}
                rowHeight={height}
                onClick={(event) => {
                  openImage(event, imageIndex);
                }}
                onMouseOver={() => {
                  const imageToPreload = new Image();
                  imageToPreload.src = media.staticRaster;
                }}
              />
            );
          }
          if (!snapContext) {
            return (
              <ImageRenderComponent
                key={imageIndex}
                className={
                  'relative max-w-full rounded-[12px] border object-cover object-left bg-elevated border-default'
                }
                style={{
                  maxHeight: height,
                  height: ignoreAspectRatio ? height : undefined,
                  width,
                  maxWidth,
                  aspectRatio: image.aspectRatio,
                }}
                src={image.thumbnail}
                draggable={false}
                alt={'Cast image embed'}
                loading="lazy"
                onClick={(e) => {
                  trackCastClick({ type: CastClickType.Image });

                  e.stopPropagation();

                  open?.({ initialIndex: carouselIndex || 0 });
                }}
                onMouseOver={() => {
                  const imageToPreload = new Image();
                  imageToPreload.src = image.original;
                }}
              />
            );
          }

          return (
            <ImageRenderComponent
              key={imageIndex}
              className={classNames(
                'relative max-w-full rounded-[12px] border object-cover bg-elevated border-default',
                fillTile
                  ? 'shrink-0 object-center'
                  : noShrink
                    ? 'shrink-0 object-center'
                    : 'min-w-0 object-left',
              )}
              style={{
                maxHeight: height,
                height,
                width,
                maxWidth: fillTile ? width : maxWidth,
                aspectRatio: fillTile ? undefined : image.aspectRatio,
              }}
              src={image.thumbnail}
              draggable={false}
              alt={'Cast image embed'}
              loading="lazy"
              onClick={(e) => {
                trackCastClick({ type: CastClickType.Image });

                e.stopPropagation();

                open?.({ initialIndex: carouselIndex || 0 });
              }}
              onMouseOver={() => {
                const imageToPreload = new Image();
                imageToPreload.src = image.original;
              }}
            />
          );
        })}
      </>
    );
  },
);

ImageAttachmentGroup.displayName = 'ImageAttachmentGroup';

export { ImageAttachmentGroup };
