import { sha1 } from '../../../lib/gramjs/Helpers';

import type {
  ApiAgentComposerConfig, ApiAgentServer, ApiAgentServerInput, ApiAgentServerStatus, ApiAgentTaskPage,
  ApiAiConversationFolder,
} from '../../types';

import { getServerTime } from '../../../util/serverTime';
import { getClient } from './client';

const AGENT_COMPOSER_CONFIG_PATH = '/owpengram/agent/composer/config';
const AGENT_WORKSPACE_FILES_PATH = '/owpengram/agent/workspace/files';
const AGENT_TASKS_PATH = '/owpengram/agent/tasks';
const AGENT_SERVERS_SAVE_PATH = '/owpengram/agent/servers/save';
const AGENT_SERVERS_LIST_PATH = '/owpengram/agent/servers/list';
const AGENT_SERVER_STATUS_PATH = '/owpengram/agent/servers/status';
const AGENT_FOLDERS_LIST_PATH = '/owpengram/agent/folders/list';
const AGENT_FOLDERS_SAVE_PATH = '/owpengram/agent/folders/save';
const AGENT_FOLDERS_DELETE_PATH = '/owpengram/agent/folders/delete';
const AGENT_FOLDERS_REORDER_PATH = '/owpengram/agent/folders/reorder';
const AGENT_FOLDERS_MEMBERSHIP_PATH = '/owpengram/agent/folders/membership';

type ComposerConfigResponse = {
  profile_id: string;
  executor_backend?: string;
  system_preset_kind?: string;
  quick_actions?: string[];
  slash_commands?: string[];
  double_slash_commands?: string[];
  mention_commands?: string[];
  attachment_sources?: string[];
  default_model: string;
  models: { id: string; name?: string; provider?: string }[];
  reasoning_efforts: ('low' | 'medium' | 'high')[];
};

type WorkspaceFilesResponse = {
  files: { path: string; name?: string; kind: 'file' | 'directory'; size_bytes?: number }[];
  truncated: boolean;
};

type TasksResponse = {
  tasks: {
    task_id: string;
    status: string;
    created_at: string;
    queue_position: number;
    progress: string;
    summary?: string;
    error?: string;
  }[];
  next_cursor?: string;
};

type AgentServerResponse = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  host_key_fingerprint: string;
};

type AgentConversationFolderResponse = {
  id: number;
  title: string;
  position: number;
  conversation_ids: string[];
};

export async function fetchAiConversationFolders() {
  const response = await fetchSignedAgentRequest<{ folders: AgentConversationFolderResponse[] }>(
    AGENT_FOLDERS_LIST_PATH,
    '{}',
  );
  return response?.folders.map(mapAiConversationFolder);
}

export async function saveAiConversationFolder({ folderId, title }: { folderId?: number; title: string }) {
  const body = JSON.stringify({ folder_id: folderId, title });
  const response = await fetchSignedAgentRequest<AgentConversationFolderResponse>(AGENT_FOLDERS_SAVE_PATH, body);
  return response ? mapAiConversationFolder(response) : undefined;
}

export async function deleteAiConversationFolder({ folderId }: { folderId: number }) {
  const body = JSON.stringify({ folder_id: folderId });
  return fetchSignedAgentRequest<{ ok: boolean }>(AGENT_FOLDERS_DELETE_PATH, body);
}

export async function reorderAiConversationFolders({ folderIds }: { folderIds: number[] }) {
  const body = JSON.stringify({ folder_ids: folderIds });
  const response = await fetchSignedAgentRequest<{ folders: AgentConversationFolderResponse[] }>(
    AGENT_FOLDERS_REORDER_PATH,
    body,
  );
  return response?.folders.map(mapAiConversationFolder);
}

export async function saveAiConversationFolderMembership({
  conversationId,
  folderIds,
}: {
  conversationId: string;
  folderIds: number[];
}) {
  const body = JSON.stringify({ conversation_id: conversationId, folder_ids: folderIds });
  return fetchSignedAgentRequest<{ folder_ids: number[] }>(AGENT_FOLDERS_MEMBERSHIP_PATH, body);
}

function mapAiConversationFolder(folder: AgentConversationFolderResponse): ApiAiConversationFolder {
  return {
    id: folder.id,
    title: folder.title,
    position: folder.position,
    conversationIds: folder.conversation_ids,
  };
}

export async function fetchAgentComposerConfig({ botUserId }: { botUserId: string }) {
  const body = JSON.stringify({ bot_user_id: botUserId });
  const response = await fetchSignedAgentRequest<ComposerConfigResponse>(AGENT_COMPOSER_CONFIG_PATH, body);
  return response ? mapAgentComposerConfig(response) : undefined;
}

