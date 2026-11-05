import { useEffect, useState } from '../lib/teact/teact';

import type {
  ApiAgentComposerConfig, ApiAgentServer, ApiAgentServerInput, ApiAgentServerStatus,
  ApiAgentTaskPage, ApiAgentWorkspaceFile,
} from '../api/types';

import { callApi } from '../api/gramjs';

const composerConfigs = new Map<string, ApiAgentComposerConfig>();
const composerConfigSubscribers = new Map<string, Set<(config: ApiAgentComposerConfig) => void>>();
const composerConfigRequests = new Map<string, Promise<ApiAgentComposerConfig | undefined>>();

export function useAgentComposerConfig(botUserId?: string) {
  const [state, setState] = useState(() => ({
    botUserId,
    config: botUserId ? composerConfigs.get(botUserId) : undefined,
  }));

  useEffect(() => {
    let isActive = true;
    if (!botUserId) {
      setState({ botUserId: undefined, config: undefined });
      return () => {
        isActive = false;
      };
    }

    const cached = composerConfigs.get(botUserId);
    setState({ botUserId, config: cached });
    const subscriber = (config: ApiAgentComposerConfig) => setState({ botUserId, config });
    const subscribers = composerConfigSubscribers.get(botUserId) || new Set();
    subscribers.add(subscriber);
    composerConfigSubscribers.set(botUserId, subscribers);
    fetchAndPublishAgentComposerConfig(botUserId).then((result) => {
      if (isActive && !result && !cached) setState({ botUserId, config: undefined });
    }).catch(() => {
      if (isActive && !cached) setState({ botUserId, config: undefined });
    });

    return () => {
      isActive = false;
      subscribers.delete(subscriber);
      if (subscribers.size === 0) composerConfigSubscribers.delete(botUserId);
    };
  }, [botUserId]);

  if (!botUserId) return undefined;
  return state.botUserId === botUserId ? state.config : composerConfigs.get(botUserId);
}

export async function fetchAgentWorkspaceFiles(
  botUserId: string,
  query: string,
  kind: 'files' | 'skills',
): Promise<ApiAgentWorkspaceFile[]> {
  const response = await callApi('fetchAgentWorkspaceFiles', { botUserId, query, kind });
  return response?.files || [];
}

export async function fetchAgentTasks(botUserId: string): Promise<ApiAgentTaskPage> {
  const response = await callApi('fetchAgentTasks', { botUserId });
  if (!response) throw new Error('Agent task activity is unavailable');
  return response;
}

export function saveAgentServer(botUserId: string, server: ApiAgentServerInput): Promise<ApiAgentServer | undefined> {
  return callApi('saveAgentServer', { botUserId, server });
}

export function fetchAgentServers(botUserId: string): Promise<ApiAgentServer[] | undefined> {
  return callApi('fetchAgentServers', { botUserId });
}

export function fetchAgentServerStatus(botUserId: string, serverId: string): Promise<ApiAgentServerStatus | undefined> {
  return callApi('fetchAgentServerStatus', { botUserId, serverId });
}

function publishAgentComposerConfig(botUserId: string, config: ApiAgentComposerConfig) {
  composerConfigs.set(botUserId, config);
  composerConfigSubscribers.get(botUserId)?.forEach((subscriber) => subscriber(config));
}

function fetchAndPublishAgentComposerConfig(botUserId: string) {
  const cached = composerConfigs.get(botUserId);
  if (cached) return Promise.resolve(cached);

  const existingRequest = composerConfigRequests.get(botUserId);
  if (existingRequest) return existingRequest;

  const request = callApi('fetchAgentComposerConfig', { botUserId }).then((result) => {
    if (result) publishAgentComposerConfig(botUserId, result);
    return result;
  }).finally(() => {
    composerConfigRequests.delete(botUserId);
  });
  composerConfigRequests.set(botUserId, request);
  return request;
}
