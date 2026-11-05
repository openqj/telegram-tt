import { memo, useEffect, useRef } from '../../../lib/teact/teact';
import { getGlobal } from '../../../global';

import type { ApiAgentWorkspaceFile, ApiAgentWorkspaceSkill, ApiUser } from '../../../api/types';

import buildClassName from '../../../util/buildClassName';

import useFrozenProps from '../../../hooks/useFrozenProps';
import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';

import ListItem from '../../ui/ListItem';
import Icon from '../icons/Icon';
import PrivateChatInfo from '../PrivateChatInfo';
import RichEditorTooltipPanel from './RichEditorTooltipPanel';

import styles from './MentionTooltip.module.scss';
import sharedStyles from './RichEditorTooltip.module.scss';

export type OwnProps = {
  isOpen: boolean;
  selectedIndex: number;
  onInsertUserName: (user: ApiUser, forceFocus?: boolean) => void;
  filteredUsers?: ApiUser[];
  filteredFiles?: ApiAgentWorkspaceFile[];
  filteredSkills?: ApiAgentWorkspaceSkill[];
  isLoading?: boolean;
  showEmptyState?: boolean;
  onInsertWorkspaceFile: (file: ApiAgentWorkspaceFile) => void;
  onInsertWorkspaceSkill: (skill: ApiAgentWorkspaceSkill) => void;
};

const MentionTooltip = ({ isOpen, ...props }: OwnProps) => {
  const lang = useLang();
  const {
    selectedIndex,
    onInsertUserName,
    filteredUsers,
    filteredFiles,
    filteredSkills,
    isLoading,
    showEmptyState,
    onInsertWorkspaceFile,
    onInsertWorkspaceSkill,
  } = useFrozenProps(props, !isOpen);

  const containerRef = useRef<HTMLDivElement>();

  const handleUserSelect = useLastCallback((userId: string, forceFocus = false) => {
    // No need for expensive global updates on users, so we avoid them
    const usersById = getGlobal().users.byId;
    const user = usersById[userId];
    if (!user) {
      return;
    }

    onInsertUserName(user, forceFocus);
  });

  const handleClick = useLastCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();

    handleUserSelect(id);
  });
  const handleFileClick = useLastCallback((e: React.MouseEvent, file: ApiAgentWorkspaceFile) => {
    e.preventDefault();
    onInsertWorkspaceFile(file);
  });
  const handleSkillClick = useLastCallback((e: React.MouseEvent, skill: ApiAgentWorkspaceSkill) => {
    e.preventDefault();
    onInsertWorkspaceSkill(skill);
  });

  useEffect(() => {
    containerRef.current?.querySelector<HTMLElement>('.focus')?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const isEmpty = !filteredUsers?.length && !filteredFiles?.length && !filteredSkills?.length;

  if (isEmpty && !showEmptyState) {
    return undefined;
  }

  return (
    <RichEditorTooltipPanel isOpen={isOpen}>
      <div
        ref={containerRef}
        className={buildClassName(sharedStyles.root, styles.root, 'composer-tooltip custom-scroll')}
      >
        {filteredUsers?.map(({ id }, index) => (
          <ListItem
            key={id}
            className="chat-item-clickable scroll-item smaller-icon"
            onClick={handleClick}
            clickArg={id}
            focus={selectedIndex === index}
          >
            <PrivateChatInfo
              userId={id}
              avatarSize="small"
              withUsername
              noUserStatus
            />
          </ListItem>
        ))}
        {filteredFiles?.map((file, index) => (
          <ListItem
            key={file.path}
            className="chat-item-clickable scroll-item smaller-icon"
            onClick={handleFileClick}
            clickArg={file}
            focus={selectedIndex - (filteredUsers?.length || 0) === index}
          >
            <Icon name={file.kind === 'directory' ? 'folder' : 'document'} />
            <div className="info">
              <span className="title">{file.path}</span>
              <span className="subtitle">{file.kind}</span>
            </div>
          </ListItem>
        ))}
        {filteredSkills?.map((skill, index) => (
          <ListItem
            key={skill.path}
            className="chat-item-clickable scroll-item smaller-icon"
            onClick={handleSkillClick}
            clickArg={skill}
            focus={selectedIndex - (filteredUsers?.length || 0) - (filteredFiles?.length || 0) === index}
          >
            <Icon name="document" />
            <div className="info">
              <span className="title">
                &#47;&#47;
                {skill.name}
              </span>
              <span className="subtitle">{skill.path}</span>
            </div>
          </ListItem>
        ))}
        {isEmpty && isLoading && (
          <div className={styles.empty}>
            {lang('Loading')}
          </div>
        )}
        {isEmpty && !isLoading && (
          <div className={styles.empty}>
            {filteredSkills
              ? lang('AgentWorkspaceNoSkills')
              : filteredFiles
                ? lang('AgentWorkspaceNoFiles')
                : lang('NothingFound')}
          </div>
        )}
      </div>
    </RichEditorTooltipPanel>
  );
};

export default memo(MentionTooltip);
