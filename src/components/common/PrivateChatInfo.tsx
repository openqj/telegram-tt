import { memo, useEffect, useMemo } from '../../lib/teact/teact';
import { getActions, withGlobal } from '../../global';

import type {
  ApiChatMember, ApiMessage, ApiTopic, ApiTypingStatus, ApiUser, ApiUserStatus,
} from '../../api/types';
import type { CustomPeer, StoryViewerOrigin, ThreadId } from '../../types';
import type { IconName } from '../../types/icons';
import { MediaViewerOrigin } from '../../types';

import {
  getMainUsername, getUserStatus, isSystemBot, isUserOnline,
} from '../../global/helpers';
import { getMessageText } from '../../global/helpers/messages';
import {
  selectChatMessages,
  selectTopic,
  selectUser,
  selectUserStatus,
} from '../../global/selectors';
import { selectThreadMessagesCount } from '../../global/selectors/threads';
import buildClassName from '../../util/buildClassName';
import { getServerTime } from '../../util/serverTime';
import { hasRank } from './helpers/chatMember';
import { REM } from './helpers/mediaDimensions';
import renderText from './helpers/renderText';

import useIntervalForceUpdate from '../../hooks/schedulers/useIntervalForceUpdate';
import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';

import RippleEffect from '../ui/RippleEffect';
import Transition from '../ui/Transition';
import Avatar from './Avatar';
import DotAnimation from './DotAnimation';
import FullNameTitle from './FullNameTitle';
import Icon from './icons/Icon';
import RankBadge from './RankBadge';
import TopicIcon from './TopicIcon';
import TypingStatus from './TypingStatus';

const TOPIC_ICON_SIZE = 2.5 * REM;

type BaseOwnProps = {
  typingStatusByPeerId?: Record<string, ApiTypingStatus>;
  avatarSize?: 'tiny' | 'small' | 'medium' | 'large' | 'jumbo';
  forceShowSelf?: boolean;
  status?: string;
  statusIcon?: IconName;
  ripple?: boolean;
  withDots?: boolean;
  withMediaViewer?: boolean;
  withUsername?: boolean;
  withStory?: boolean;
  withFullInfo?: boolean;
  withUpdatingStatus?: boolean;
  storyViewerOrigin?: StoryViewerOrigin;
  noEmojiStatus?: boolean;
  noFake?: boolean;
  noVerified?: boolean;
  emojiStatusSize?: number;
  noStatusOrTyping?: boolean;
  noUserStatus?: boolean;
  noRtl?: boolean;
  chatMemberOriginId?: string;
  chatMember?: ApiChatMember;
  isSavedDialog?: boolean;
  noAvatar?: boolean;
  className?: string;
  iconElement?: React.ReactNode;
  rightElement?: React.ReactNode;
  onClick?: VoidFunction;
  onEmojiStatusClick?: VoidFunction;
};

type OwnProps = BaseOwnProps & ({
  userId: string;
  threadId?: ThreadId;
  customPeer?: never;
} | {
  userId?: never;
  threadId?: never;
  customPeer: CustomPeer;
});

type StateProps = {
  user?: ApiUser;
  userStatus?: ApiUserStatus;
  agentBotUsernames?: string[];
  hermesAgentBotUsernames?: string[];
  agentActivity?: {
    text: string;
    timestamp: number;
  };
  self?: ApiUser;
  isSavedMessages?: boolean;
  areMessagesLoaded: boolean;
  isSynced?: boolean;
  topic?: ApiTopic;
  messagesCount?: number;
};

const UPDATE_INTERVAL = 1000 * 60; // 1 min
const AGENT_TASK_BUTTON_PREFIX = 'at1_';
const AGENT_ACTIVITY_STALE_AFTER = 10 * 60;
const AGENT_ACTIVITY_TEXT_PATTERN = new RegExp(
  '^(?:'
  + '正在(?:阅读|读取|编辑|修改|运行|执行|创建|查询|更新|派发|委派|分析|'
  + '查找|确认|检索|保存|调用|等待)(?:：|:)?'
  + '|正在处理…|正在思考…|已收到任务|已排队|子 Agent 已返回'
  + ')[^\\r\\n]{0,112}$',
  'u',
);

function getAgentActivity(messages: Record<number, ApiMessage> | undefined, agentBotId: string) {
  if (!messages) return undefined;

  let latestActivity: StateProps['agentActivity'];

  for (const message of Object.values(messages)) {
    const timestamp = message.editDate || message.date;
    const hasAgentTaskButton = message.inlineButtons?.some((row) => row.some(({ action }) => (
      action.type === 'callback' && action.data.startsWith(AGENT_TASK_BUTTON_PREFIX)
    )));

    if (message.senderId !== agentBotId || !hasAgentTaskButton) continue;

    const text = getMessageText(message)?.text.trim();
    if (!text || !AGENT_ACTIVITY_TEXT_PATTERN.test(text)) continue;

    const activityText = text === '正在分析任务并决定下一步…' ? '正在思考…' : text;

    if (!latestActivity || timestamp > latestActivity.timestamp) {
      latestActivity = { text: activityText, timestamp };
    }
  }

  return latestActivity;
}

