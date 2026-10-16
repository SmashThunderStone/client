import { FC, memo } from 'react';

import { SmashCastMark } from '~/brand/SmashCastMark';

type Size = 'xs' | 'sm' | 'md' | 'lg';

type FilledLogoProps = {
  size?: Size;
  fill?: string;
};

const sizeCn: Record<Size, string> = {
  xs: '24',
  sm: '32',
  md: '42',
  lg: '64',
};

const FilledLogo: FC<FilledLogoProps> = memo(({ size = 'sm' }) => {
  return <SmashCastMark size={Number(sizeCn[size])} />;
});

FilledLogo.displayName = 'FilledLogo';

export { FilledLogo };
