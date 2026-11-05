import {
  memo, useCallback, useEffect, useMemo, useState,
} from '../../../../lib/teact/teact';
import { getActions, withGlobal } from '../../../../global';

import type { ApiAiConversationFolder, ApiChatFolder } from '../../../../api/types';
import type { FoldersPosition } from '../../../../types';

import {
  ALL_FOLDER_ID, FOLDERS_POSITION_LEFT, FOLDERS_POSITION_TOP, STICKER_SIZE_FOLDER_SETTINGS,
} from '../../../../config';
import { getFolderDescriptionText } from '../../../../global/helpers';
import { getOrderedPaseoProjectFolderIds } from '../../../../global/paseoWorkbench';
import { selectIsCurrentUserPremium } from '../../../../global/selectors';
import { selectCurrentLimit } from '../../../../global/selectors/limits';
import buildClassName from '../../../../util/buildClassName';
import { isBetween } from '../../../../util/math';
import { MEMO_EMPTY_ARRAY } from '../../../../util/memo';
import { throttle } from '../../../../util/schedulers';
import { LOCAL_TGS_URLS } from '../../../common/helpers/animatedAssets';
import { renderTextWithEntities } from '../../../common/helpers/renderTextWithEntities';

import { useFolderManagerForChatsCount } from '../../../../hooks/useFolderManager';
import useHistoryBack from '../../../../hooks/useHistoryBack';
import useLang from '../../../../hooks/useLang';
import useLastCallback from '../../../../hooks/useLastCallback';
import { getPeerColorClass } from '../../../../hooks/usePeerColor';
import usePreviousDeprecated from '../../../../hooks/usePreviousDeprecated';

import AnimatedIconWithPreview from '../../../common/AnimatedIconWithPreview';
import Icon from '../../../common/icons/Icon';
import Island, { IslandOutside, IslandTitle } from '../../../gili/layout/Island';
import Surface from '../../../gili/layout/Surface';
import Button from '../../../ui/Button';
import Checkbox from '../../../ui/Checkbox';
import ConfirmDialog from '../../../ui/ConfirmDialog';
import Draggable from '../../../ui/Draggable';
import ListItem from '../../../ui/ListItem';
import Loading from '../../../ui/Loading';
import RadioGroup from '../../../ui/RadioGroup';
import SettingsFolderScopeTabs, { type FolderScope } from './SettingsFolderScopeTabs';

type OwnProps = {
  isActive?: boolean;
  isMobile?: boolean;
  onCreateFolder: () => void;
  onEditFolder: (folder: ApiChatFolder) => void;
  onReset: () => void;
  scope: FolderScope;
  onScopeChange: (scope: FolderScope) => void;
};

type StateProps = {
  folderIds?: number[];
  foldersById: Record<number, ApiChatFolder>;
  aiFoldersById: Record<number, ApiAiConversationFolder>;
  paseoFoldersById: Record<number, ApiChatFolder>;
  recommendedChatFolders?: ApiChatFolder[];
  maxFolders: number;
  isPremium?: boolean;
  areTagsEnabled?: boolean;
  foldersPosition: FoldersPosition;
  isAiFoldersLoaded: boolean;
};

type SortState = {
  orderedFolderIds?: number[];
  dragOrderIds?: number[];
  draggedIndex?: number;
};

type SettingsFolderItem = Pick<ApiChatFolder, 'id' | 'title' | 'isChatList' | 'color' | 'noTitleAnimations'> & {
  subtitle?: string;
};

const FOLDER_HEIGHT_PX = 56;
const runThrottledForLoadRecommended = throttle((cb) => cb(), 60000, true);

