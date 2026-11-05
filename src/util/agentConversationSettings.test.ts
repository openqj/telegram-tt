import { describe, expect, it } from 'vitest';

import { ApiMessageEntityTypes } from '../api/types';

import { AGENT_MODEL_NAME, AGENT_REASONING_EFFORT } from '../config';
import { addAgentSettingsDirectives, encodeAgentWorkspaceFilePath } from './agentConversationSettings';
import { getAgentWorkspaceSkills } from './agentWorkspaceSkills';

describe('Agent composer settings directives', () => {
  it('adds selected model, reasoning effort, and only mentioned workspace files', () => {
    const filePath = 'reports/final summary.md';
    const message = `Summarize @${encodeAgentWorkspaceFilePath(filePath)}`;
    const result = addAgentSettingsDirectives(message, [], {
      model: AGENT_MODEL_NAME === 'gpt-6.1-sol' ? 'gpt-6-astra' : 'gpt-6.1-sol',
      reasoningEffort: AGENT_REASONING_EFFORT === 'high' ? 'low' : 'high',
      workspaceFileRefs: [filePath, 'reports/not-selected.md'],
    });

    expect(result.text).toBe([
      `/model ${AGENT_MODEL_NAME === 'gpt-6.1-sol' ? 'gpt-6-astra' : 'gpt-6.1-sol'}`,
      `/reasoning ${AGENT_REASONING_EFFORT === 'high' ? 'low' : 'high'}`,
      `/workspace-file-ref ${encodeURIComponent(filePath)}`,
      message,
    ].join('\n'));
    expect(result.entities).toEqual([{
      type: ApiMessageEntityTypes.Spoiler,
      offset: 0,
      length: result.text.indexOf(message) - 1,
    }]);
    expect(result.text).not.toContain('not-selected');
  });

  it('does not overwrite an explicit model or reasoning directive', () => {
    const text = '/model gpt-6-luna\nDo the task';
    const result = addAgentSettingsDirectives(text, [], {
      model: 'gpt-6-astra',
      reasoningEffort: 'high',
    });

    expect(result.text).toBe(text);
    expect(result.entities).toEqual([]);
  });

  it('does not emit saved model or reasoning overrides for Hermes', () => {
    const filePath = 'reports/final summary.md';
    const message = `Summarize @${encodeAgentWorkspaceFilePath(filePath)}`;
    const result = addAgentSettingsDirectives(message, [], {
      model: AGENT_MODEL_NAME === 'gpt-6.1-sol' ? 'gpt-6-astra' : 'gpt-6.1-sol',
      reasoningEffort: AGENT_REASONING_EFFORT === 'high' ? 'low' : 'high',
      workspaceFileRefs: [filePath],
    }, {
      canOverrideModel: false,
      canOverrideReasoning: false,
    });

    expect(result.text).toBe(`/workspace-file-ref ${encodeURIComponent(filePath)}\n${message}`);
    expect(result.text).not.toContain('/model');
    expect(result.text).not.toContain('/reasoning');
  });

  it('adds only explicitly selected workspace skills as hidden directives', () => {
    const skill = { path: '.agents/skills/release/SKILL.md', name: 'release' };
    const result = addAgentSettingsDirectives(`//${skill.name} Publish this release`, [], {
      model: AGENT_MODEL_NAME,
      reasoningEffort: AGENT_REASONING_EFFORT,
      workspaceSkillRefs: [skill, { path: 'skills/unused/SKILL.md', name: 'unused' }],
    });

    expect(result.text).toBe([
      `/workspace-skill-ref ${encodeURIComponent(skill.path)}`,
      `//${skill.name} Publish this release`,
    ].join('\n'));
    expect(result.entities).toEqual([{
      type: ApiMessageEntityTypes.Spoiler,
      offset: 0,
      length: result.text.indexOf(`//${skill.name}`) - 1,
    }]);
  });

  it('lists SKILL.md files beneath workspace skills directories', () => {
    expect(getAgentWorkspaceSkills([
      { path: '.agents/skills/release/SKILL.md', kind: 'file' },
      { path: 'skills/design/SKILL.md', kind: 'file' },
      {
        path: 'hermes-profile/skills/ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad/SKILL.md',
        name: 'Release Assistant',
        kind: 'file',
      },
      { path: 'skills/not-a-manifest/README.md', kind: 'file' },
      { path: 'skills/folder/SKILL.md', kind: 'directory' },
      { path: 'README.md', kind: 'file' },
    ])).toEqual([
      { path: '.agents/skills/release/SKILL.md', name: 'release' },
      { path: 'skills/design/SKILL.md', name: 'design' },
      {
        path: 'hermes-profile/skills/ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad/SKILL.md',
        name: 'Release Assistant',
      },
    ]);
  });
});
