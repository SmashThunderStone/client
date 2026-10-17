import { isFarcasterApiError } from 'farcaster-client-data';

import { protocolDirectEnabled } from '~/constants/protocol';
import { logError } from '~/utils/logUtils';

const isProtocolDirectAuthMiss = (error: unknown) =>
  protocolDirectEnabled && isFarcasterApiError(error) && error.status === 401;

const getErrorDescription = (error: unknown) => {
  if (isProtocolDirectAuthMiss(error)) {
    return 'Not available in SmashCast direct mode.';
  }

  if (isFarcasterApiError(error)) {
    if (error.isNetworkError) {
      return 'Could not reach Farcaster. Check your connection.';
    }
    if (error.hasTimedOut) {
      return 'Receiving data from Farcaster is taking too long. Check your connection.';
    }

    return 'Error retrieving data. Please try again.';
  }

  return 'We encountered an unexpected error.';
};

const trackError = (error: unknown) => {
  if (import.meta.env.MODE === 'development') {
    logError(error);
  }
};

export { getErrorDescription, isProtocolDirectAuthMiss, trackError };
