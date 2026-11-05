import { beforeEach, describe, expect, it, vi } from 'vitest';

const { openChatByUsername } = vi.hoisted(() => ({
  openChatByUsername: vi.fn(),
}));

vi.mock('../../../global', () => ({
  getActions: () => ({ openChatByUsername }),
}));
vi.mock('../../ui/MenuItem', () => ({
  default: vi.fn(),
}));

import type { VirtualElementComponent } from '../../../lib/teact/teact';

import { AgentChatMenuItem } from './AgentChatMenuItem';

describe('AgentChatMenuItem', () => {
  beforeEach(() => openChatByUsername.mockClear());

  it('opens the configured bot through the existing username navigation action', () => {
    const item = AgentChatMenuItem({ username: 'AIAgentBot', title: 'AI' }) as VirtualElementComponent;

    item.props.onClick();

    expect(openChatByUsername).toHaveBeenCalledWith({ username: 'AIAgentBot' });
  });
});
