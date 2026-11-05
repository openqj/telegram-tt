import { memo } from '../../../lib/teact/teact';
import { getActions } from '../../../global';

import MenuItem from '../../ui/MenuItem';

type OwnProps = {
  username: string;
  title: string;
};

export function AgentChatMenuItem({ username, title }: OwnProps) {
  const { openChatByUsername } = getActions();

  return (
    <MenuItem icon="ai" onClick={() => openChatByUsername({ username })}>
      {title}
    </MenuItem>
  );
}

export default memo(AgentChatMenuItem);
