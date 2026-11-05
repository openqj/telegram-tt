import type { ApiAiConversationFolder } from '../../../api/types';
import type { GlobalState } from '../../types';

import { handleError } from '../../../util/handleError';
import { callApi } from '../../../api/gramjs';
import { addActionHandler, getGlobal, setGlobal } from '../../index';

addActionHandler('loadAiConversationFolders', async (global): Promise<void> => {
  const ownerUserId = global.currentUserId;
  if (!ownerUserId) return;
  const current = global.aiConversationFolders;
  if (current.ownerUserId === ownerUserId && (current.isLoading || current.isLoaded)) return;

  global = {
    ...global,
    aiConversationFolders: {
      byId: {},
      orderedIds: undefined,
      isLoading: true,
      isLoaded: false,
      ownerUserId,
    },
  };
  setGlobal(global);

  try {
    const folders = await callApi('fetchAiConversationFolders');
    global = getGlobal();
    if (global.currentUserId !== ownerUserId) return;
    global = {
      ...global,
      aiConversationFolders: createAiFolderState(folders || [], ownerUserId),
    };
    setGlobal(global);
  } catch (error) {
    global = getGlobal();
    if (global.currentUserId === ownerUserId) {
      global = {
        ...global,
        aiConversationFolders: {
          ...createAiFolderState([], ownerUserId),
        },
      };
      setGlobal(global);
    }
    handleError(error instanceof Error ? error : new Error(String(error)));
  }
});

addActionHandler('saveAiConversationFolder', async (global, _actions, { folderId, title }): Promise<void> => {
  const ownerUserId = global.currentUserId;
  if (!ownerUserId) return;
  try {
    const folder = await callApi('saveAiConversationFolder', { folderId, title });
    if (!folder) return;
    global = getGlobal();
    if (global.currentUserId !== ownerUserId) return;
    const currentFolders = global.aiConversationFolders.ownerUserId === ownerUserId
      ? global.aiConversationFolders : createAiFolderState([], ownerUserId);
    global = { ...global, aiConversationFolders: mergeAiConversationFolder(currentFolders, folder) };
    setGlobal(global);
  } catch (error) {
    handleError(error instanceof Error ? error : new Error(String(error)));
  }
});

addActionHandler('deleteAiConversationFolder', async (global, _actions, { folderId }): Promise<void> => {
  const ownerUserId = global.currentUserId;
  if (!ownerUserId) return;
  try {
    const result = await callApi('deleteAiConversationFolder', { folderId });
    if (!result?.ok) return;
    global = getGlobal();
    if (global.currentUserId !== ownerUserId) return;
    const byId = { ...global.aiConversationFolders.byId };
    delete byId[folderId];
    global = {
      ...global,
      aiConversationFolders: {
        ...global.aiConversationFolders,
        byId,
        orderedIds: global.aiConversationFolders.orderedIds?.filter((id) => id !== folderId),
      },
    };
    setGlobal(global);
  } catch (error) {
    handleError(error instanceof Error ? error : new Error(String(error)));
  }
});

addActionHandler('reorderAiConversationFolders', async (global, _actions, { folderIds }): Promise<void> => {
  const ownerUserId = global.currentUserId;
  if (!ownerUserId) return;
  try {
    const folders = await callApi('reorderAiConversationFolders', { folderIds });
    if (!folders) return;
    global = getGlobal();
    if (global.currentUserId !== ownerUserId) return;
    global = { ...global, aiConversationFolders: createAiFolderState(folders, ownerUserId) };
    setGlobal(global);
  } catch (error) {
    handleError(error instanceof Error ? error : new Error(String(error)));
  }
});

addActionHandler('saveAiConversationFolderMembership', async (global, _actions, {
  conversationId,
  folderIds,
}): Promise<void> => {
  const ownerUserId = global.currentUserId;
  if (!ownerUserId) return;
  try {
    const result = await callApi('saveAiConversationFolderMembership', { conversationId, folderIds });
    if (!result) return;
    global = getGlobal();
    if (global.currentUserId !== ownerUserId) return;
    const nextById = { ...global.aiConversationFolders.byId };
    Object.values(nextById).forEach((folder) => {
      const isIncluded = result.folder_ids.includes(folder.id);
      const hasConversation = folder.conversationIds.includes(conversationId);
      if (isIncluded === hasConversation) return;
      nextById[folder.id] = {
        ...folder,
        conversationIds: isIncluded
          ? [...folder.conversationIds, conversationId]
          : folder.conversationIds.filter((id) => id !== conversationId),
      };
    });
    global = {
      ...global,
      aiConversationFolders: {
        ...global.aiConversationFolders,
        byId: nextById,
      },
    };
    setGlobal(global);
  } catch (error) {
    handleError(error instanceof Error ? error : new Error(String(error)));
  }
});

function createAiFolderState(
  folders: ApiAiConversationFolder[],
  ownerUserId: string,
): GlobalState['aiConversationFolders'] {
  const orderedFolders = [...folders].sort((a, b) => a.position - b.position || a.id - b.id);
  return {
    byId: orderedFolders.reduce<Record<number, ApiAiConversationFolder>>((result, folder) => {
      result[folder.id] = folder;
      return result;
    }, {}),
    orderedIds: orderedFolders.map(({ id }) => id),
    isLoading: false,
    isLoaded: true,
    ownerUserId,
  };
}

function mergeAiConversationFolder(
  current: GlobalState['aiConversationFolders'],
  folder: ApiAiConversationFolder,
): GlobalState['aiConversationFolders'] {
  const byId = { ...current.byId, [folder.id]: folder };
  const orderedIds = current.orderedIds?.includes(folder.id)
    ? current.orderedIds
    : [...current.orderedIds || [], folder.id];
  return {
    ...current,
    byId,
    orderedIds,
    isLoaded: true,
  };
}
