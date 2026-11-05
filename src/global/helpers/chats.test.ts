import {
  beforeAll, describe, expect, it, vi,
} from 'vitest';

import type { ApiChat } from '../../api/types';

import { AGENT_FOLDER_ID } from '../../config';

let getStartedAgentChatIds: typeof import('./chats').getStartedAgentChatIds;
let isSystemPresetAgentConversation: typeof import('./chats').isSystemPresetAgentConversation;
let shouldRequireBotStart: typeof import('./chats').shouldRequireBotStart;

beforeAll(async () => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  ({ getStartedAgentChatIds, isSystemPresetAgentConversation, shouldRequireBotStart } = await import('./chats'));
});

describe('getStartedAgentChatIds', () => {
  it('excludes empty Agent peers but keeps chats with a message', () => {
    expect(getStartedAgentChatIds(
      ['empty', 'started', 'missing', 'zero'],
      { started: 12, zero: 0 },
    )).toEqual(['started']);
  });
});

describe('shouldRequireBotStart', () => {
  it('does not require starting an Agent Bot', () => {
    const agentChat = { folderId: AGENT_FOLDER_ID } as ApiChat;

    expect(shouldRequireBotStart(agentChat, true)).toBe(false);
  });

  it('keeps recognizing a managed Agent Bot when a later update omits its folder marker', () => {
    const agentChat = { folderId: 0, isAgent: true } as ApiChat;

    expect(shouldRequireBotStart(agentChat, true)).toBe(false);
  });

  it('keeps the start requirement for ordinary Bots', () => {
    const botChat = { folderId: 0 } as ApiChat;

    expect(shouldRequireBotStart(botChat, true)).toBe(true);
    expect(shouldRequireBotStart(botChat, false)).toBe(false);
  });
});

describe('isSystemPresetAgentConversation', () => {
  it('keeps recognizing the system preset when a normalized chat update replaces its folder marker', () => {
    const chat = { id: 'notebook', folderId: 0, isSystemPresetAgent: true } as ApiChat;

    expect(isSystemPresetAgentConversation(chat)).toBe(true);
  });
});
