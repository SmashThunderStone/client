import { FC, memo } from 'react';

import { LoginWithMobile } from '~/components/login/LoginWithMobile';
import { LoginWithWallet } from '~/components/login/LoginWithWallet';
import { DefaultModalContainer } from '~/components/modals/DefaultModalContainer';
import { Modal } from '~/components/modals/Modal';
import { protocolDirectEnabled } from '~/constants/protocol';

type LoginModalProps = {
  onClose: () => void;
};

const LoginModal: FC<LoginModalProps> = memo(({ onClose }) => {
  return (
    <Modal>
      <DefaultModalContainer onClose={onClose}>
        <div className="flex size-full flex-col items-center justify-center p-4">
          <div
            className="relative flex w-full max-w-md flex-col items-start justify-center rounded-[12px] bg-[#141414] p-4"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            {protocolDirectEnabled && (
              <>
                <LoginWithWallet onClose={onClose} />
                <div className="my-4 h-px w-full bg-white/15" />
              </>
            )}
            <LoginWithMobile onClose={onClose} />
          </div>
        </div>
      </DefaultModalContainer>
    </Modal>
  );
});

LoginModal.displayName = 'LoginModal';

export { LoginModal };
