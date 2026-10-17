import {
  isProtocolSignInRequired,
  isProtocolUnavailable,
  PROTOCOL_UNAVAILABLE_MESSAGE,
} from 'farcaster-client-hooks';

import { trackError } from '~/utils/errorUtils';

function presentProtocolWriteError(error: unknown): boolean {
  if (isProtocolSignInRequired(error)) {
    return true;
  }
  if (isProtocolUnavailable(error)) {
    alert(PROTOCOL_UNAVAILABLE_MESSAGE);
    return true;
  }
  return false;
}

function reportCastActionError(error: unknown) {
  if (presentProtocolWriteError(error)) {
    return;
  }
  trackError(error);
  alert(error);
}

export { presentProtocolWriteError, reportCastActionError };
