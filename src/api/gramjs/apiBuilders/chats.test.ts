import { describe, expect, it } from 'vitest';
import { Api as GramJs } from '../../../lib/gramjs';

import { AGENT_FOLDER_ID } from '../../../config';
import { buildApiChatFromDialog } from './chats';

describe('Agent dialog builder', () => {
  it('builds a private Agent chat without a peer entity or public user fields', () => {
    const dialog = new GramJs.Dialog({
      peer: new GramJs.PeerUser({ userId: 123n }),
      folderId: AGENT_FOLDER_ID,
      topMessage: 0,
      readInboxMaxId: 0,
      readOutboxMaxId: 0,
      unreadCount: 0,
      unreadMentionsCount: 0,
      unreadReactionsCount: 0,
      unreadPollVotesCount: 0,
      notifySettings: new GramJs.PeerNotifySettings({}),
    });

    const chat = buildApiChatFromDialog(dialog, undefined);
    expect(chat).toEqual({
      id: '123',
      folderId: AGENT_FOLDER_ID,
      type: 'chatTypePrivate',
      title: '',
      accessHash: '0',
    });
  });
});
