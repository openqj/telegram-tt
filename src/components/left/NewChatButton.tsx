import {
  useCallback, useEffect, useMemo, useState,
} from '../../lib/teact/teact';
import { getActions } from '../../global';

import buildClassName from '../../util/buildClassName';

import useLang from '../../hooks/useLang';

import Icon from '../common/icons/Icon';
import Button from '../ui/Button';
import Menu from '../ui/Menu';
import MenuItem from '../ui/MenuItem';

import './NewChatButton.scss';

type OwnProps = {
  isShown: boolean;
  isAiList?: boolean;
  onNewPrivateChat: () => void;
  onNewChannel: () => void;
  onNewGroup: () => void;
  isAccountFrozen?: boolean;
};

const NewChatButton = ({
  isShown,
  isAiList,
  onNewPrivateChat,
  onNewChannel,
  onNewGroup,
  isAccountFrozen,
}: OwnProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { createNewAgentChat, openFrozenAccountModal } = getActions();

  const isMenuVisible = isMenuOpen && !isAiList;
  const shouldRender = isShown || isMenuVisible;

  useEffect(() => {
    if (!shouldRender || isAiList) {
      setIsMenuOpen(false);
    }
  }, [isAiList, shouldRender]);

  const lang = useLang();

  const fabClassName = buildClassName(
    'NewChatButton',
    shouldRender && 'revealed',
    isMenuVisible && 'menu-is-open',
  );

  const toggleIsMenuOpen = useCallback(() => {
    if (isAccountFrozen) {
      openFrozenAccountModal();
      return;
    }
    setIsMenuOpen(!isMenuOpen);
  }, [isMenuOpen, isAccountFrozen]);

  const handleClose = useCallback(() => {
    setIsMenuOpen(false);
  }, []);

  const handleCreateNewAgentChat = useCallback(() => {
    createNewAgentChat();
  }, [createNewAgentChat]);

  const handleButtonClick = useCallback(() => {
    if (isAiList) {
      handleCreateNewAgentChat();
      return;
    }
    toggleIsMenuOpen();
  }, [handleCreateNewAgentChat, isAiList, toggleIsMenuOpen]);

  const menuItems = useMemo(() => (
    <>
      <MenuItem icon="channel" onClick={onNewChannel}>{lang('NewChannel')}</MenuItem>
      <MenuItem icon="group" onClick={onNewGroup}>{lang('NewGroup')}</MenuItem>
      <MenuItem icon="user" onClick={onNewPrivateChat}>{lang('NewMessageTitle')}</MenuItem>
      <MenuItem icon="ai" onClick={handleCreateNewAgentChat}>{lang('NewAgent')}</MenuItem>
    </>
  ), [lang, onNewChannel, onNewGroup, onNewPrivateChat, handleCreateNewAgentChat]);

  return (
    <div className={fabClassName} dir={lang.isRtl ? 'rtl' : undefined}>
      <Button
        round
        color="primary"
        className={isMenuVisible ? 'active' : ''}
        onClick={handleButtonClick}
        ariaLabel={lang(isMenuVisible ? 'Close' : isAiList ? 'NewAgent' : 'NewMessageTitle')}
        tabIndex={-1}
      >
        <Icon name="new-chat-filled" />
        <Icon name="close" />
      </Button>
      <Menu
        isOpen={isMenuVisible}
        positionX={lang.isRtl ? 'left' : 'right'}
        positionY="bottom"
        autoClose
        onClose={handleClose}
      >
        {menuItems}
      </Menu>
    </div>
  );
};

export default NewChatButton;
