import type { ApiChat, ApiChatFolder, ApiUser } from '../../../api/types';
import type { PaseoWorkbenchSession } from '../../paseoWorkbench';
import type { ActionReturnType } from '../../types';
import { MAIN_THREAD_ID } from '../../../api/types';

import { omit } from '../../../util/iteratees';
import { addActionHandler } from '../../index';
import {
  buildPaseoAgentUser, buildPaseoChat, buildPaseoProjectFolder, buildPaseoSessionSubtitle,
  getPaseoAgentUserId, getPaseoChatId, getPaseoProjectFolderId,
} from '../../paseoWorkbench';
import {
  addChats, addUsers, replaceChatMessages, safeReplaceViewportIds, updateChat, updateChatLastMessageId,
} from '../../reducers';
import { replaceThreadLocalStateParam, updateThreadInfo } from '../../reducers/threads';
import { selectCurrentMessageList } from '../../selectors';

addActionHandler('setPaseoWorkbenchActive', (global, _actions, { isActive }): ActionReturnType => {
  const current = global.paseoWorkbench;
  if (current?.isActive === isActive) return;

  return {
    ...global,
    paseoWorkbench: {
      isActive,
      ownerUserId: global.currentUserId,
      chatIds: current?.chatIds || [],
      projectFoldersById: current?.projectFoldersById || {},
      sessionsByChatId: current?.sessionsByChatId || {},
    },
  };
});

addActionHandler('syncPaseoWorkbenchSessions', (global, _actions, { sessions }): ActionReturnType => {
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
      ownerUserId: global.currentUserId,
      chatIds,
      projectFoldersById,
      sessionsByChatId,
    },
  };
});

addActionHandler('syncPaseoWorkbenchActivity', (global, _actions, { chatId, activityText }): ActionReturnType => {
  if (!global.chats.byId[chatId]?.isPaseoAgentSession) return;

  return updateChat(global, chatId, { paseoActivityText: activityText });
});

addActionHandler('syncPaseoWorkbenchMessages', (global, _actions, payload): ActionReturnType => {
  const { chatId, messages } = payload;
  if (!global.chats.byId[chatId]?.isPaseoAgentSession) return;

  const threadId = MAIN_THREAD_ID;
  const lastMessageId = 'lastMessageId' in payload
    ? payload.lastMessageId
    : messages[messages.length - 1]?.id;
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
