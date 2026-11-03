import type { ApiAgentComposerConfig } from '../../../api/types';
import type { AgentComposerCommand } from './types';

const CODEX_COMMANDS: Array<{ name: string; description: string }> = [
  {
    name: 'approve',
    description: 'Approve one retry of a recent automatic-review denial, when automatic review is active.',
  },
  { name: 'archive', description: 'Archive the current chat.' },
  { name: 'chat', description: 'Choose a chat without a project before starting a new chat.' },
  { name: 'cloud', description: 'Run the chat in the cloud, when cloud execution is available.' },
  { name: 'cloud-environment', description: 'Choose the cloud environment for the chat.' },
  { name: 'compact', description: 'Compact the current chat’s context.' },
  { name: 'fast', description: 'Turn a catalog-provided Fast service tier on or off, when available.' },
  { name: 'feedback', description: 'Open the feedback dialog to submit feedback and optionally include logs.' },
  { name: 'fork', description: 'Copy a local chat into a new local chat or worktree.' },
  { name: 'goal', description: 'Set a persistent goal for ChatGPT to work toward; use /plan first to shape it.' },
  { name: 'ide-context', description: 'Turn shared IDE context on or off.' },
  { name: 'init', description: 'Generate an AGENTS.md scaffold for the current project.' },
  { name: 'local', description: 'Run the chat in the selected local project.' },
  { name: 'mcp', description: 'Open MCP status to view connected servers.' },
  {
    name: 'memories',
    description: 'Configure whether the chat can use or generate memories, when Memories is available.',
  },
  { name: 'model', description: 'Choose the model for the current chat.' },
  { name: 'new', description: 'Start a blank chat in the same local workspace, when available.' },
  { name: 'pet', description: 'Wake or tuck away the desktop pet.' },
  { name: 'pin', description: 'Pin or unpin the current chat, when available.' },
  { name: 'plan', description: 'Toggle plan mode for multi-step planning.' },
  { name: 'project', description: 'Choose a project for new chats.' },
  { name: 'prompts:', description: 'Choose a reusable Agent prompt template.' },
  { name: 'reasoning', description: 'Choose the reasoning effort for the current chat.' },
  { name: 'rename', description: 'Rename the current chat.' },
  {
    name: 'review',
    description: 'Start code review mode to review uncommitted changes or compare against a base branch.',
  },
  { name: 'side', description: 'Start a temporary side chat without interrupting the main chat.' },
  { name: 'status', description: 'Show recent task activity for this Agent.' },
  { name: 'usage', description: 'Open usage and billing settings, when available with ChatGPT sign-in.' },
  { name: 'worktree', description: 'Run the chat in a new Git worktree.' },
];

const AGENT_PROMPT_TEMPLATES = [
  {
    name: 'plan',
    description: 'Create steps and verification criteria for this request.',
    insertText: 'Create an actionable plan for this request. '
      + 'Break it into steps and include how to verify the result.\n\n',
  },
  {
    name: 'review',
    description: 'Review referenced files or changes. List actionable findings by severity and include file paths '
      + 'and line numbers.',
    insertText: 'Review the referenced files or changes. '
      + 'List actionable findings by severity and include file paths and line numbers.\n\n',
  },
  {
    name: 'explain',
    description: 'Explain referenced material in plain language.',
    insertText: 'Explain the referenced material in plain language. '
      + 'Start with its purpose, then describe how the important parts fit together.\n\n',
  },
  {
    name: 'summarize',
    description: 'Summarize key points, decisions, and open questions.',
    insertText: 'Summarize key points, decisions, and open questions.\n\n',
  },
];

export function filterAgentCommands(config: ApiAgentComposerConfig | undefined, query: string) {
  const isHermesExecutor = config?.executorBackend === 'hermes';
  const models = isHermesExecutor ? [] : (
    config?.models.map((model): AgentComposerCommand => ({
      type: 'agentComposerCommand',
      setting: 'model',
      value: model.id,
      command: `model ${model.id}`,
      description: model.provider || model.name,
    })) || []
  );
  const reasoningEfforts = isHermesExecutor ? [] : (
    config?.reasoningEfforts.map((effort): AgentComposerCommand => ({
      type: 'agentComposerCommand',
      setting: 'reasoning',
      value: effort,
      command: `reasoning ${effort}`,
      description: 'Reasoning effort',
    })) || []
  );
  const normalizedQuery = query.toLowerCase();
  if (normalizedQuery.startsWith('prompts:')) {
    const promptQuery = normalizedQuery.slice('prompts:'.length).trim();
    return AGENT_PROMPT_TEMPLATES
      .filter(({ name }) => name.startsWith(promptQuery))
      .map(({ name, description, insertText }): AgentComposerCommand => ({
        type: 'agentComposerCommand',
        setting: 'prompt',
        value: `prompts:${name}`,
        command: `prompts:${name}`,
        description,
        insertText,
      }));
  }

  if (normalizedQuery.startsWith('model ')) {
    const modelQuery = normalizedQuery.slice('model '.length);
    return models.filter((command) => command.command.toLowerCase().slice('model '.length).startsWith(modelQuery));
  }
  if (normalizedQuery.startsWith('reasoning ')) {
    const effortQuery = normalizedQuery.slice('reasoning '.length);
    return reasoningEfforts.filter((command) => (
      command.command.toLowerCase().slice('reasoning '.length).startsWith(effortQuery)
    ));
  }

  return CODEX_COMMANDS
    .filter(({ name }) => name.startsWith(normalizedQuery.trimEnd())
      && (!isHermesExecutor || (name !== 'model' && name !== 'reasoning')))
    .map(({ name, description }): AgentComposerCommand => ({
      type: 'agentComposerCommand',
      setting: name === 'model' || name === 'reasoning' ? 'submenu' : name === 'status' ? 'action' : 'command',
      value: name,
      command: name,
      description,
    }));
}