const PrivateChatInfo = ({
  userId,
  customPeer,
  typingStatusByPeerId,
  avatarSize = 'medium',
  status,
  statusIcon,
  withDots,
  withMediaViewer,
  withUsername,
  withStory,
  withFullInfo,
  withUpdatingStatus,
  emojiStatusSize,
  noStatusOrTyping,
  noUserStatus,
  noEmojiStatus,
  noFake,
  noVerified,
  noRtl,
  user,
  userStatus,
  agentBotUsernames,
  hermesAgentBotUsernames,
  agentActivity,
  self,
  topic,
  messagesCount,
  isSavedMessages,
  isSavedDialog,
  areMessagesLoaded,
  chatMember,
  chatMemberOriginId,
  ripple,
  className,
  storyViewerOrigin,
  noAvatar,
  isSynced,
  iconElement,
  rightElement,
  onClick,
  onEmojiStatusClick,
}: OwnProps & StateProps) => {
  const {
    loadFullUser,
    openMediaViewer,
    loadMoreProfilePhotos,
  } = getActions();

  const lang = useLang();
  const isAgentActivityFresh = agentActivity
    && getServerTime() - agentActivity.timestamp < AGENT_ACTIVITY_STALE_AFTER;

  const isTopic = Boolean(user?.isBotForum && topic);
  const hasAvatarMediaViewer = withMediaViewer && !isSavedMessages;

  useEffect(() => {
    if (userId) {
      if (withFullInfo && isSynced) loadFullUser({ userId });
      if (withMediaViewer) loadMoreProfilePhotos({ peerId: userId, isPreload: true });
    }
  }, [userId, withFullInfo, withMediaViewer, isSynced]);

  useIntervalForceUpdate(UPDATE_INTERVAL);

  const handleAvatarViewerOpen = useLastCallback(
    (e: React.MouseEvent<HTMLDivElement, MouseEvent>, hasMedia: boolean) => {
      if (hasMedia) {
        e.stopPropagation();
        openMediaViewer({
          isAvatarView: true,
          chatId: userId,
          mediaIndex: 0,
          origin: avatarSize === 'jumbo' ? MediaViewerOrigin.ProfileAvatar : MediaViewerOrigin.MiddleHeaderAvatar,
        });
      }
    },
  );

  const mainUsername = useMemo(() => user && withUsername && getMainUsername(user), [user, withUsername]);

  if (!user && !customPeer) {
    return undefined;
  }

  function renderStatusOrTyping() {
    if (status) {
      return withDots ? (
        <DotAnimation className="status" content={status} />
      ) : (
        <span className="status" dir="auto">
          {statusIcon && <Icon className="status-icon" name={statusIcon} />}
          {renderText(status)}
        </span>
      );
    }

    if (withUpdatingStatus && !areMessagesLoaded) {
      return (
        <DotAnimation className="status" content={lang('Updating')} />
      );
    }

    if (customPeer?.subtitleKey) {
      return (
        <span className="status" dir="auto">
          <span className="user-status" dir="auto">{lang(customPeer.subtitleKey)}</span>
        </span>
      );
    }

    if (!user) {
      return undefined;
    }

    const username = getMainUsername(user)?.toLowerCase();
    const isAgentBot = user.type === 'userTypeBot' && username && agentBotUsernames?.includes(username);
    const isHermesAgentBot = user.type === 'userTypeBot'
      && username && hermesAgentBotUsernames?.includes(username);

    if (isAgentBot && isAgentActivityFresh) {
      return (
        <span className="status" dir="auto">
          <span className="user-status" dir="auto">{agentActivity.text}</span>
        </span>
      );
    }

    if (typingStatusByPeerId) {
      return <TypingStatus typingStatusByPeerId={typingStatusByPeerId} isPrivate />;
    }

    if (isTopic) {
      return (
        <span className="status" dir="auto">
          <Transition
            name="fade"
            shouldRestoreHeight
            activeKey={messagesCount !== undefined ? 1 : 2}
            className="message-count-transition"
          >
            {messagesCount !== undefined
              ? (messagesCount > 0
                ? lang('Messages', { count: messagesCount }, { pluralValue: messagesCount })
                : lang('ChatInfoNoMessages')
              ) : lang('ChatInfoForumTopic')}
          </Transition>
        </span>
      );
    }

    if (isHermesAgentBot) {
      return (
        <span className="status" dir="auto">
          <span className="user-status" dir="auto">{lang('BotStatusAgentBot')}</span>
        </span>
      );
    }

    if (isSystemBot(user.id)) {
      return undefined;
    }

    const translatedStatus = noUserStatus ? undefined : getUserStatus(lang, user, userStatus);
    const mainUserNameClassName = buildClassName('handle', translatedStatus && 'withStatus');
    return (
      <span className={buildClassName('status', !noUserStatus && isUserOnline(user, userStatus, true) && 'online')}>
        {mainUsername && <span className={mainUserNameClassName}>{mainUsername}</span>}
        {translatedStatus && <span className="user-status" dir="auto">{translatedStatus}</span>}
      </span>
    );
  }

  function renderNameTitle() {
    if (isTopic) {
      return (
        <h3 dir="auto" className="fullName">{renderText(topic!.title)}</h3>
      );
    }

    if (chatMember && hasRank(chatMember)) {
      return (
        <div className="info-name-title">
          <FullNameTitle
            peer={customPeer || user!}
            noFake={noFake}
            noVerified={noVerified}
            withEmojiStatus={!noEmojiStatus}
            emojiStatusSize={emojiStatusSize}
            isSavedMessages={isSavedMessages}
            isSavedDialog={isSavedDialog}
            iconElement={iconElement}
            onEmojiStatusClick={onEmojiStatusClick}
          />
          <RankBadge
            chatId={chatMemberOriginId!}
            userId={chatMember.userId}
            isAdmin={chatMember.isAdmin}
            isOwner={chatMember.isOwner}
            rank={chatMember.rank}
          />
        </div>
      );
    }

    return (
      <FullNameTitle
        peer={customPeer || user!}
        noFake={noFake}
        noVerified={noVerified}
        withEmojiStatus={!noEmojiStatus}
        emojiStatusSize={emojiStatusSize}
        isSavedMessages={isSavedMessages}
        isSavedDialog={isSavedDialog}
        onEmojiStatusClick={onEmojiStatusClick}
        iconElement={iconElement}
      />
    );
  }

  return (
    <div
      className={buildClassName('ChatInfo', className)}
      dir={!noRtl && lang.isRtl ? 'rtl' : undefined}
      onClick={onClick}
    >
      {isSavedDialog && self && (
        <Avatar
          key="saved-messages"
          size={avatarSize}
          peer={self}
          isSavedMessages
          className="saved-dialog-avatar"
        />
      )}
      {!noAvatar && !isTopic && (
        <Avatar
          key={user?.id}
          size={avatarSize}
          peer={customPeer || user}
          className={buildClassName(isSavedDialog && 'overlay-avatar')}
          isSavedMessages={isSavedMessages}
          isSavedDialog={isSavedDialog}
          withStory={withStory}
          storyViewerOrigin={storyViewerOrigin}
          storyViewerMode="single-peer"
          onClick={hasAvatarMediaViewer ? handleAvatarViewerOpen : undefined}
        />
      )}
      {isTopic && (
        <TopicIcon
          topic={topic!}
          className="topic-header-icon"
          size={TOPIC_ICON_SIZE}
        />
      )}
      <div className="info">
        {renderNameTitle()}
        {(status || (!isSavedMessages && !noStatusOrTyping)) && renderStatusOrTyping()}
      </div>
      {ripple && <RippleEffect />}
      {rightElement}
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global, {
    userId, threadId, forceShowSelf, isSavedDialog, noStatusOrTyping,
  }): Complete<StateProps> => {
    const { isSynced } = global;
    const user = userId ? selectUser(global, userId) : undefined;
    const userStatus = userId ? selectUserStatus(global, userId) : undefined;
    const agentBotUsernames = global.appConfig.agentBotUsernames;
    const hermesAgentBotUsernames = global.appConfig.hermesAgentBotUsernames;
    const isSavedMessages = !forceShowSelf && user && user.isSelf;
    const self = isSavedMessages ? user : selectUser(global, global.currentUserId!);
    const username = user && getMainUsername(user)?.toLowerCase();
    const isAgentBot = Boolean(user?.type === 'userTypeBot' && username && agentBotUsernames?.includes(username));
    const agentActivity = userId && isAgentBot && !isSavedDialog && !noStatusOrTyping
      ? getAgentActivity(selectChatMessages(global, userId), userId)
      : undefined;
    const areMessagesLoaded = Boolean(
      isSavedDialog
        ? selectChatMessages(global, global.currentUserId!)
        : selectChatMessages(global, userId!),
    );

    const topic = threadId ? selectTopic(global, userId, threadId) : undefined;
    const messagesCount = topic && userId ? selectThreadMessagesCount(global, userId, threadId!) : undefined;

    return {
      user,
      userStatus,
      agentBotUsernames,
      hermesAgentBotUsernames,
      agentActivity,
      isSavedMessages,
      areMessagesLoaded,
      self,
      isSynced,
      topic,
      messagesCount,
    };
  },
)(PrivateChatInfo));
