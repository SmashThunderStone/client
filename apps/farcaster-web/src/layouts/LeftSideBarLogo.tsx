import { FC, memo } from 'react';

import { APP_NAME } from '~/brand/brand';
import { FilledLogo } from '~/components/FilledLogo';
import { LinkToHomeFeed } from '~/components/links/LinkToHomeFeed';
import { LogoBrandContextMenu } from '~/components/LogoBrandContextMenu';
import { useScrollToTopOfRoot } from '~/hooks/useScrollToTopOfRoot';

type LeftSideBarLogoProps = {
  title: string;
};

const LeftSideBarLogo: FC<LeftSideBarLogoProps> = memo(({ title }) => {
  const scrollToTopOfRoot = useScrollToTopOfRoot();

  return (
    <LogoBrandContextMenu>
      <LinkToHomeFeed
        title={title}
        className="mx-1 flex items-center "
        onClick={() => {
          scrollToTopOfRoot();
        }}
      >
        <div className="flex h-14 items-center justify-center gap-2 md:items-start">
          <FilledLogo size="xs" />
          <span className="hidden text-[17px] font-semibold tracking-tight xl:inline">
            {APP_NAME}
          </span>
        </div>
      </LinkToHomeFeed>
    </LogoBrandContextMenu>
  );
});

LeftSideBarLogo.displayName = 'LeftSideBarLogo';

export { LeftSideBarLogo };
