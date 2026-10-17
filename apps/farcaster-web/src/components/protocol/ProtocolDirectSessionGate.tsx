import { FC, useEffect, useState } from 'react';

import { LoginModal } from '~/components/modals/LoginModal';
import { protocolDirectEnabled } from '~/constants/protocol';
import {
  dismissHostedSessionNotice,
  hostedSessionNoticePending,
} from '~/protocol/hostedSession';
import { subscribeProtocolSignIn } from '~/protocol/signInPrompt';

const ProtocolDirectSessionGate: FC = () => {
  const [notice, setNotice] = useState(hostedSessionNoticePending);
  const [signInOpen, setSignInOpen] = useState(false);

  useEffect(() => {
    if (!protocolDirectEnabled) {
      return;
    }
    return subscribeProtocolSignIn(() => setSignInOpen(true));
  }, []);

  if (!protocolDirectEnabled) {
    return null;
  }

  return (
    <>
      {notice && (
        <div
          role="status"
          className="fixed inset-x-0 top-0 z-[80] flex flex-wrap items-center justify-center gap-3 border-b border-white/15 bg-[#141414] px-4 py-3 text-sm text-white"
        >
          <p>
            SmashCast cleared a saved Farcaster login from this browser. Connect
            your custody wallet to like and cast.
          </p>
          <button
            type="button"
            className="rounded-full bg-[var(--smashcast-red)] px-3 py-1.5 text-sm font-semibold text-white"
            onClick={() => setSignInOpen(true)}
          >
            Connect wallet
          </button>
          <button
            type="button"
            className="rounded-full px-3 py-1.5 text-sm text-white/80"
            onClick={() => {
              dismissHostedSessionNotice();
              setNotice(false);
            }}
          >
            Dismiss
          </button>
        </div>
      )}
      {signInOpen && <LoginModal onClose={() => setSignInOpen(false)} />}
    </>
  );
};

ProtocolDirectSessionGate.displayName = 'ProtocolDirectSessionGate';

export { ProtocolDirectSessionGate };
