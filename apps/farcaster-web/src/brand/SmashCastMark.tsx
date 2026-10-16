import cn from 'classnames';
import { FC } from 'react';

import { BRAND_RED } from '~/brand/brand';

type SmashCastMarkProps = {
  size?: number;
  tile?: string;
  bolt?: string;
};

/** Red rounded tile with a white lightning bolt. Swap this file to change the mark. */
const SmashCastMark: FC<SmashCastMarkProps> = ({
  size = 32,
  tile = BRAND_RED,
  bolt = '#FFFFFF',
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="7" fill={tile} />
      <path
        d="M18.7 4.1 8.4 16.7h6.4l-2.8 11.2 11.2-14.4h-6.3L18.7 4.1Z"
        fill={bolt}
      />
    </svg>
  );
};

type SmashCastWordmarkProps = {
  className?: string;
  markSize?: number;
};

/** Mark plus the SmashCast name. Text color follows `currentColor`. */
const SmashCastWordmark: FC<SmashCastWordmarkProps> = ({
  className,
  markSize = 28,
}) => {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <SmashCastMark size={markSize} />
      <span className="text-[22px] font-semibold leading-none tracking-tight">
        SmashCast
      </span>
    </span>
  );
};

export { SmashCastMark, SmashCastWordmark };
