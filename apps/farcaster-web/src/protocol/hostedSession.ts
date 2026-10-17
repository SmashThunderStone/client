export const HOSTED_SESSION_NOTICE_KEY = 'smashcast.hostedSessionNotice';

export function markHostedSessionCleared() {
  try {
    sessionStorage.setItem(HOSTED_SESSION_NOTICE_KEY, '1');
  } catch {
    // Session storage can be blocked. The token is still cleared.
  }
}

export function hostedSessionNoticePending(): boolean {
  try {
    return sessionStorage.getItem(HOSTED_SESSION_NOTICE_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissHostedSessionNotice() {
  try {
    sessionStorage.removeItem(HOSTED_SESSION_NOTICE_KEY);
  } catch {
    // Ignore a blocked storage write. The banner can close in memory.
  }
}
