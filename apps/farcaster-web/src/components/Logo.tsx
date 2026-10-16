import { FC, memo } from 'react';

import { SmashCastMark } from '~/brand/SmashCastMark';

type Size = 'xs' | 'sm' | 'md' | 'lg';

type LogoProps = {
  size?: Size;
  fill?: string;
};

const sizeCn: Record<Size, string> = {
  xs: '24',
  sm: '32',
  md: '42',
  lg: '64',
};

const Logo: FC<LogoProps> = memo(({ size = 'sm', fill }) => {
  return <SmashCastMark size={Number(sizeCn[size])} tile={fill} />;
});

Logo.displayName = 'Logo';

export { Logo };
