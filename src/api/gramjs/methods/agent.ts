import { sha1 } from '../../../lib/gramjs/Helpers';

import type { ApiAgentComposerConfig, ApiAgentTaskPage } from '../../types';

import { getServerTime } from '../../../util/serverTime';
import { getClient } from './client';

const AGENT_COMPOSER_CONFIG_PATH = '/owpengram/agent/composer/config';
const AGENT_WORKSPACE_FILES_PATH = '/owpengram/agent/workspace/files';
const AGENT_TASKS_PATH = '/owpengram/agent/tasks';

type ComposerConfigResponse = {
  profile_id: string;
  executor_backend?: string;
  default_model: string;
  models: { id: string; name?: string; provider?: string }[];
  reasoning_efforts: ('low' | 'medium' | 'high')[];
};

type WorkspaceFilesResponse = {
  files: { path: string; kind: 'file' | 'directory'; size_bytes?: number }[];
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

export async function fetchAgentComposerConfig({ botUserId }: { botUserId: string }) {
  const body = JSON.stringify({ bot_user_id: botUserId });
  const response = await fetchSignedAgentRequest<ComposerConfigResponse>(AGENT_COMPOSER_CONFIG_PATH, body);
  if (!response) return undefined;

  return {
    profileId: response.profile_id,
    executorBackend: response.executor_backend,
    defaultModel: response.default_model,
    models: response.models.map(({ id, name, provider }) => ({ id, name: name || id, provider })),
    reasoningEfforts: response.reasoning_efforts,
  } satisfies ApiAgentComposerConfig;
}

export async function fetchAgentWorkspaceFiles({
  botUserId,
  query,
}: {
  botUserId: string;
  query: string;
}) {
  const body = JSON.stringify({ bot_user_id: botUserId, query, limit: 50 });
  const response = await fetchSignedAgentRequest<WorkspaceFilesResponse>(AGENT_WORKSPACE_FILES_PATH, body);
  if (!response) return undefined;

  return {
    files: response.files.map(({ path, kind, size_bytes }) => ({ path, kind, sizeBytes: size_bytes })),
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
