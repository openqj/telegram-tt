export type ApiAgentComposerConfig = {
  profileId: string;
  executorBackend?: string;
  systemPresetKind?: string;
  quickActions?: string[];
  slashCommands?: string[];
  doubleSlashCommands?: string[];
  mentionCommands?: string[];
  attachmentSources?: string[];
  defaultModel: string;
  models: {
    id: string;
    name: string;
    provider?: string;
  }[];
  reasoningEfforts: ('low' | 'medium' | 'high')[];
};

export type ApiAiConversationFolder = {
  id: number;
  title: string;
  position: number;
  conversationIds: string[];
};

export type ApiAgentServer = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  hostKeyFingerprint: string;
};

export type ApiAgentServerInput = Omit<ApiAgentServer, 'id'> & { password: string };

export type ApiAgentServerStatus = {
  server: ApiAgentServer;
  status: 'ok' | 'error';
  errorCode?: string;
  output?: string;
  checkedAt: string;
};

export type ApiAgentWorkspaceFile = {
  path: string;
  name?: string;
  kind: 'file' | 'directory';
  sizeBytes?: number;
};

export type ApiAgentWorkspaceSkill = {
  path: string;
  name: string;
};

export type ApiAgentTask = {
  taskId: string;
  status: string;
  createdAt: number;
  queuePosition: number;
  progress: string;
  summary?: string;
  error?: string;
};

export type ApiAgentTaskPage = {
  tasks: ApiAgentTask[];
  nextCursor?: string;
};