const SettingsFoldersMain = ({
  isActive,
  foldersById,
  isPremium,
  recommendedChatFolders,
  maxFolders,
  areTagsEnabled,
  foldersPosition,
  isMobile,
  aiFoldersById,
  paseoFoldersById,
  onCreateFolder,
  onEditFolder,
  onReset,
  scope,
  onScopeChange,
  folderIds,
  isAiFoldersLoaded,
}: OwnProps & StateProps) => {
  const {
    loadRecommendedChatFolders,
    addChatFolder,
    openLimitReachedModal,
    openDeleteChatFolderModal,
    sortChatFolders,
    toggleDialogFilterTags,
    openPremiumModal,
    setSharedSettingOption,
    loadAiConversationFolders,
    deleteAiConversationFolder,
    reorderAiConversationFolders,
    setPaseoProjectFolderOrder,
  } = getActions();
  const currentFoldersById = useMemo(() => {
    if (scope === 'chats') return foldersById;
    if (scope === 'paseo') return paseoFoldersById;
    return Object.values(aiFoldersById).reduce<Record<number, ApiChatFolder>>((result, folder) => {
      result[folder.id] = {
        id: folder.id,
        title: { text: folder.title },
        includedChatIds: folder.conversationIds,
        excludedChatIds: [],
        emoticon: '📁',
      };
      return result;
    }, {});
  }, [aiFoldersById, foldersById, paseoFoldersById, scope]);

  const [state, setState] = useState<SortState>({
    orderedFolderIds: folderIds,
    dragOrderIds: folderIds,
    draggedIndex: undefined,
  });

  const prevFolderIds = usePreviousDeprecated(folderIds);
  const [folderToDelete, setFolderToDelete] = useState<number>();

  // Sync folders state after changing folders in other clients
  useEffect(() => {
    if (prevFolderIds !== folderIds) {
      setState({
        orderedFolderIds: folderIds,
        dragOrderIds: folderIds,
        draggedIndex: undefined,
      });
    }
  }, [prevFolderIds, folderIds, state.orderedFolderIds?.length]);

  // Due to the parent Transition, this component never gets unmounted,
  // that's why we use throttled API call on every update.
  useEffect(() => {
    if (scope === 'ai' && !isAiFoldersLoaded) {
      loadAiConversationFolders();
    } else if (scope === 'chats') {
      runThrottledForLoadRecommended(() => {
        loadRecommendedChatFolders();
      });
    }
  }, [isAiFoldersLoaded, loadAiConversationFolders, loadRecommendedChatFolders, scope]);

  const handleCreateFolder = useCallback(() => {
    if (scope === 'ai') {
      if ((folderIds?.length || 0) >= 100) return;
      onCreateFolder();
      return;
    }

    if (Object.keys(foldersById).length >= maxFolders - 1) {
      openLimitReachedModal({
        limit: 'dialogFilters',
      });

      return;
    }

    onCreateFolder();
  }, [folderIds?.length, foldersById, maxFolders, onCreateFolder, openLimitReachedModal, scope]);

  const lang = useLang();

  useHistoryBack({
    isActive,
    onBack: onReset,
  });

  const chatsCountByFolderId = useFolderManagerForChatsCount();
  const userFolders = useMemo<SettingsFolderItem[] | undefined>(() => {
    if (!folderIds) {
      return undefined;
    }

    if (scope === 'chats' && folderIds.length <= 1) {
      return MEMO_EMPTY_ARRAY;
    }

    return folderIds.flatMap((id): SettingsFolderItem[] => {
      const folder = currentFoldersById[id];
      if (!folder) return [];

      if (scope === 'chats' && id === ALL_FOLDER_ID) {
        return [{
          id,
          title: {
            text: lang('FilterAllChats'),
            entities: [],
          },
        }];
      }

      return [{
        id: folder.id,
        title: folder.title,
        subtitle: scope === 'ai' ? undefined : getFolderDescriptionText(lang, folder, chatsCountByFolderId[folder.id]),
        isChatList: folder.isChatList,
        color: folder.color,
        noTitleAnimations: folder.noTitleAnimations,
      }];
    });
  }, [currentFoldersById, folderIds, lang, chatsCountByFolderId, scope]);

  const handleCreateFolderFromRecommended = useCallback((folder: ApiChatFolder) => {
    if (Object.keys(foldersById).length >= maxFolders - 1) {
      openLimitReachedModal({
        limit: 'dialogFilters',
      });

      return;
    }

    addChatFolder({ folder });
  }, [foldersById, maxFolders, addChatFolder, openLimitReachedModal]);

  const handleToggleTags = useCallback(() => {
    if (!isPremium) {
      return;
    }

    toggleDialogFilterTags({ isEnabled: !areTagsEnabled });
  }, [areTagsEnabled, isPremium, toggleDialogFilterTags]);

  const handleDrag = useCallback((translation: { x: number; y: number }, id: string | number) => {
    const delta = Math.round(translation.y / FOLDER_HEIGHT_PX);
    const index = state.orderedFolderIds?.indexOf(id as number) || 0;
    const dragOrderIds = state.orderedFolderIds?.filter((folderId) => folderId !== id);

    if (!dragOrderIds || !isBetween(index + delta, 0, folderIds?.length || 0)) {
      return;
    }

    dragOrderIds.splice(index + delta + (scope === 'chats' && !isPremium ? 1 : 0), 0, id as number);
    setState((current) => ({
      ...current,
      draggedIndex: index,
      dragOrderIds,
    }));
  }, [folderIds?.length, isPremium, scope, state.orderedFolderIds]);

  const handleDragEnd = useCallback(() => {
    setState((current) => {
      if (scope === 'ai') {
        reorderAiConversationFolders({ folderIds: current.dragOrderIds! });
      } else if (scope === 'paseo') {
        setPaseoProjectFolderOrder({ folderIds: current.dragOrderIds! });
      } else {
        sortChatFolders({ folderIds: current.dragOrderIds! });
      }

      return {
        ...current,
        orderedFolderIds: current.dragOrderIds,
        draggedIndex: undefined,
      };
    });
  }, [reorderAiConversationFolders, scope, setPaseoProjectFolderOrder, sortChatFolders]);

  const handleDeleteAiFolder = useCallback(() => {
    if (folderToDelete === undefined) return;
    deleteAiConversationFolder({ folderId: folderToDelete });
    setFolderToDelete(undefined);
  }, [deleteAiConversationFolder, folderToDelete]);

  const handleFoldersPositionChange = useLastCallback((value: string) => {
    setSharedSettingOption({ foldersPosition: value as FoldersPosition });
  });

  const canCreateNewFolder = useMemo(() => {
    if (scope === 'paseo') return false;

    return scope === 'ai'
      ? isAiFoldersLoaded && (folderIds?.length || 0) < 100
      : !isPremium || Object.keys(foldersById).length < maxFolders - 1;
  }, [folderIds?.length, foldersById, isAiFoldersLoaded, isPremium, maxFolders, scope]);

  return (
    <Surface scrollable className="settings-content no-border">
      <SettingsFolderScopeTabs scope={scope} onChange={onScopeChange} />
      {scope !== 'paseo' && (
        <IslandOutside className="settings-content-header">
          <AnimatedIconWithPreview
            size={STICKER_SIZE_FOLDER_SETTINGS}
            tgsUrl={LOCAL_TGS_URLS.FoldersAll}
            className="settings-content-icon"
          />

          <p className="settings-item-description mb-3" dir="auto">
            {lang('CreateNewFilterInfo')}
          </p>

          {canCreateNewFolder && (
            <Button
              className="settings-button with-icon"
              color="primary"
              pill
              fluid
              onClick={handleCreateFolder}
              isRtl={lang.isRtl}
              iconName="add"
            >
              {lang('CreateNewFilter')}
            </Button>
          )}
        </IslandOutside>
      )}

      <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('Filters')}</IslandTitle>
      <Island>
        {scope === 'ai' && (
          <>
            <ListItem className="no-icon settings-sortable-item" narrow inactive multiline isStatic>
              <span className="title">{lang('FilterAllChatsShort')}</span>
            </ListItem>
            <ListItem className="no-icon settings-sortable-item" narrow inactive multiline isStatic>
              <span className="title">{lang('FilterBots')}</span>
            </ListItem>
          </>
        )}
        {scope === 'paseo' && (
          <ListItem className="no-icon settings-sortable-item" narrow inactive multiline isStatic>
            <span className="title">{lang('FilterAllChatsShort')}</span>
          </ListItem>
        )}
        <div className="settings-sortable-container" style={`height: ${(folderIds?.length || 0) * FOLDER_HEIGHT_PX}px`}>
          {userFolders?.length ? userFolders.map((folder, i) => {
            const isBlocked = scope === 'chats' && i > maxFolders - 1;
            const isDragged = state.draggedIndex === i;
            const draggedTop = (state.orderedFolderIds?.indexOf(folder.id) ?? 0) * FOLDER_HEIGHT_PX;
            const top = (state.dragOrderIds?.indexOf(folder.id) ?? 0) * FOLDER_HEIGHT_PX;

            const shouldRenderColor = scope === 'chats'
              && folder?.color !== undefined && folder.color !== -1 && areTagsEnabled;

            if (scope === 'chats' && folder.id === ALL_FOLDER_ID) {
              return (
                <Draggable
                  key={folder.id}
                  id={folder.id}
                  onDrag={handleDrag}
                  onDragEnd={handleDragEnd}
                  style={`top: ${isDragged ? draggedTop : top}px;`}
                  knobStyle={`${lang.isRtl ? 'left' : 'right'}: 0.375rem;`}
                  isDisabled={!isPremium || !isActive}
                >
                  <ListItem
                    key={folder.id}
                    className="drag-item no-icon settings-sortable-item"
                    narrow
                    inactive
                    multiline
                    isStatic
                    allowSelection
                  >
                    <span className="title">
                      {renderTextWithEntities({
                        text: folder.title.text,
                        entities: folder.title.entities,
                        noCustomEmojiPlayback: folder.noTitleAnimations,
                      })}
                    </span>
                    <span className="subtitle">{lang('FoldersAllChatsDesc')}</span>
                  </ListItem>
                </Draggable>
              );
            }

            return (
              <Draggable
                key={folder.id}
                id={folder.id}
                onDrag={handleDrag}
                onDragEnd={handleDragEnd}
                style={`top: ${isDragged ? draggedTop : top}px;`}
                knobStyle={`${lang.isRtl ? 'left' : 'right'}: ${shouldRenderColor ? '4rem' : '2.5rem'};`}
                isDisabled={isBlocked || !isActive}
              >
                <ListItem
                  className="drag-item no-icon settings-sortable-item"
                  narrow
                  secondaryIcon={scope === 'paseo' ? undefined : 'more'}
                  multiline
                  contextActions={scope === 'paseo' ? undefined : [
                    {
                      handler: () => {
                        if (scope === 'ai') {
                          setFolderToDelete(folder.id);
                        } else {
                          openDeleteChatFolderModal({ folderId: folder.id });
                        }
                      },
                      destructive: true,
                      title: lang('Delete'),
                      icon: 'delete',
                    },
                  ]}

                  onClick={scope === 'paseo' ? undefined : () => {
                    if (isBlocked) {
                      openLimitReachedModal({
                        limit: 'dialogFilters',
                      });
                    } else {
                      onEditFolder(currentFoldersById[folder.id]);
                    }
                  }}
                >
                  <span className="title">
                    {renderTextWithEntities({
                      text: folder.title.text,
                      entities: folder.title.entities,
                      noCustomEmojiPlayback: folder.noTitleAnimations,
                    })}
                    {isBlocked && <Icon name="lock-filled" className="settings-folders-blocked-icon" />}
                  </span>
                  <span className="subtitle">
                    {scope === 'chats' && folder.isChatList && <Icon name="link" className="mr-1" />}
                    {scope === 'chats' && folder.subtitle}
                  </span>

                  {
                    shouldRenderColor && (
                      <div className={buildClassName(
                        'settings-folders-color-circle',
                        folder.color !== undefined && folder.color !== -1 && getPeerColorClass(folder.color),
                      )}
                      />
                    )
                  }

                </ListItem>
              </Draggable>
            );
          }) : userFolders && !userFolders.length ? (
            <p className="settings-item-description my-4" dir="auto">
              {lang('SettingsFoldersEmpty')}
            </p>
          ) : <Loading />}
        </div>
      </Island>

      <ConfirmDialog
        isOpen={folderToDelete !== undefined}
        text={lang('FilterDeleteAlert')}
        confirmLabel={lang('Delete')}
        confirmIsDestructive
        confirmHandler={handleDeleteAiFolder}
        onClose={() => setFolderToDelete(undefined)}
      />

      {scope === 'chats' && (recommendedChatFolders && Boolean(recommendedChatFolders.length)) && (
        <>
          <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>
            {lang('FilterRecommended')}
          </IslandTitle>
          <Island>
            {recommendedChatFolders.map((folder) => (
              <ListItem
                key={folder.id}
                narrow
                onClick={() => handleCreateFolderFromRecommended(folder)}
              >
                <div className="settings-folders-recommended-item">
                  <div className="multiline-item">
                    <span className="title">
                      {renderTextWithEntities({
                        text: folder.title.text,
                        entities: folder.title.entities,
                        noCustomEmojiPlayback: folder.noTitleAnimations,
                      })}
                    </span>
                    <span className="subtitle">{folder.description}</span>
                  </div>

                  <Button
                    className="px-3"
                    color="primary"
                    size="tiny"
                    pill
                    fluid
                    isRtl={lang.isRtl}
                  >
                    {lang('Add')}
                  </Button>
                </div>
              </ListItem>
            ))}
          </Island>
        </>
      )}
      {scope === 'chats' && (
        <Island>
          <div className="settings-item-relative">
            <Checkbox
              label={lang('ShowFolderTags')}
              subLabel={lang('ShowFolderTagsHint')}
              checked={isPremium && areTagsEnabled}
              onChange={handleToggleTags}
              onClickLabel={(event) => {
                if (!isPremium) {
                  event.preventDefault();
                  openPremiumModal();
                }
              }}
            />
            {!isPremium && <Icon name="lock-filled" className="settings-folders-lock-icon" />}
          </div>
        </Island>
      )}
      {scope === 'chats' && !isMobile && (
        <>
          <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('TabsPosition')}</IslandTitle>
          <Island>
            <RadioGroup
              name="tabsPosition"
              options={[{
                label: lang('TabsPositionLeft'),
                value: FOLDERS_POSITION_LEFT,
              }, {
                label: lang('TabsPositionTop'),
                value: FOLDERS_POSITION_TOP,
              }]}
              selected={foldersPosition}
              onChange={handleFoldersPositionChange}
            />
          </Island>
        </>
      )}
    </Surface>
  );
};

