import type { ApiChat, ApiChatFolder, ApiMessage, ApiUser } from '../api/types';

const PASEO_CHAT_ID_OFFSET = 100_000_000_000;
const PASEO_USER_ID_OFFSET = 8_000_000_000_000;

export type PaseoWorkbenchSession = {
  hostId: string;
  agentId: string;
  agentUserId: string;
  subtitle: string;
  projectKey: string;
  projectName: string;
};

export type PaseoWorkbenchSessionInput = {
  hostId: string;
  agentId: string;
  hostName: string;
  provider: string;
  title: string;
  projectKey: string;
  projectName: string;
  activityText?: string;
};

export type PaseoWorkbenchTimelineRow = {
  key: string;
  sequence: number;
  kind: 'user' | 'assistant' | 'activity';
  text: string;
  date: number;
};

export function getPaseoChatId(hostId: string, agentId: string) {
  return String(-(PASEO_CHAT_ID_OFFSET + hashId(`${hostId}:${agentId}`)));
}

export function getPaseoAgentUserId(hostId: string, agentId: string) {
  return String(PASEO_USER_ID_OFFSET + hashId(`${hostId}:${agentId}:agent`));
}

export function buildPaseoChat(chatId: string, title: string, subtitle: string, activityText?: string): ApiChat {
  return {
    id: chatId,
    type: 'chatTypeBasicGroup',
    title,
    isAgent: true,
    isMin: true,
    isPaseoAgentSession: true,
    paseoSubtitle: subtitle,
    paseoActivityText: activityText,
    membersCount: 2,
  };
}

export function getPaseoAgentProviderLabel(provider: string) {
  switch (provider.toLowerCase()) {
    case 'codex':
      return 'Codex CLI';
    case 'claude':
      return 'Claude Code';
    case 'pi':
      return 'Pi Agent';
    case 'opencode':
      return 'OpenCode';
    default:
      return provider;
  }
}

export function buildPaseoSessionSubtitle(hostName: string, provider: string) {
  return `${hostName} · ${getPaseoAgentProviderLabel(provider)}`;
}

export function getPaseoProjectFolderId(projectKey: string) {
  return -1_000_000_000 - (hashId(projectKey) % 1_000_000_000);
}

export function getOrderedPaseoProjectFolderIds(
  foldersById: Record<number, ApiChatFolder>,
  orderedIds: number[] = [],
) {
  const result: number[] = [];
  const seen = new Set<number>();

  orderedIds.forEach((id) => {
    if (foldersById[id] && !seen.has(id)) {
      result.push(id);
      seen.add(id);
    }
  });

  Object.values(foldersById)
    .sort((a, b) => a.title.text.localeCompare(b.title.text))
    .forEach(({ id }) => {
      if (!seen.has(id)) result.push(id);
    });

  return result;
}

export function buildPaseoProjectFolder(id: number, projectName: string): ApiChatFolder {
  return {
    id,
    title: { text: projectName },
    includedChatIds: [],
    excludedChatIds: [],
  };
}

export function buildPaseoAgentUser(userId: string, title: string): ApiUser {
  return {
    id: userId,
    isMin: true,
    type: 'userTypeBot',
    firstName: title,
    phoneNumber: '',
  };
}

export function buildPaseoMessages(
  chatId: string,
  agentUserId: string,
  currentUserId: string,
  rows: PaseoWorkbenchTimelineRow[],
): ApiMessage[] {
  return rows.map((row, index) => ({
    id: index + 1,
    chatId,
    content: { text: { text: row.text } },
    date: row.date,
    isOutgoing: row.kind === 'user',
    senderId: row.kind === 'user' ? currentUserId : agentUserId,
  }));
}

function hashId(value: string) {
  let hash = 2_166_136_261;

  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}
