export type ApiAgentComposerConfig = {
  profileId: string;
  executorBackend?: string;
  defaultModel: string;
  models: {
    id: string;
    name: string;
    provider?: string;
  }[];
  reasoningEfforts: ('low' | 'medium' | 'high')[];
};

export type ApiAgentWorkspaceFile = {
  path: string;
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
