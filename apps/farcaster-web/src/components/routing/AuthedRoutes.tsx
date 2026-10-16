import { FC } from 'react';
import { Navigate, Outlet } from 'react-router-dom';

import { defaultRoute } from '~/constants/routes';
import { useProtocolHydrated } from '~/contexts/ProtocolSessionProvider';
import { useIsSignedIn } from '~/hooks/data/useIsSignedIn';

// https://www.youtube.com/watch?v=2k8NleFjG7I&t=438s
const AuthedRoutes: FC = () => {
  const isSignedIn = useIsSignedIn();
  const protocolHydrated = useProtocolHydrated();

  if (!protocolHydrated) {
    return null;
  }

  if (!isSignedIn) {
    return <Navigate to={defaultRoute.path} />;
  }

  return <Outlet />;
};

AuthedRoutes.displayName = 'AuthedRoutes';

export { AuthedRoutes };
