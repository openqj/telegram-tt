import { useEffect, useState } from '../lib/teact/teact';

import type { ApiAgentWorkspaceSkill, ApiMessageEntity, ApiMessageEntityDefault } from '../api/types';
import { ApiMessageEntityTypes } from '../api/types';

import { AGENT_MODEL_NAME, AGENT_REASONING_EFFORT } from '../config';
import { readSessionValue, writeSessionValue } from './passcode/sessionStore';

export type AgentReasoningEffort = 'low' | 'medium' | 'high';

export type AgentConversationSettings = {
  model: string;
  reasoningEffort: AgentReasoningEffort;
  workspaceFileRefs?: string[];
  workspaceSkillRefs?: ApiAgentWorkspaceSkill[];
};

export type AgentComposerSettingCapabilities = {
  canOverrideModel?: boolean;
  canOverrideReasoning?: boolean;
};

const REASONING_EFFORTS: AgentReasoningEffort[] = ['low', 'medium', 'high'];
const SETTINGS_STORAGE_PREFIX = 'agent-conversation-settings:';
const SETTINGS_CHANGED_EVENT = 'agent-conversation-settings-changed';

const DEFAULT_SETTINGS: AgentConversationSettings = {
  model: AGENT_MODEL_NAME,
  reasoningEffort: AGENT_REASONING_EFFORT,
};

export function getAgentConversationSettings(
  chatId: string,
  defaultModel = AGENT_MODEL_NAME,
): AgentConversationSettings {
  const value = readSessionValue(`${SETTINGS_STORAGE_PREFIX}${chatId}`);
  if (!value) return { ...DEFAULT_SETTINGS, model: defaultModel };

  try {
    const stored = JSON.parse(value) as Partial<AgentConversationSettings>;
    return {
      model: isValidAgentModel(stored.model) ? stored.model.trim() : defaultModel,
      reasoningEffort: REASONING_EFFORTS.includes(stored.reasoningEffort as AgentReasoningEffort)
        ? stored.reasoningEffort as AgentReasoningEffort
        : DEFAULT_SETTINGS.reasoningEffort,
      workspaceFileRefs: Array.isArray(stored.workspaceFileRefs)
        ? stored.workspaceFileRefs.filter(isValidAgentWorkspacePath).slice(0, 10)
        : [],
      workspaceSkillRefs: Array.isArray(stored.workspaceSkillRefs)
        ? stored.workspaceSkillRefs.filter(isValidAgentWorkspaceSkill).slice(0, 8)
        : [],
    };
  } catch {
    return { ...DEFAULT_SETTINGS, model: defaultModel, workspaceFileRefs: [] };
  }
}

export function saveAgentConversationSettings(chatId: string, settings: AgentConversationSettings) {
  writeSessionValue(`${SETTINGS_STORAGE_PREFIX}${chatId}`, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT, { detail: chatId }));
}

export function useAgentConversationSettings(chatId: string, defaultModel = AGENT_MODEL_NAME) {
  const [settings, setSettings] = useState(() => getAgentConversationSettings(chatId, defaultModel));

  useEffect(() => {
    setSettings(getAgentConversationSettings(chatId, defaultModel));

    const handleSettingsChanged = (event: Event) => {
      if ((event as CustomEvent<string>).detail === chatId) {
        setSettings(getAgentConversationSettings(chatId, defaultModel));
      }
    };

    window.addEventListener(SETTINGS_CHANGED_EVENT, handleSettingsChanged);
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, handleSettingsChanged);
  }, [chatId, defaultModel]);

  return settings;
}

export function isValidAgentModel(value?: string): value is string {
  return Boolean(value && value.trim().length <= 128
    && /^[a-zA-Z0-9._:/-]+$/.test(value.trim()));
}

export function saveAgentWorkspaceFileRef(chatId: string, path: string, defaultModel = AGENT_MODEL_NAME) {
  if (!isValidAgentWorkspacePath(path)) return;

  const settings = getAgentConversationSettings(chatId, defaultModel);
  const workspaceFileRefs = [...new Set([...(settings.workspaceFileRefs || []), path])].slice(0, 10);
  saveAgentConversationSettings(chatId, { ...settings, workspaceFileRefs });
}

export function saveAgentWorkspaceSkillRef(
  chatId: string,
  skill: ApiAgentWorkspaceSkill,
  defaultModel = AGENT_MODEL_NAME,
) {
  if (!isValidAgentWorkspaceSkill(skill)) return;

  const settings = getAgentConversationSettings(chatId, defaultModel);
  const workspaceSkillRefs = [
    ...(settings.workspaceSkillRefs || []).filter(({ path }) => path !== skill.path),
    skill,
  ].slice(-8);
  saveAgentConversationSettings(chatId, { ...settings, workspaceSkillRefs });
}

export function encodeAgentWorkspaceFilePath(path: string) {
  return encodeURIComponent(path).replace(/%2F/gi, '/');
}

export function addAgentSettingsDirectives(
  text: string, entities: ApiMessageEntity[], settings: AgentConversationSettings,
  capabilities?: AgentComposerSettingCapabilities,
) {
  const hasExplicitSettingDirective = /^\s*\/(?:model|reasoning)\b/.test(text);
  const selectedFileRefs = (settings.workspaceFileRefs || []).filter((path) => (
    text.includes(`@${encodeAgentWorkspaceFilePath(path)}`)
  ));
  const selectedSkillRefs = (settings.workspaceSkillRefs || []).filter(({ name }) => text.includes(`//${name}`));
  const directives = [
    ...(!hasExplicitSettingDirective && capabilities?.canOverrideModel !== false
      && settings.model !== AGENT_MODEL_NAME ? [`/model ${settings.model}`] : []),
    ...(!hasExplicitSettingDirective && capabilities?.canOverrideReasoning !== false
      && settings.reasoningEffort !== AGENT_REASONING_EFFORT
      ? [`/reasoning ${settings.reasoningEffort}`]
      : []),
    ...selectedFileRefs.map((path) => `/workspace-file-ref ${encodeURIComponent(path)}`),
    ...selectedSkillRefs.map(({ path }) => `/workspace-skill-ref ${encodeURIComponent(path)}`),
  ];
  if (!directives.length) {
    return { text, entities };
  }

  const directiveText = directives.join('\n');
  const prefix = `${directiveText}\n`;
  const settingsEntity: ApiMessageEntityDefault = {
    type: ApiMessageEntityTypes.Spoiler,
    offset: 0,
    length: directiveText.length,
  };

  return {
    text: `${prefix}${text}`,
    entities: [
      settingsEntity,
      ...entities.map((entity) => ({ ...entity, offset: entity.offset + prefix.length })),
    ],
  };
}

function isValidAgentWorkspacePath(path: unknown): path is string {
  return typeof path === 'string'
    && path.length > 0
    && path.length <= 1024
    && !path.startsWith('/')
    && !path.split('/').some((part) => !part || part === '.' || part === '..')
    && !Array.from(path).some((character) => {
      const code = character.charCodeAt(0);
      return code < 0x20 || code === 0x7f;
    });
}

function isValidAgentWorkspaceSkill(value: unknown): value is ApiAgentWorkspaceSkill {
  if (!value || typeof value !== 'object') return false;
  const skill = value as Partial<ApiAgentWorkspaceSkill>;
  return typeof skill.name === 'string' && skill.name.length > 0 && skill.name.length <= 128
    && isValidAgentWorkspacePath(skill.path)
    && skill.path.endsWith('/SKILL.md')
    && skill.path.split('/').slice(0, -2).includes('skills');
}
