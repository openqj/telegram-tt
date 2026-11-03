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

  it('keeps prompt commands available for Hermes', () => {
    expect(filterAgentCommands({ ...baseConfig, executorBackend: 'hermes' }, 'prompts:plan'))
      .toMatchObject([{ command: 'prompts:plan', setting: 'prompt' }]);
  });
});
