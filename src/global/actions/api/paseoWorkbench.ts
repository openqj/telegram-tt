import type { ApiChat, ApiChatFolder, ApiUser } from '../../../api/types';
import type { PaseoWorkbenchSession } from '../../paseoWorkbench';
import type { ActionReturnType } from '../../types';
import { MAIN_THREAD_ID } from '../../../api/types';

import { omit } from '../../../util/iteratees';
import { addActionHandler } from '../../index';
import {
  buildPaseoAgentUser, buildPaseoChat, buildPaseoProjectFolder, buildPaseoSessionSubtitle,
  getOrderedPaseoProjectFolderIds, getPaseoAgentUserId, getPaseoChatId, getPaseoProjectFolderId,
} from '../../paseoWorkbench';
import {
  addChats, addUsers, replaceChatMessages, safeReplaceViewportIds, updateChat, updateChatLastMessageId,
} from '../../reducers';
import { replaceThreadLocalStateParam, updateThreadInfo } from '../../reducers/threads';
import { selectCurrentMessageList } from '../../selectors';

const PASEO_PROJECT_FOLDER_ORDER_KEY = 'telegram-web-a:paseo-project-folder-order:v1';

function getStoredPaseoProjectFolderOrder(userId?: string) {
  if (!userId) return [];

  try {
    const stored = JSON.parse(localStorage.getItem(`${PASEO_PROJECT_FOLDER_ORDER_KEY}:${userId}`) || '[]');
    return Array.isArray(stored) ? stored.filter((id): id is number => Number.isInteger(id)) : [];
  } catch {
    return [];
  }
}

addActionHandler('setPaseoWorkbenchActive', (global, _actions, { isActive }): ActionReturnType => {
  const current = global.paseoWorkbench;
  const isSameUser = current?.ownerUserId === global.currentUserId;
  if (current?.isActive === isActive) return;

  return {
    ...global,
    paseoWorkbench: {
      isActive,
      activePaseoFolder: current?.activePaseoFolder || 0,
      ownerUserId: global.currentUserId,
      chatIds: current?.chatIds || [],
      projectFoldersById: current?.projectFoldersById || {},
      projectFolderOrder: isSameUser && current
        ? current.projectFolderOrder
        : getStoredPaseoProjectFolderOrder(global.currentUserId),
      sessionsByChatId: current?.sessionsByChatId || {},
    },
  };
});

addActionHandler('setActivePaseoFolder', (global, _actions, { activePaseoFolder }): ActionReturnType => {
  const current = global.paseoWorkbench;
  if (!current || current.activePaseoFolder === activePaseoFolder) return;

  return {
    ...global,
    paseoWorkbench: {
      ...current,
      activePaseoFolder,
    },
  };
});

addActionHandler('setPaseoProjectFolderOrder', (global, _actions, { folderIds }): ActionReturnType => {
  const current = global.paseoWorkbench;
  if (!current) return;

  const projectFolderOrder = getOrderedPaseoProjectFolderIds(current.projectFoldersById, folderIds);
  try {
    if (global.currentUserId) {
      localStorage.setItem(
        `${PASEO_PROJECT_FOLDER_ORDER_KEY}:${global.currentUserId}`,
        JSON.stringify(projectFolderOrder),
      );
    }
  } catch {
    // Keep the order for the current session when browser storage is unavailable.
  }

  return {
    ...global,
    paseoWorkbench: {
      ...current,
      projectFolderOrder,
    },
  };
});

addActionHandler('syncPaseoWorkbenchSessions', (global, _actions, { sessions }): ActionReturnType => {
  const current = global.paseoWorkbench;
  const chatsById: Record<string, ApiChat> = {};
  const usersById: Record<string, ApiUser> = {};
  const projectFoldersById: Record<number, ApiChatFolder> = {};
  const sessionsByChatId = sessions.reduce<Record<string, PaseoWorkbenchSession>>((result, session) => {
    const chatId = getPaseoChatId(session.hostId, session.agentId);
    const agentUserId = getPaseoAgentUserId(session.hostId, session.agentId);
    const subtitle = buildPaseoSessionSubtitle(session.hostName, session.provider);
    const projectFolderId = getPaseoProjectFolderId(session.projectKey);
    const projectFolder = projectFoldersById[projectFolderId]
      || buildPaseoProjectFolder(projectFolderId, session.projectName);
    projectFolder.includedChatIds.push(chatId);
    projectFoldersById[projectFolderId] = projectFolder;

    chatsById[chatId] = buildPaseoChat(chatId, session.title, subtitle, session.activityText);
    usersById[agentUserId] = buildPaseoAgentUser(agentUserId, session.title);
    result[chatId] = {
      hostId: session.hostId,
      agentId: session.agentId,
      agentUserId,
      subtitle,
      projectKey: session.projectKey,
      projectName: session.projectName,
    };

    return result;
  }, {});
  const chatIds = Object.keys(sessionsByChatId);

  global = addChats(global, chatsById);
  global = addUsers(global, usersById);

  return {
    ...global,
    paseoWorkbench: {
      isActive: global.paseoWorkbench?.isActive || false,
      activePaseoFolder: global.paseoWorkbench?.activePaseoFolder || 0,
      ownerUserId: global.currentUserId,
      chatIds,
      projectFoldersById,
      projectFolderOrder: current && current.ownerUserId === global.currentUserId
        ? current.projectFolderOrder
        : getStoredPaseoProjectFolderOrder(global.currentUserId),
      sessionsByChatId,
    },
  };
});

addActionHandler('syncPaseoWorkbenchActivity', (global, _actions, { chatId, activityText }): ActionReturnType => {
  if (!global.chats.byId[chatId]?.isPaseoAgentSession) return;

  return updateChat(global, chatId, { paseoActivityText: activityText });
});

addActionHandler('syncPaseoWorkbenchMessages', (global, _actions, { chatId, messages }): ActionReturnType => {
  if (!global.chats.byId[chatId]?.isPaseoAgentSession) return;

  const threadId = MAIN_THREAD_ID;
  const lastMessageId = messages[messages.length - 1]?.id;
  const messagesById = messages.reduce((result, message) => {
    result[message.id] = message;
    return result;
  }, {} as Record<number, typeof messages[number]>);
  const messageIds = messages.map(({ id }) => id);

  global = replaceChatMessages(global, chatId, messagesById);
  global = replaceThreadLocalStateParam(global, chatId, threadId, 'listedIds', messageIds);
  global = updateThreadInfo(global, {
    chatId,
    threadId,
    isCommentsInfo: false,
    messagesCount: messages.length,
    lastMessageId,
  });

  Object.values(global.byTabId).forEach(({ id: tabId }) => {
    if (selectCurrentMessageList(global, tabId)?.chatId === chatId) {
      global = safeReplaceViewportIds(global, chatId, threadId, messageIds, tabId);
    }
  });

  if (lastMessageId !== undefined) {
    global = updateChatLastMessageId(global, chatId, lastMessageId);
  } else {
    global = {
      ...global,
      chats: {
        ...global.chats,
        lastMessageIds: {
          ...global.chats.lastMessageIds,
          all: omit(global.chats.lastMessageIds.all || {}, [chatId]),
        },
      },
    };
  }

  return global;
});
