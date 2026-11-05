import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiMessage } from '../../../api/types';

import {
  getAgentTaskControl, parseAgentActivityText, shouldShowAgentTaskInlineButtons,
} from './agentActivity';

const { getMessageTextMock, getServerTimeMock } = vi.hoisted(() => ({
  getMessageTextMock: vi.fn((message: { activityText?: string }) => (
    message.activityText ? { text: message.activityText } : undefined
  )),
  getServerTimeMock: vi.fn(() => 10000),
}));

vi.mock('../../../global/helpers/messages', () => ({
  getMessageText: getMessageTextMock,
}));

vi.mock('../../../util/serverTime', () => ({
  getServerTime: getServerTimeMock,
}));

beforeEach(() => {
  getMessageTextMock.mockClear();
  getServerTimeMock.mockReturnValue(10000);
});

describe('parseAgentActivityText', () => {
  it('strips the Agent speaker prefix from safe activity text', () => {
    expect(parseAgentActivityText('Agent · 正在思考…')).toBe('正在思考…');
  });

  it.each([
    ['Agent · created', '已收到任务，正在准备执行…'],
    ['Agent · planning', '正在分析任务并准备执行步骤…'],
    ['Agent · running', '正在思考…'],
    ['Agent · 正在分析任务并决定下一步…', '正在思考…'],
  ])('maps %s to a phase activity label', (text, expected) => {
    expect(parseAgentActivityText(text)).toBe(expected);
  });

  it.each(['Agent · done', 'Agent · failed'])('clears terminal status %s', (text) => {
    expect(parseAgentActivityText(text)).toBeUndefined();
  });

  it('ignores activity text outside the supported safe forms', () => {
    expect(parseAgentActivityText('Agent · running command rm -rf')).toBeUndefined();
  });
});

describe('shouldShowAgentTaskInlineButtons', () => {
  it('hides the inline keyboard while the current task is running', () => {
    expect(shouldShowAgentTaskInlineButtons(true, true)).toBe(false);
  });

  it('keeps the resume keyboard visible after the task pauses', () => {
    expect(shouldShowAgentTaskInlineButtons(true, false)).toBe(true);
  });

  it('hides stale Agent task controls and preserves ordinary inline buttons', () => {
    expect(shouldShowAgentTaskInlineButtons(false)).toBe(false);
    expect(shouldShowAgentTaskInlineButtons()).toBe(true);
  });
});

describe('getAgentTaskControl', () => {
  const createMessage = (id: number, activityText: string, buttonText: string, date = 10000) => ({
    id,
    date,
    isOutgoing: false,
    activityText,
    inlineButtons: [[
      {
        text: buttonText,
        action: { type: 'callback', data: 'agp:token' },
      },
      {
        text: '取消',
        action: { type: 'callback', data: 'agp:cancel-token' },
      },
    ]],
  } as unknown as ApiMessage);

  it('returns pause control for a running task', () => {
    const message = createMessage(1, '正在处理…', '暂停');

    expect(getAgentTaskControl({ [message.id]: message })).toMatchObject({
      messageId: 1,
      action: 'pause',
      button: message.inlineButtons?.[0][0],
      cancelButton: message.inlineButtons?.[0][1],
    });
  });

  it('returns resume control for a paused task', () => {
    const message = createMessage(2, '任务已暂停。', '继续');

    expect(getAgentTaskControl({ [message.id]: message })).toMatchObject({
      messageId: 2,
      action: 'resume',
      button: message.inlineButtons?.[0][0],
      cancelButton: message.inlineButtons?.[0][1],
    });
  });

  it('ignores terminal and stale running task messages', () => {
    const terminalMessage = createMessage(3, '任务已完成。', '暂停');
    const staleMessage = createMessage(4, '正在处理…', '暂停', 0);
    const expiredPausedMessage = createMessage(5, '任务已暂停。', '继续', -100000);

    expect(getAgentTaskControl({ [terminalMessage.id]: terminalMessage })).toBeUndefined();
    expect(getAgentTaskControl({ [staleMessage.id]: staleMessage })).toBeUndefined();
    expect(getAgentTaskControl({ [expiredPausedMessage.id]: expiredPausedMessage })).toBeUndefined();
  });

  it('scans a chat message map once while its latest control stays fresh', () => {
    const messages = Object.fromEntries(Array.from({ length: 500 }, (_, id) => {
      const message = createMessage(id + 1, '正在处理…', '暂停');
      return [message.id, message];
    }));

    const latestControl = getAgentTaskControl(messages);
    expect(latestControl).toBeDefined();
    expect(getMessageTextMock).toHaveBeenCalledTimes(500);

    for (let call = 0; call < 100; call++) {
      expect(getAgentTaskControl(messages)).toBe(latestControl);
    }

    expect(getMessageTextMock).toHaveBeenCalledTimes(500);
  });

  it('recomputes a cached control when it becomes stale', () => {
    const message = createMessage(1, '正在处理…', '暂停');
    const messages = { [message.id]: message };

    expect(getAgentTaskControl(messages)).toBeDefined();

    getServerTimeMock.mockReturnValue(610000);

    expect(getAgentTaskControl(messages)).toBeUndefined();
    expect(getMessageTextMock).toHaveBeenCalledTimes(2);
  });
});
