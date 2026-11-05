import { describe, expect, it } from 'vitest';
import { Api as GramJs } from '../../../lib/gramjs';

import { buildAppConfig } from './appConfig';

function buildConfigJson(values: GramJs.JsonObjectValue[]) {
  return new GramJs.JsonObject({ value: values });
}

describe('Agent bot app config', () => {
  it('maps the public agent bot username from Help.AppConfig', () => {
    const config = buildConfigJson([
      new GramJs.JsonObjectValue({
        key: 'agent_bot_username',
        value: new GramJs.JsonString({ value: 'AIAgentBot' }),
      }),
    ]);

    expect(buildAppConfig(config, 1).agentBotUsername).toBe('AIAgentBot');
  });

  it('omits the menu username when Help.AppConfig does not configure an agent bot', () => {
    const config = buildConfigJson([]);

    expect(buildAppConfig(config, 1).agentBotUsername).toBeUndefined();
  });
});