export default memo(withGlobal<OwnProps>(
  (global, { scope }): Complete<StateProps> => {
    const {
      orderedIds: folderIds,
      byId: foldersById,
      recommended: recommendedChatFolders,
      areTagsEnabled,
    } = global.chatFolders;
    const aiFolders = global.aiConversationFolders;
    const isAiFoldersLoaded = aiFolders.ownerUserId === global.currentUserId && Boolean(aiFolders.isLoaded);
    const paseoWorkbench = global.paseoWorkbench;
    const isPaseoFoldersLoaded = Boolean(global.currentUserId
      && paseoWorkbench?.ownerUserId === global.currentUserId);

    return {
      folderIds: scope === 'ai'
        ? (isAiFoldersLoaded ? aiFolders.orderedIds : undefined)
        : scope === 'paseo'
          ? (isPaseoFoldersLoaded && paseoWorkbench
            ? getOrderedPaseoProjectFolderIds(paseoWorkbench.projectFoldersById, paseoWorkbench.projectFolderOrder)
            : undefined)
          : folderIds,
      foldersById,
      aiFoldersById: isAiFoldersLoaded ? aiFolders.byId : {},
      paseoFoldersById: isPaseoFoldersLoaded && paseoWorkbench ? paseoWorkbench.projectFoldersById : {},
      isAiFoldersLoaded,
      isPremium: scope === 'chats' && selectIsCurrentUserPremium(global),
      recommendedChatFolders: scope === 'chats' ? recommendedChatFolders : undefined,
      maxFolders: scope === 'ai' ? 100 : selectCurrentLimit(global, 'dialogFilters'),
      areTagsEnabled,
      foldersPosition: global.sharedState.settings.foldersPosition,
    };
  },
)(SettingsFoldersMain));
