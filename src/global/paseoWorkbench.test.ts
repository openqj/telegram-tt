import { describe, expect, it } from 'vitest';

import { getPaseoConversationPreviewRow, getPaseoLastConversationMessageId } from './paseoWorkbench';

describe('Paseo conversation previews', () => {
  it('uses the latest user or assistant message and skips activity rows', () => {
    const rows = [
      { key: '1', sequence: 1, kind: 'user' as const, text: 'Please inspect this', date: 1 },
      { key: '2', sequence: 2, kind: 'activity' as const, text: '正在运行命令…', date: 2 },
      { key: '3', sequence: 3, kind: 'assistant' as const, text: 'I found the issue', date: 3 },
      { key: '4', sequence: 4, kind: 'activity' as const, text: '任务已完成', date: 4 },
    ];

    expect(getPaseoConversationPreviewRow(rows)).toBe(rows[2]);
    expect(getPaseoLastConversationMessageId(rows)).toBe(3);
  });

  it('returns no preview when the timeline contains only activity', () => {
    const rows = [
      { key: '1', sequence: 1, kind: 'activity' as const, text: '正在思考…', date: 1 },
    ];

    expect(getPaseoConversationPreviewRow(rows)).toBeUndefined();
    expect(getPaseoLastConversationMessageId(rows)).toBeUndefined();
  });
});
