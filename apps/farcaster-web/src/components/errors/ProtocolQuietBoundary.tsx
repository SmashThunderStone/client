import { FC, ReactNode } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { protocolDirectEnabled } from '~/constants/protocol';

type ProtocolQuietBoundaryProps = {
  children: ReactNode;
};

/**
 * Sidebar and widget queries must not replace the signed-in shell when the
 * hosted API has no token. Flag-off builds render children directly.
 */
const ProtocolQuietBoundary: FC<ProtocolQuietBoundaryProps> = ({
  children,
}) => {
  if (!protocolDirectEnabled) {
    return children;
  }

  return (
    <ErrorBoundary
      fallbackRender={({ error }) => {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.error(error);
        }
        return null;
      }}
    >
      {children}
    </ErrorBoundary>
  );
};

ProtocolQuietBoundary.displayName = 'ProtocolQuietBoundary';

export { ProtocolQuietBoundary };
