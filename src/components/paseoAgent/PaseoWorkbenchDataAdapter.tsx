import type { DaemonClient } from '@getpaseo/client/internal/daemon-client';
import type { ConnectionOffer } from '@getpaseo/protocol/connection-offer';
import { ConnectionOfferSchema } from '@getpaseo/protocol/connection-offer';
import { buildRelayWebSocketUrl, shouldUseTlsForDefaultHostedRelay } from '@getpaseo/protocol/daemon-endpoints';
import { memo, useEffect, useRef, useState } from '@teact';
import { getActions, getGlobal } from '../../global';

import type { GlobalState } from '../../global/types';

import {
  buildPaseoMessages, getPaseoAgentUserId, getPaseoChatId, type PaseoWorkbenchTimelineRow,
} from '../../global/paseoWorkbench';
import { setPaseoWorkbenchClient } from '../../global/paseoWorkbenchClient';
import { selectCurrentMessageList } from '../../global/selectors';
import { getServerTime } from '../../util/serverTime';
import { callApi } from '../../api/gramjs';

import useSelector from '../../hooks/data/useSelector';
import useLastCallback from '../../hooks/useLastCallback';

type OwnProps = {
  isOpen: boolean;
};

type PaseoIdentitySession = {
  accessToken: string;
  accountId: string;
  expiresIn: number;
  identityUrl: string;
  workbenchAccessToken: string;
  workbenchExpiresIn: number;
};

type PaseoHost = {
  server_id: string;
  host_name: string;
  daemon_public_key_b64: string;
  relay_endpoint: string;
  relay_use_tls: boolean;
};

type AgentTimelineEvent = Parameters<Parameters<DaemonClient['subscribeAgentTimeline']>[1]>[0];

const PAIRING_STORAGE_KEY = 'telegram-web-a:paseo-pairing:v1';
const TIMELINE_LIMIT = 50;
const IDENTITY_TOKEN_MAX_TTL_SECONDS = 120;
const selectCurrentUserId = (global: GlobalState) => global.currentUserId;
const selectCurrentPaseoAgentId = (global: GlobalState) => {
  const messageList = selectCurrentMessageList(global);
  return messageList && global.paseoWorkbench?.sessionsByChatId[messageList.chatId]?.agentId;
};

let daemonClientModulePromise: Promise<typeof import('@getpaseo/client/internal/daemon-client')> | undefined;

function loadDaemonClient() {
  if (daemonClientModulePromise) return daemonClientModulePromise;

  const modulePromise = import('@getpaseo/client/internal/daemon-client');
  daemonClientModulePromise = modulePromise;
  void modulePromise.catch(() => {
    if (daemonClientModulePromise === modulePromise) daemonClientModulePromise = undefined;
  });
  return modulePromise;
}

export function prefetchPaseoDaemonClient() {
  void loadDaemonClient().catch(() => {});
}

function readStoredOffer(): ConnectionOffer | undefined {
  try {
    const stored = window.localStorage.getItem(PAIRING_STORAGE_KEY);
    return stored ? ConnectionOfferSchema.parse(JSON.parse(stored)) : undefined;
  } catch {
    return undefined;
  }
}

