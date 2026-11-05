import type { DaemonClient } from '@getpaseo/client/internal/daemon-client';

let client: DaemonClient | undefined;
let currentUserId: string | undefined;
const pendingMessageIds = new Map<string, string>();

export function setPaseoWorkbenchClient(nextClient: DaemonClient | undefined, nextUserId?: string) {
  client = nextClient;
  currentUserId = nextUserId;
  if (!nextClient) pendingMessageIds.clear();
}

export async function sendPaseoWorkbenchMessage(userId: string, agentId: string, text: string) {
  if (!client || currentUserId !== userId) {
    throw new Error('Paseo Workbench is disconnected.');
  }

  const signature = JSON.stringify([userId, agentId, text]);
  const messageId = pendingMessageIds.get(signature) || crypto.randomUUID();
  pendingMessageIds.set(signature, messageId);

  await client.sendAgentMessage(agentId, text, { messageId });
  pendingMessageIds.delete(signature);
}
