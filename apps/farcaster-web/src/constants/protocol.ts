/**
 * Protocol-direct SmashCast is off unless the build sets this to "1".
 * The hosted API and QR login stay the default.
 */
export const protocolDirectEnabled =
  import.meta.env.VITE_PROTOCOL_DIRECT === '1';

/**
 * Snapchain HTTP base. Absolute URLs work when the hub sends
 * Access-Control-Allow-Origin. `/snap` is the same-origin Vercel rewrite.
 */
export const snapHubUrl = (
  import.meta.env.VITE_SNAP_API_BASE || 'https://haatz.quilibrium.com'
).replace(/\/$/, '');

export const walletConnectProjectId =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';