function mapAgentComposerConfig(response: ComposerConfigResponse): ApiAgentComposerConfig {
  return {
    profileId: response.profile_id,
    executorBackend: response.executor_backend,
    systemPresetKind: response.system_preset_kind,
    quickActions: response.quick_actions,
    slashCommands: response.slash_commands,
    doubleSlashCommands: response.double_slash_commands,
    mentionCommands: response.mention_commands,
    attachmentSources: response.attachment_sources,
    defaultModel: response.default_model,
    models: response.models.map(({ id, name, provider }) => ({ id, name: name || id, provider })),
    reasoningEfforts: response.reasoning_efforts,
  } satisfies ApiAgentComposerConfig;
}

export async function saveAgentServer({
  botUserId,
  server,
}: {
  botUserId: string;
  server: ApiAgentServerInput;
}): Promise<ApiAgentServer | undefined> {
  const body = JSON.stringify({
    bot_user_id: botUserId,
    name: server.name,
    host: server.host,
    port: server.port,
    username: server.username,
    password: server.password,
    host_key_fingerprint: server.hostKeyFingerprint,
  });
  const response = await fetchSignedAgentRequest<AgentServerResponse>(AGENT_SERVERS_SAVE_PATH, body);
  return response ? mapAgentServer(response) : undefined;
}

export async function fetchAgentServers({ botUserId }: { botUserId: string }): Promise<ApiAgentServer[] | undefined> {
  const body = JSON.stringify({ bot_user_id: botUserId });
  const response = await fetchSignedAgentRequest<{ servers: AgentServerResponse[] }>(AGENT_SERVERS_LIST_PATH, body);
  return response?.servers.map(mapAgentServer);
}

export async function fetchAgentServerStatus({
  botUserId,
  serverId,
}: {
  botUserId: string;
  serverId: string;
}): Promise<ApiAgentServerStatus | undefined> {
  const body = JSON.stringify({ bot_user_id: botUserId, server_id: serverId });
  const response = await fetchSignedAgentRequest<{
    server: AgentServerResponse;
    status: 'ok' | 'error';
    error_code?: string;
    output?: string;
    checked_at: string;
  }>(AGENT_SERVER_STATUS_PATH, body);
  if (!response) return undefined;
  return {
    server: mapAgentServer(response.server),
    status: response.status,
    errorCode: response.error_code,
    output: response.output,
    checkedAt: response.checked_at,
  };
}

function mapAgentServer(server: AgentServerResponse): ApiAgentServer {
  return {
    id: server.id,
    name: server.name,
    host: server.host,
    port: server.port,
    username: server.username,
    hostKeyFingerprint: server.host_key_fingerprint,
  };
}

export async function fetchAgentWorkspaceFiles({
  botUserId,
  query,
  kind: listingKind,
}: {
  botUserId: string;
  query: string;
  kind: 'files' | 'skills';
}) {
  const body = JSON.stringify({ bot_user_id: botUserId, query, kind: listingKind, limit: 50 });
  const response = await fetchSignedAgentRequest<WorkspaceFilesResponse>(AGENT_WORKSPACE_FILES_PATH, body);
  if (!response) return undefined;

  return {
    files: response.files.map(({ path, name, kind, size_bytes }) => ({ path, name, kind, sizeBytes: size_bytes })),
    truncated: response.truncated,
  };
}

export async function fetchAgentTasks({
  botUserId,
  cursor,
  limit = 50,
}: {
  botUserId: string;
  cursor?: string;
  limit?: number;
}) {
  const body = JSON.stringify({ bot_user_id: botUserId, cursor, limit });
  const response = await fetchSignedAgentRequest<TasksResponse>(AGENT_TASKS_PATH, body);
  if (!response) return undefined;

  return {
    tasks: response.tasks.map(({ task_id, status, created_at, queue_position, progress, summary, error }) => ({
      taskId: task_id,
      status,
      createdAt: Date.parse(created_at) / 1000,
      queuePosition: queue_position,
      progress,
      summary,
      error,
    })),
    nextCursor: response.next_cursor,
  } satisfies ApiAgentTaskPage;
}

async function fetchSignedAgentRequest<T>(path: string, body: string): Promise<T | undefined> {
  const authKey = getClient().session.getAuthKey();
  const key = authKey?.getKey();
  if (!authKey || !key) return undefined;

  const authKeyHash = await sha1(key);
  const authKeyId = bytesToHex(authKeyHash.slice(12, 20));
  const timestamp = String(getServerTime());
  const bodyHash = bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))));
  const signaturePayload = `POST\n${path}\n${timestamp}\n${bodyHash}`;
  const signingKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = bytesToHex(new Uint8Array(await crypto.subtle.sign(
    'HMAC', signingKey, new TextEncoder().encode(signaturePayload),
  )));

  const response = await fetch(new URL(path, globalThis.location.origin), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Owpengram-Auth-Key-Id': authKeyId,
      'X-Owpengram-Auth-Timestamp': timestamp,
      'X-Owpengram-Auth-Signature': signature,
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`Agent composer request failed (${response.status})`);
  }

  return response.json() as Promise<T>;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
