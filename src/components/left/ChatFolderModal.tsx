import {
  memo, useCallback, useEffect, useMemo, useState,
} from '../../lib/teact/teact';
import { getActions, withGlobal } from '../../global';

import type { ApiAiConversationFolder, ApiChatFolder } from '../../api/types';

import { ALL_FOLDER_ID } from '../../config';
import buildClassName from '../../util/buildClassName';
import { renderTextWithEntities } from '../common/helpers/renderTextWithEntities';

import useLang from '../../hooks/useLang';

import Button from '../ui/Button';
import CheckboxGroup from '../ui/CheckboxGroup';
import Modal from '../ui/Modal';

import styles from './ChatFolderModal.module.scss';

export type OwnProps = {
  isOpen: boolean;
  chatId: string;
  scope?: 'chats' | 'ai';
  onClose: () => void;
  onCloseAnimationEnd?: () => void;
};

type StateProps = {
  foldersById?: Record<number, ApiChatFolder>;
  folderOrderedIds?: number[];
  aiFoldersById: Record<number, ApiAiConversationFolder>;
  aiFolderOrderedIds?: number[];
};

const ChatFolderModal = ({
  isOpen,
  chatId,
  scope = 'chats',
  foldersById,
  folderOrderedIds,
  aiFoldersById,
  aiFolderOrderedIds,
  onClose,
  onCloseAnimationEnd,
}: OwnProps & StateProps) => {
  const { editChatFolders, saveAiConversationFolderMembership } = getActions();

  const lang = useLang();

  const initialSelectedFolderIds = useMemo(() => {
    if (scope === 'ai') {
      return (aiFolderOrderedIds || [])
        .filter((folderId) => aiFoldersById[folderId]?.conversationIds.includes(chatId))
        .map(String);
    }

    if (!foldersById) {
      return [];
    }

    return Object.keys(foldersById).reduce((result, folderId) => {
      const { includedChatIds, pinnedChatIds } = foldersById[Number(folderId)];
      if (includedChatIds.includes(chatId) || pinnedChatIds?.includes(chatId)) {
        result.push(folderId);
      }

      return result;
    }, [] as string[]);
  }, [aiFolderOrderedIds, aiFoldersById, chatId, foldersById, scope]);

  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>(initialSelectedFolderIds);

  useEffect(() => {
    if (isOpen) {
      setSelectedFolderIds(initialSelectedFolderIds);
    }
  }, [initialSelectedFolderIds, isOpen]);

  const folders = useMemo(() => {
    if (scope === 'ai') {
      return (aiFolderOrderedIds || []).flatMap((folderId) => {
        const folder = aiFoldersById[folderId];
        return folder ? [{ label: folder.title, value: String(folderId) }] : [];
      });
    }

    return folderOrderedIds?.filter((folderId) => folderId !== ALL_FOLDER_ID)
      .map((folderId) => {
        const folder = foldersById ? foldersById[folderId] : undefined;
        const label = folder ? renderTextWithEntities({
          text: folder.title.text,
          entities: folder.title.entities,
          noCustomEmojiPlayback: folder.noTitleAnimations,
        }) : '';
        return {
          label,
          value: String(folderId),
        };
      }) || [];
  }, [aiFolderOrderedIds, aiFoldersById, folderOrderedIds, foldersById, scope]);

  const handleSubmit = useCallback(() => {
    if (scope === 'ai') {
      saveAiConversationFolderMembership({
        conversationId: chatId,
        folderIds: selectedFolderIds.map(Number),
      });
      onClose();
      return;
    }

    const idsToRemove = initialSelectedFolderIds.filter((id) => !selectedFolderIds.includes(id)).map(Number);
    const idsToAdd = selectedFolderIds.filter((id) => !initialSelectedFolderIds.includes(id)).map(Number);

    editChatFolders({ chatId, idsToRemove, idsToAdd });
    onClose();
  }, [
    chatId, editChatFolders, initialSelectedFolderIds, onClose, saveAiConversationFolderMembership, scope,
    selectedFolderIds,
  ]);

  if (scope === 'ai' ? !aiFolderOrderedIds : !foldersById || !folderOrderedIds) {
    return undefined;
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onCloseAnimationEnd={onCloseAnimationEnd}
      onEnter={handleSubmit}
      className={buildClassName(styles.root, 'delete')}
      contentClassName={styles.modalContent}
      title={lang('FilterAddTo')}
    >
      <div className={buildClassName(styles.main, 'custom-scroll')}>
        <CheckboxGroup
          options={folders}
          selected={selectedFolderIds}
          onChange={setSelectedFolderIds}
        />
      </div>
      <div className={styles.footer}>
        <div className="dialog-buttons">
          <Button color="primary" className="confirm-dialog-button" isText onClick={handleSubmit}>
            {lang('FilterAddTo')}
          </Button>
          <Button className="confirm-dialog-button" isText onClick={onClose}>{lang('Cancel')}</Button>
        </div>
      </div>
    </Modal>
  );
};

export default memo(withGlobal<OwnProps>(
  (global): Complete<StateProps> => {
    const { byId: foldersById, orderedIds: folderOrderedIds } = global.chatFolders;

    return {
      foldersById,
      folderOrderedIds,
      aiFoldersById: global.aiConversationFolders.ownerUserId === global.currentUserId
        ? global.aiConversationFolders.byId : {},
      aiFolderOrderedIds: global.aiConversationFolders.ownerUserId === global.currentUserId
        ? global.aiConversationFolders.orderedIds : undefined,
    };
  },
)(ChatFolderModal));
