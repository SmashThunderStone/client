import { FC, memo } from 'react';

import { DefaultButton } from '~/components/forms/buttons/DefaultButton';
import {
  getErrorDescription,
  isProtocolDirectAuthMiss,
} from '~/utils/errorUtils';

type PageErrorFallbackProps = {
  error: Error;
  resetErrorBoundary: () => void;
};

const PageErrorFallback: FC<PageErrorFallbackProps> = memo(
  ({ error, resetErrorBoundary }) => {
    if (isProtocolDirectAuthMiss(error)) {
      return (
        <div className="flex flex-col items-center px-6 pt-20 text-center text-default">
          <div className="mb-2 text-lg font-semibold">
            Not available in SmashCast direct mode
          </div>
          <div className="max-w-md text-sm text-muted">
            This screen uses the hosted Farcaster app. Your casts, likes, and
            follows still go straight to Snapchain.
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center pt-20">
        <div className="mb-4">{getErrorDescription(error)}</div>
        <DefaultButton
          className="min-w-[140px]"
          onClick={() => {
            resetErrorBoundary();
          }}
        >
          Try again
        </DefaultButton>
      </div>
    );
  },
);

PageErrorFallback.displayName = 'PageErrorFallback';

export { PageErrorFallback };
