import { describe, expect, it } from 'vitest';

import { getStatusEmojiDocumentId } from './helpers';

describe('getStatusEmojiDocumentId', () => {
  it('returns undefined when the status set is empty or the index is stale', () => {
    expect(getStatusEmojiDocumentId(undefined, 0)).toBeUndefined();
    expect(getStatusEmojiDocumentId([], 0)).toBeUndefined();
    expect(getStatusEmojiDocumentId([{ id: 'status-1' }], 1)).toBeUndefined();
  });

  it('returns the selected status document id', () => {
    expect(getStatusEmojiDocumentId([{ id: 'status-1' }], 0)).toBe('status-1');
  });
});
