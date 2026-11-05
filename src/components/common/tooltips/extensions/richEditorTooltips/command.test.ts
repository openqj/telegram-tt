import { describe, expect, it } from 'vitest';

import { filterAgentCommands } from '../../agentCommands';

const baseConfig = {
  profileId: 'profile-1',
  defaultModel: 'gpt-6-luna',
  models: [{ id: 'gpt-6-luna', name: 'GPT-6 Luna', provider: 'Responses' }],
  reasoningEfforts: ['low', 'medium', 'high'] as ('low' | 'medium' | 'high')[],
};

describe('Agent composer commands', () => {
  it('hides model and reasoning commands and choices for Hermes', () => {
    const config = { ...baseConfig, executorBackend: 'hermes' };

    expect(filterAgentCommands(config, 'model').map(({ command }) => command)).not.toContain('model');
    expect(filterAgentCommands(config, 'model ').map(({ command }) => command)).toEqual([]);
    expect(filterAgentCommands(config, 'reasoning').map(({ command }) => command)).not.toContain('reasoning');
    expect(filterAgentCommands(config, 'reasoning high').map(({ command }) => command)).toEqual([]);
  });

  it('preserves model and reasoning choices for other executors', () => {
    expect(filterAgentCommands(baseConfig, 'model gpt').map(({ command }) => command)).toEqual(['model gpt-6-luna']);
    expect(filterAgentCommands(baseConfig, 'reasoning h').map(({ command }) => command)).toEqual(['reasoning high']);
  });

  it('hides model and reasoning commands when the executor has no choices', () => {
    const config = { ...baseConfig, models: [], reasoningEfforts: [] };
    const commands = filterAgentCommands(config, '').map(({ command }) => command);

    expect(commands).not.toContain('model');
    expect(commands).not.toContain('reasoning');
    expect(filterAgentCommands(config, 'model ')).toEqual([]);
    expect(filterAgentCommands(config, 'reasoning ')).toEqual([]);
  });

  it('keeps prompt commands available for Hermes', () => {
    expect(filterAgentCommands({ ...baseConfig, executorBackend: 'hermes' }, 'prompts:plan'))
      .toMatchObject([{ command: 'prompts:plan', setting: 'prompt' }]);
  });

  it('shows only the slash commands enabled for this Agent Bot', () => {
    const config = { ...baseConfig, slashCommands: ['status', 'newbot'] };

    expect(filterAgentCommands(config, '', true).map(({ command }) => command)).toEqual(['newbot', 'status']);
    expect(filterAgentCommands(config, 'new', true)).toMatchObject([{ command: 'newbot' }]);
  });

  it('shows only enabled server manager commands', () => {
    const config = {
      ...baseConfig,
      systemPresetKind: 'server_manager',
      slashCommands: ['server_status'],
    };

    expect(filterAgentCommands(config, '', true).map(({ command }) => command)).toEqual(['server_status']);
  });

  it('does not apply Bot command selections to ordinary Agent conversations', () => {
    const config = { ...baseConfig, slashCommands: ['newbot'] };

    expect(filterAgentCommands(config, '').map(({ command }) => command)).toContain('status');
  });
});
