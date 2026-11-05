import { memo, useEffect, useMemo, useRef, useState } from '@teact';
import { getActions, withGlobal } from '../../../global';

import type { ApiAiConversationFolder, ApiChatFolder, ApiChatlistExportedInvite } from '../../../api/types';
import type { GlobalState } from '../../../global/types';
import type { FolderEditDispatch } from '../../../hooks/reducers/useFoldersReducer';
import type { AnimationLevel } from '../../../types';
import type { TabWithProperties } from '../../ui/TabList';

import { ALL_FOLDER_ID } from '../../../config';
import { selectTabState } from '../../../global/selectors';
import { selectCurrentLimit } from '../../../global/selectors/limits';
import { selectSharedSettings } from '../../../global/selectors/sharedState';
import { IS_TOUCH_ENV } from '../../../util/browser/windowEnvironment';
import buildClassName from '../../../util/buildClassName';
import captureEscKeyListener from '../../../util/captureEscKeyListener';
import { captureEvents, SwipeDirection } from '../../../util/captureEvents';
import { resolveTransitionName } from '../../../util/resolveTransitionName';

import useDerivedState from '../../../hooks/useDerivedState';
import useFolderTabs from '../../../hooks/useFolderTabs';
import useHistoryBack from '../../../hooks/useHistoryBack';
import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';
import useScrolledState from '../../../hooks/useScrolledState';
import useShowTransition from '../../../hooks/useShowTransition';

import StoryRibbon from '../../story/StoryRibbon';
import Transition from '../../ui/Transition';
import ChatFolderTabList from './ChatFolderTabList';
import ChatList from './ChatList';

type OwnProps = {
  foldersDispatch: FolderEditDispatch;
  isForumPanelOpen?: boolean;
  isFoldersSidebarShown?: boolean;
  isAiList?: boolean;
  isPaseoWorkbench?: boolean;
};

type StateProps = {
  chatFoldersById: Record<number, ApiChatFolder>;
  folderInvitesById: Record<number, ApiChatlistExportedInvite[]>;
  orderedFolderIds?: number[];
  activeChatFolder: number;
  currentUserId?: string;
  animationLevel: AnimationLevel;
  shouldSkipHistoryAnimations?: boolean;
  maxFolders: number;
  maxChatLists: number;
  maxFolderInvites: number;
  hasArchivedChats?: boolean;
  hasArchivedStories?: boolean;
  archiveSettings: GlobalState['archiveSettings'];
  isStoryRibbonShown?: boolean;
  aiConversationFolders: GlobalState['aiConversationFolders'];
};

const SAVED_MESSAGES_HOTKEY = '0';
const FIRST_FOLDER_INDEX = 0;
// Keep built-in tab keys separate from positive database folder IDs.
const AI_ALL_TAB_ID = -10001;
const AI_BOTS_TAB_ID = -10002;
const EMPTY_AI_FOLDERS: Record<number, ApiAiConversationFolder> = {};