async function requestPaseoWorkbench<T>(
  session: PaseoIdentitySession,
  path: string,
): Promise<T> {
  const baseUrl = session.identityUrl.endsWith('/') ? session.identityUrl : `${session.identityUrl}/`;
  const response = await fetch(new URL(`v1/auth/paseo/${path}`, baseUrl), {
    headers: { Authorization: `Bearer ${session.workbenchAccessToken}` },
    cache: 'no-store',
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`Paseo Workbench request failed (${response.status}).`);
  return response.json() as Promise<T>;
}

function getHostConnectionOffer(host: PaseoHost): ConnectionOffer {
  return ConnectionOfferSchema.parse({
    v: 2,
    serverId: host.server_id,
    daemonPublicKeyB64: host.daemon_public_key_b64,
    relay: { endpoint: host.relay_endpoint, useTls: host.relay_use_tls },
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function getTimelinePresentation(value: unknown): Pick<PaseoWorkbenchTimelineRow, 'kind' | 'text'> {
  const root = asRecord(value);
  const event = asRecord(root.item ?? asRecord(root.payload).event ?? value);
  const item = asRecord(event.item ?? event);
  const itemType = item.type;

  if (itemType === 'user_message' || itemType === 'assistant_message') {
    return {
      kind: itemType === 'user_message' ? 'user' : 'assistant',
      text: typeof item.text === 'string' ? item.text : '',
    };
  }

  if (itemType === 'reasoning' || itemType === 'turn_started') {
    return { kind: 'activity', text: '正在思考…' };
  }

  if (itemType === 'tool_call') {
    return { kind: 'activity', text: getToolActivityText(item) };
  }

  if (itemType === 'permission_requested') {
    return { kind: 'activity', text: '等待授权…' };
  }

  if (itemType === 'turn_completed') {
    return { kind: 'activity', text: '任务已完成' };
  }

  if (itemType === 'turn_failed') {
    return { kind: 'activity', text: '任务执行失败' };
  }

  if (itemType === 'turn_canceled') {
    return { kind: 'activity', text: '任务已取消' };
  }

  const text = item.message ?? item.text;

  return {
    kind: 'activity',
    text: typeof text === 'string' ? text : '正在处理…',
  };
}

function getToolActivityText(item: Record<string, unknown>) {
  const detail = asRecord(item.detail);
  switch (detail.type) {
    case 'shell':
      return '正在运行命令…';
    case 'read':
      return '正在读取文件…';
    case 'edit':
    case 'write':
      return '正在编辑文件…';
    case 'search':
      return '正在搜索…';
    case 'fetch':
      return '正在读取网页…';
    default:
      return typeof item.name === 'string' ? `正在调用工具：${item.name}` : '正在调用工具…';
  }
}

function getPaseoActivityStatus(value: unknown): string | false | undefined {
  const event = asRecord(value);

  switch (event.type) {
    case 'thread_started':
      return '正在准备执行…';
    case 'turn_started':
      return '正在思考…';
    case 'turn_completed':
    case 'turn_canceled':
      return false;
    case 'turn_failed':
      return '任务执行失败';
    case 'permission_requested':
      return '等待授权…';
    case 'permission_resolved':
      return '正在思考…';
    case 'attention_required':
      return event.reason === 'permission' ? '等待授权…' : event.reason === 'error' ? '任务执行失败' : false;
    case 'timeline': {
      const item = asRecord(event.item);
      if (item.type === 'reasoning') return '正在思考…';
      if (item.type === 'tool_call') return getToolActivityText(item);
      return undefined;
    }
    default:
      return undefined;
  }
}

function getPaseoAgentStatusText(status: string) {
  switch (status) {
    case 'initializing':
      return '正在准备执行…';
    case 'running':
      return '正在思考…';
    case 'error':
      return '任务执行失败';
    default:
      return undefined;
  }
}

function getTimelineDate(value: string) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? getServerTime() : Math.floor(timestamp / 1000);
}

function mergeTimelineRows(
  current: PaseoWorkbenchTimelineRow[],
  incoming: PaseoWorkbenchTimelineRow[],
): PaseoWorkbenchTimelineRow[] {
  const rows = new Map(current.map((row) => [row.key, row]));
  incoming.forEach((row) => rows.set(row.key, row));
  return [...rows.values()]
    .sort((a, b) => a.sequence - b.sequence)
    .slice(-TIMELINE_LIMIT);
}

function PaseoWorkbenchDataAdapter({ isOpen }: OwnProps) {
  const {
    showNotification,
    syncPaseoWorkbenchActivity,
    syncPaseoWorkbenchMessages,
    syncPaseoWorkbenchSessions,
  } = getActions();
  const currentUserId = useSelector(selectCurrentUserId);
  const selectedAgentIdFromChat = useSelector(selectCurrentPaseoAgentId);
  const [offer] = useState(readStoredOffer);
  const [hostId, setHostId] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [timeline, setTimeline] = useState<PaseoWorkbenchTimelineRow[]>([]);

  const clientRef = useRef<DaemonClient>();
  const connectedUserIdRef = useRef<string>();
  const identityRequestRef = useRef<Promise<PaseoIdentitySession>>();
  const identityTelegramUserIdRef = useRef<string>();
  const identityAccountIdRef = useRef<string>();
  const connectingRef = useRef(false);
  const timelineGenerationRef = useRef(0);
  const agentDirectorySubscriptionRef = useRef<ReturnType<DaemonClient['observeAgents']>>();
  const timelineSubscriptionRef = useRef<ReturnType<DaemonClient['subscribeAgentTimeline']>>();
  const isConnected = Boolean(
    clientRef.current && connectedUserIdRef.current === currentUserId
    && clientRef.current.getConnectionState().status === 'connected',
  );

  const getPaseoIdentitySession = useLastCallback((telegramUserId: string) => {
    if (getGlobal().currentUserId !== telegramUserId ||
      (identityTelegramUserIdRef.current && identityTelegramUserIdRef.current !== telegramUserId)) {
      return Promise.reject(new Error('Telegram account changed.'));
    }
    if (identityRequestRef.current) return identityRequestRef.current;

    const request = (async () => {
      const session = await callApi('fetchPaseoIdentitySession');
      if (getGlobal().currentUserId !== telegramUserId) {
        throw new Error('Telegram account changed.');
      }
      if (!session || typeof session.accessToken !== 'string' || !session.accessToken ||
        typeof session.accountId !== 'string' || !session.accountId.startsWith('acct:') ||
        !Number.isInteger(session.expiresIn) || session.expiresIn <= 0 ||
        session.expiresIn > IDENTITY_TOKEN_MAX_TTL_SECONDS ||
        typeof session.identityUrl !== 'string' || !session.identityUrl ||
        typeof session.workbenchAccessToken !== 'string' || !session.workbenchAccessToken ||
        !Number.isInteger(session.workbenchExpiresIn) || session.workbenchExpiresIn <= 0 ||
        session.workbenchExpiresIn > IDENTITY_TOKEN_MAX_TTL_SECONDS) {
        throw new Error('Paseo Identity session is unavailable.');
      }
      if (identityAccountIdRef.current && identityAccountIdRef.current !== session.accountId) {
        throw new Error('Paseo account changed.');
      }
      identityTelegramUserIdRef.current = telegramUserId;
      identityAccountIdRef.current = session.accountId;
      return session;
    })();

    identityRequestRef.current = request;
    void request.then(() => {
      if (identityRequestRef.current === request) identityRequestRef.current = undefined;
    }, () => {
      if (identityRequestRef.current === request) identityRequestRef.current = undefined;
    });
    return request;
  });

  const releaseTimeline = useLastCallback(async () => {
    timelineGenerationRef.current += 1;
    const subscription = timelineSubscriptionRef.current;
    timelineSubscriptionRef.current = undefined;
    await subscription?.release().catch(() => {});
  });

  const clearClient = useLastCallback(async (clearSessions = false) => {
    await releaseTimeline();
    const agentDirectorySubscription = agentDirectorySubscriptionRef.current;
    agentDirectorySubscriptionRef.current = undefined;
    await agentDirectorySubscription?.release().catch(() => {});
    const client = clientRef.current;
    clientRef.current = undefined;
    connectedUserIdRef.current = undefined;
    setPaseoWorkbenchClient(undefined);
    await client?.close().catch(() => {});
    setHostId('');
    setSelectedAgentId('');
    setTimeline([]);
    if (clearSessions) syncPaseoWorkbenchSessions({ sessions: [] });
  });

  const loadTimeline = useLastCallback(async (
    client: DaemonClient,
    agentId: string,
    generation: number,
  ) => {
    const page = await client.fetchAgentTimeline(agentId, {
      direction: 'tail',
      limit: TIMELINE_LIMIT,
      trackDeliveryReceipt: true,
    });
    if (generation !== timelineGenerationRef.current || clientRef.current !== client) return;
    const rows = page.entries.map((entry) => ({
      key: `${page.epoch}:${entry.seqStart}-${entry.seqEnd}`,
      sequence: entry.seqEnd,
      date: getTimelineDate(entry.timestamp),
      ...getTimelinePresentation(entry.item),
    }));
    setTimeline((current) => mergeTimelineRows(current, rows));
    if (page.deliveryId) {
      client.acknowledgeAgentTimelineDelivery({
        agentId,
        deliveryId: page.deliveryId,
        epoch: page.epoch,
        seq: page.endCursor?.seq,
      });
    }
  });

  const selectAgent = useLastCallback(async (agentId: string) => {
    const activeClient = clientRef.current;
    if (!activeClient || connectedUserIdRef.current !== currentUserId) return;

    const generation = timelineGenerationRef.current + 1;
    timelineGenerationRef.current = generation;
    const currentSubscription = timelineSubscriptionRef.current;
    timelineSubscriptionRef.current = undefined;
    setSelectedAgentId(agentId);
    setTimeline([]);
    await currentSubscription?.release().catch(() => {});
    if (generation !== timelineGenerationRef.current || clientRef.current !== activeClient) return;

    const subscription = activeClient.subscribeAgentTimeline(agentId, (event: AgentTimelineEvent) => {
      if (generation !== timelineGenerationRef.current || clientRef.current !== activeClient) return;
      if (event.type === 'agent.timeline.replacement') {
        setTimeline([]);
        void loadTimeline(activeClient, agentId, generation).catch(() => {
          showNotification({ message: { key: 'ErrorUnexpected' } });
        });
        return;
      }
      if (event.type === 'agent.timeline.subscription_restored') {
        void loadTimeline(activeClient, agentId, generation).catch(() => {
          showNotification({ message: { key: 'ErrorUnexpected' } });
        });
        return;
      }
      if (event.type === 'agent.timeline.error') {
        syncPaseoWorkbenchActivity({ chatId: getPaseoChatId(hostId, agentId) });
        showNotification({ message: event.payload.error });
        return;
      }
      if (event.type !== 'agent_stream') return;

      const payload = event.payload;
      const activityText = getPaseoActivityStatus(payload.event);
      if (activityText !== undefined) {
        syncPaseoWorkbenchActivity({
          chatId: getPaseoChatId(hostId, agentId),
          activityText: activityText || undefined,
        });
      }
      const sequence = payload.seq ?? 0;
      const key = payload.seq !== undefined && payload.epoch
        ? `${payload.epoch}:${payload.seq}-${payload.seq}`
        : `${payload.timestamp}:${crypto.randomUUID()}`;
      setTimeline((current) => mergeTimelineRows(current, [{
        key,
        sequence,
        date: getTimelineDate(payload.timestamp),
        ...getTimelinePresentation(payload.event),
      }]));
      if (payload.deliveryId && payload.epoch) {
        activeClient.acknowledgeAgentTimelineDelivery({
          agentId,
          deliveryId: payload.deliveryId,
          epoch: payload.epoch,
          seq: payload.seq,
        });
      }
    });
    timelineSubscriptionRef.current = subscription;

    try {
      await subscription.ready;
      if (generation !== timelineGenerationRef.current || clientRef.current !== activeClient) {
        await subscription.release().catch(() => {});
        if (timelineSubscriptionRef.current === subscription) timelineSubscriptionRef.current = undefined;
        return;
      }
      await loadTimeline(activeClient, agentId, generation);
    } catch {
      await subscription.release().catch(() => {});
      if (timelineSubscriptionRef.current === subscription) timelineSubscriptionRef.current = undefined;
      if (generation === timelineGenerationRef.current && clientRef.current === activeClient) {
        showNotification({ message: { key: 'ErrorUnexpected' } });
      }
    }
  });

  const connect = useLastCallback(async () => {
    if (!currentUserId || connectingRef.current || clientRef.current) return;
    connectingRef.current = true;
    const telegramUserId = currentUserId;
    let nextClient: DaemonClient | undefined;

    try {
      const session = await getPaseoIdentitySession(telegramUserId);
      const result = await requestPaseoWorkbench<{ hosts?: PaseoHost[] }>(session, 'hosts');
      if (getGlobal().currentUserId !== telegramUserId) return;

      const host = result.hosts?.[0];
      const connectionOffer = host ? getHostConnectionOffer(host) : offer;
      if (!connectionOffer) {
        syncPaseoWorkbenchSessions({ sessions: [] });
        return;
      }

      const requestIdentityToken = async () => {
        if (getGlobal().currentUserId !== telegramUserId) throw new Error('Telegram account changed.');
        return (await getPaseoIdentitySession(telegramUserId)).accessToken;
      };
      const clientModulePromise = loadDaemonClient();
      let initialIdentityTokenPromise: Promise<string> | undefined = requestIdentityToken();
      void initialIdentityTokenPromise.catch(() => {});
      const identityTokenProvider = () => {
        const pendingToken = initialIdentityTokenPromise;
        initialIdentityTokenPromise = undefined;
        return pendingToken ?? requestIdentityToken();
      };
      const { DaemonClient: Client } = await clientModulePromise;
      const useTls = connectionOffer.relay.useTls
        ?? shouldUseTlsForDefaultHostedRelay(connectionOffer.relay.endpoint);
      nextClient = new Client({
        url: buildRelayWebSocketUrl({
          endpoint: connectionOffer.relay.endpoint,
          useTls,
          serverId: connectionOffer.serverId,
          role: 'client',
        }),
        clientId: `tweb-${crypto.randomUUID()}`,
        clientType: 'browser',
        e2ee: { enabled: true, daemonPublicKeyB64: connectionOffer.daemonPublicKeyB64 },
        identityTokenProvider,
        reconnect: { enabled: true },
      });
      clientRef.current = nextClient;
      connectedUserIdRef.current = telegramUserId;
      await nextClient.connect();
      if (getGlobal().currentUserId !== telegramUserId || clientRef.current !== nextClient) return;

      setPaseoWorkbenchClient(nextClient, telegramUserId);
      const agentPage = await nextClient.fetchAgents({
        scope: 'active',
        page: { limit: 200 },
        subscribe: {},
      });
      if (getGlobal().currentUserId !== telegramUserId || clientRef.current !== nextClient) return;

      const currentHostId = connectionOffer.serverId;
      setHostId(currentHostId);
      const agentDirectorySubscription = agentPage.subscription;
      agentDirectorySubscriptionRef.current = agentDirectorySubscription;
      agentDirectorySubscription.subscribe({
        snapshot: ({ entries }) => {
          if (getGlobal().currentUserId !== telegramUserId || clientRef.current !== nextClient) return;
          syncPaseoWorkbenchSessions({
            sessions: entries.map(({ agent, project }) => ({
              hostId: currentHostId,
              agentId: agent.id,
              hostName: host?.host_name || currentHostId,
              provider: agent.provider,
              title: agent.title || agent.id,
              projectKey: project.projectKey,
              projectName: project.projectName,
              activityText: getPaseoAgentStatusText(agent.status),
            })),
          });
        },
        update: (message) => {
          if (message.type !== 'agent_update' || getGlobal().currentUserId !== telegramUserId
            || clientRef.current !== nextClient) return;

          const { payload } = message;
          syncPaseoWorkbenchActivity({
            chatId: getPaseoChatId(currentHostId, payload.kind === 'upsert' ? payload.agent.id : payload.agentId),
            activityText: payload.kind === 'upsert' ? getPaseoAgentStatusText(payload.agent.status) : undefined,
          });
        },
      });
    } catch {
      if (clientRef.current === nextClient) {
        await clearClient(true);
      } else {
        await nextClient?.close().catch(() => {});
        syncPaseoWorkbenchSessions({ sessions: [] });
      }
      if (getGlobal().currentUserId === telegramUserId) {
        showNotification({ message: { key: 'ErrorUnexpected' } });
      }
    } finally {
      connectingRef.current = false;
    }
  });

  useEffect(() => {
    if (isOpen && currentUserId && !clientRef.current && !connectingRef.current) {
      void connect();
    }
  }, [connect, currentUserId, isOpen]);

  useEffect(() => {
    if (identityTelegramUserIdRef.current && identityTelegramUserIdRef.current !== currentUserId) {
      identityRequestRef.current = undefined;
      identityTelegramUserIdRef.current = undefined;
      identityAccountIdRef.current = undefined;
      void clearClient(true).then(() => {
        if (isOpen && getGlobal().currentUserId) void connect();
      });
    }
  }, [clearClient, connect, currentUserId, isOpen]);

  useEffect(() => {
    if (!isOpen || !selectedAgentIdFromChat) {
      if (selectedAgentId) {
        void releaseTimeline();
        setSelectedAgentId('');
      }
      return;
    }

    if (isConnected && selectedAgentIdFromChat !== selectedAgentId) {
      void selectAgent(selectedAgentIdFromChat);
    }
  }, [currentUserId, isConnected, isOpen, releaseTimeline, selectAgent, selectedAgentId, selectedAgentIdFromChat]);

  useEffect(() => {
    if (!currentUserId || !hostId || !selectedAgentId) return;
    const chatId = getPaseoChatId(hostId, selectedAgentId);
    const agentUserId = getPaseoAgentUserId(hostId, selectedAgentId);
    syncPaseoWorkbenchMessages({
      chatId,
      messages: buildPaseoMessages(chatId, agentUserId, currentUserId, timeline),
    });
  }, [currentUserId, hostId, selectedAgentId, syncPaseoWorkbenchMessages, timeline]);

  useEffect(() => () => {
    void clearClient();
  }, [clearClient]);

  return undefined;
}

export default memo(PaseoWorkbenchDataAdapter);