const ChatFolders = ({
  foldersDispatch,
  chatFoldersById,
  orderedFolderIds,
  activeChatFolder,
  currentUserId,
  isForumPanelOpen,
  animationLevel,
  shouldSkipHistoryAnimations,
  maxFolders,
  maxChatLists,
  folderInvitesById,
  maxFolderInvites,
  hasArchivedChats,
  hasArchivedStories,
  archiveSettings,
  isStoryRibbonShown,
  isFoldersSidebarShown,
  isAiList,
  isPaseoWorkbench,
  aiConversationFolders,
}: OwnProps & StateProps) => {
  const {
    loadChatFolders,
    loadAiConversationFolders,
    setActiveChatFolder,
    openChat,
  } = getActions();
  const hasCurrentAiFolderState = aiConversationFolders.ownerUserId === currentUserId;
  const aiFoldersById = hasCurrentAiFolderState ? aiConversationFolders.byId : EMPTY_AI_FOLDERS;
  const aiFolderIds = hasCurrentAiFolderState ? aiConversationFolders.orderedIds : undefined;

  const currentFolderIndex = isPaseoWorkbench ? FIRST_FOLDER_INDEX : activeChatFolder;
  const [activeAiFolderIndex, setActiveAiFolderIndex] = useState(0);
  const activeFolderIndex = isAiList ? activeAiFolderIndex : currentFolderIndex;

  const transitionRef = useRef<HTMLDivElement>();

  const lang = useLang();

  const { isAtBeginning, handleScroll, updateScrollState } = useScrolledState();

  useEffect(() => {
    loadChatFolders();
  }, []);

  useEffect(() => {
    if (isAiList && (aiConversationFolders.ownerUserId !== currentUserId || !aiConversationFolders.isLoaded)) {
      loadAiConversationFolders();
    }
  }, [
    aiConversationFolders.isLoaded, aiConversationFolders.ownerUserId, currentUserId, isAiList,
    loadAiConversationFolders,
  ]);

  useEffect(() => {
    setActiveAiFolderIndex(0);
  }, [currentUserId]);

  useEffect(() => {
    const activeList = transitionRef.current?.querySelector<HTMLElement>('.chat-list.Transition_slide-active');
    updateScrollState(activeList ?? undefined);
  }, [activeFolderIndex, isAiList, isPaseoWorkbench, updateScrollState]);

  const {
    ref,
    shouldRender: shouldRenderStoryRibbon,
    getIsClosing: getIsStoryRibbonClosing,
  } = useShowTransition({
    isOpen: Boolean(isStoryRibbonShown && !isAiList && !isPaseoWorkbench),
    className: false,
    withShouldRender: true,
  });
  const isStoryRibbonClosing = useDerivedState(getIsStoryRibbonClosing);

  const scrollToTop = useLastCallback(() => {
    const activeList = ref.current?.querySelector<HTMLElement>('#LeftColumn .chat-list.Transition_slide-active');
    activeList?.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  });

  const folderTabsParams = {
    sidebarMode: false,
    noEmoticons: true,
    orderedFolderIds,
    chatFoldersById,
    maxFolders,
    maxChatLists,
    folderInvitesById,
    maxFolderInvites,
  };
  const { displayedFolders, folderTabs } = useFolderTabs(folderTabsParams);
  const aiFolderTabs = useMemo<TabWithProperties[]>(() => [
    { id: AI_ALL_TAB_ID, title: lang('FilterAllChatsShort') },
    { id: AI_BOTS_TAB_ID, title: lang('FilterBots') },
    ...(aiFolderIds || []).flatMap((id) => {
      const folder = aiFoldersById[id];
      return folder ? [{ id, title: folder.title }] : [];
    }),
  ], [aiFolderIds, aiFoldersById, lang]);
  const activeTabs = isAiList ? aiFolderTabs : folderTabs;

  const allChatsFolderIndex = displayedFolders?.findIndex((folder) => folder.id === ALL_FOLDER_ID);
  const isInAllChatsFolder = allChatsFolderIndex === currentFolderIndex;
  const isInFirstFolder = FIRST_FOLDER_INDEX === currentFolderIndex;

  const setActiveFolder = useLastCallback((index: number, forceOnHeavyAnimation = false) => {
    if (forceOnHeavyAnimation) {
      setActiveChatFolder({ activeChatFolder: index }, { forceOnHeavyAnimation: true });
    } else {
      setActiveChatFolder({ activeChatFolder: index });
    }
  });

  const openFolder = useLastCallback((index: number) => {
    if (activeFolderIndex === index) return;

    if (isAiList) {
      setActiveAiFolderIndex(index);
      return;
    }

    setActiveFolder(index, true);
  });

  const handleSwitchTab = useLastCallback((index: number) => {
    if (activeFolderIndex === index) {
      scrollToTop();
      return;
    }

    openFolder(index);
  });

  // Prevent `activeTab` pointing at non-existing folder after update
  useEffect(() => {
    if (!activeTabs?.length) {
      return;
    }

    if (activeFolderIndex >= activeTabs.length) {
      if (isAiList) {
        setActiveAiFolderIndex(FIRST_FOLDER_INDEX);
      } else {
        setActiveFolder(FIRST_FOLDER_INDEX);
      }
    }
  }, [activeFolderIndex, activeTabs, isAiList, setActiveFolder]);

  useEffect(() => {
    if (isAiList || isPaseoWorkbench || !IS_TOUCH_ENV || !folderTabs?.length || isForumPanelOpen) {
      return undefined;
    }

    return captureEvents(transitionRef.current!, {
      selectorToPreventScroll: '.chat-list',
      onSwipe: (e, direction) => {
        if (direction === SwipeDirection.Left) {
          setActiveFolder(Math.min(currentFolderIndex + 1, folderTabs.length - 1), true);
          return true;
        } else if (direction === SwipeDirection.Right) {
          setActiveFolder(Math.max(0, currentFolderIndex - 1), true);
          return true;
        }

        return false;
      },
    });
  }, [currentFolderIndex, folderTabs, isAiList, isForumPanelOpen, isPaseoWorkbench, setActiveFolder]);

  const isNotInFirstFolderRef = useRef();
  isNotInFirstFolderRef.current = !isAiList && !isInFirstFolder;
  useEffect(() => (isNotInFirstFolderRef.current ? captureEscKeyListener(() => {
    if (isNotInFirstFolderRef.current) {
      setActiveFolder(FIRST_FOLDER_INDEX);
    }
  }) : undefined), [currentFolderIndex, isAiList, setActiveFolder]);

  useHistoryBack({
    isActive: !isAiList && !isInFirstFolder,
    onBack: () => setActiveFolder(FIRST_FOLDER_INDEX, true),
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isAiList && !isPaseoWorkbench && e.ctrlKey && e.shiftKey && e.code.startsWith('Digit') && folderTabs) {
        const [, digit] = e.code.match(/Digit(\d)/) || [];
        if (!digit) return;

        if (digit === SAVED_MESSAGES_HOTKEY) {
          openChat({ id: currentUserId, shouldReplaceHistory: true });
          return;
        }

        const folder = Number(digit) - 1;
        if (folder > folderTabs.length - 1) return;

        setActiveFolder(folder, true);
        e.preventDefault();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [currentUserId, folderTabs, isAiList, isPaseoWorkbench, openChat, setActiveFolder]);

  const {
    ref: placeholderRef,
    shouldRender: shouldRenderPlaceholder,
  } = useShowTransition({
    isOpen: !isAiList && !isPaseoWorkbench && !orderedFolderIds && !isFoldersSidebarShown,
    noMountTransition: true,
    withShouldRender: true,
  });

  function renderCurrentTab(isActive: boolean) {
    if (isAiList || isPaseoWorkbench) {
      const aiFolderId = activeAiFolderIndex > 1 ? aiFolderTabs[activeAiFolderIndex]?.id : undefined;
      return (
        <ChatList
          folderType="agent"
          isAiList={isAiList}
          aiFolderKind={isAiList ? (activeAiFolderIndex === 1 ? 'bots' : aiFolderId ? 'custom' : 'all') : undefined}
          aiFolderId={aiFolderId}
          isActive={isActive}
          isForumPanelOpen={isForumPanelOpen}
          foldersDispatch={foldersDispatch}
          isMainList
          isFoldersSidebarShown={isFoldersSidebarShown}
          withTags
          onScroll={handleScroll}
        />
      );
    }

    const activeFolder = Object.values(chatFoldersById)
      .find(({ id }) => id === folderTabs?.[currentFolderIndex]?.id);
    const isFolder = activeFolder && !isInAllChatsFolder;

    return (
      <ChatList
        folderType={isFolder ? 'folder' : 'all'}
        folderId={isFolder ? activeFolder.id : undefined}
        isActive={isActive}
        isForumPanelOpen={isForumPanelOpen}
        foldersDispatch={foldersDispatch}
        isMainList
        canDisplayArchive={(hasArchivedChats || hasArchivedStories) && !archiveSettings.isHidden}
        archiveSettings={archiveSettings}
        isFoldersSidebarShown={isFoldersSidebarShown}
        isStoryRibbonShown={isStoryRibbonShown}
        withTags
        onScroll={handleScroll}
      />
    );
  }

  const hasFolders = isAiList
    ? aiFolderTabs.length > 0
    : !isPaseoWorkbench && folderTabs && folderTabs.length > 1;
  const shouldRenderFolders = hasFolders && !isFoldersSidebarShown;

  return (
    <div
      ref={ref}
      className={buildClassName(
        'ChatFolders',
        shouldRenderStoryRibbon && !isAiList && !isPaseoWorkbench && 'with-story-ribbon',
        isFoldersSidebarShown && 'ChatFolders--tabs-sidebar-shown',
      )}
    >
      {shouldRenderStoryRibbon && !isAiList && !isPaseoWorkbench && <StoryRibbon isClosing={isStoryRibbonClosing} />}
      <div className={buildClassName(
        'ChatFolders-content',
        shouldRenderFolders && 'with-tabs',
        !shouldRenderFolders && !isAtBeginning && 'scrolled',
      )}
      >
        {shouldRenderFolders ? (
          <ChatFolderTabList
            tabs={activeTabs!}
            activeTab={activeFolderIndex}
            onSwitchTab={handleSwitchTab}
            onFileHoverOpen={openFolder}
          />
        ) : shouldRenderPlaceholder ? (
          <div ref={placeholderRef} className="tabs-placeholder" />
        ) : undefined}
        <Transition
          ref={transitionRef}
          name={resolveTransitionName('slideOptimized', animationLevel, shouldSkipHistoryAnimations, lang.isRtl)}
          activeKey={activeFolderIndex}
          renderCount={hasFolders ? activeTabs?.length : undefined}
        >
          {renderCurrentTab}
        </Transition>
      </div>
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global): Complete<StateProps> => {
    const {
      chatFolders: {
        byId: chatFoldersById,
        orderedIds: orderedFolderIds,
        invites: folderInvitesById,
      },
      chats: {
        listIds: {
          archived,
        },
      },
      stories: {
        orderedPeerIds: {
          archived: archivedStories,
        },
      },
      currentUserId,
      archiveSettings,
    } = global;
    const { animationLevel } = selectSharedSettings(global);
    const { shouldSkipHistoryAnimations, activeChatFolder } = selectTabState(global);
    const { storyViewer: { isRibbonShown: isStoryRibbonShown } } = selectTabState(global);

    return {
      chatFoldersById,
      folderInvitesById,
      orderedFolderIds,
      activeChatFolder,
      currentUserId,
      animationLevel,
      shouldSkipHistoryAnimations,
      hasArchivedChats: Boolean(archived?.length),
      hasArchivedStories: Boolean(archivedStories?.length),
      maxFolders: selectCurrentLimit(global, 'dialogFilters'),
      maxFolderInvites: selectCurrentLimit(global, 'chatlistInvites'),
      maxChatLists: selectCurrentLimit(global, 'chatlistJoined'),
      archiveSettings,
      isStoryRibbonShown,
      aiConversationFolders: global.aiConversationFolders,
    };
  },
)(ChatFolders));
