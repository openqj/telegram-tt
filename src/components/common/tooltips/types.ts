import type { Range as TiptapRange } from '@tiptap/core';
import type { SuggestionProps } from '@tiptap/suggestion';

import type {
  ApiAgentComposerConfig,
  ApiAgentWorkspaceFile,
  ApiAgentWorkspaceSkill,
  ApiBotCommand,
  ApiBotInlineMediaResult,
  ApiBotInlineResult,
  ApiChatMember,
  ApiMessage,
  ApiQuickReply,
  ApiSticker,
  ApiUser,
} from '../../../api/types';
import type { GlobalActions } from '../../../global';
import type { InlineBotSettings, ThreadId } from '../../../types';
import type { RichEditorTooltipsController } from './extensions/richEditorTooltips/controller';

export type RichEditorTooltipsStorage = {
  config?: RichEditorTooltipsConfig;
  controller?: RichEditorTooltipsController;
};

export type RichEditorTooltipContext = {
  chatId: string;
  threadId?: ThreadId;
  currentUserId?: string;
  currentUser?: ApiUser;
  groupChatMembers?: ApiChatMember[];
  topInlineBotIds?: string[];
  topGuestBotIds?: string[];
  recentEmojiIds?: string[];
  baseEmojiKeywords?: Record<string, string[]>;
  emojiKeywords?: Record<string, string[]>;
  inlineBots?: Record<string, false | InlineBotSettings>;
  botCommands?: ApiBotCommand[] | false;
  chatBotCommands?: ApiBotCommand[];
  quickReplies?: Record<number, ApiQuickReply>;
  quickReplyMessages?: Record<number, ApiMessage>;
  isSavedMessages?: boolean;
  isInScheduledList?: boolean;
  isCurrentUserPremium?: boolean;
  canSendGifs?: boolean;
  isAgentChat?: boolean;
  isHermesAgentBot?: boolean;
  agentComposerConfig?: ApiAgentComposerConfig;
  agentModel?: string;
  agentReasoningEffort?: 'low' | 'medium' | 'high';
  agentUser?: ApiUser;
  isRichInputExpanded?: boolean;
  isFormatterDisabled?: boolean;
  isFormatterContextMenuOpen?: boolean;
};

export type RichEditorTooltipSurface =
  | 'emoji' | 'customEmoji' | 'mention' | 'skill' | 'sticker' | 'command' | 'inlineBot';
export type AgentComposerCommand = {
  type: 'agentComposerCommand';
  setting: 'model' | 'reasoning' | 'submenu' | 'command' | 'action' | 'prompt';
  value: string;
  command: string;
  description: string;
  insertText?: string;
};

export type RichEditorTooltipItem =
  Emoji
  | ApiSticker
  | ApiUser
  | ApiAgentWorkspaceFile
  | ApiAgentWorkspaceSkill
  | AgentComposerCommand
  | ApiBotCommand
  | ApiQuickReply
  | ApiBotInlineResult
  | ApiBotInlineMediaResult;

export type RichEditorTooltipSuggestion = SuggestionProps<RichEditorTooltipItem, RichEditorTooltipItem>;

export type RichEditorFormatterControl = 'date' | 'link';

export type RichEditorFormatterState = {
  range: TiptapRange;
  capabilities: 'basic' | 'full';
  controlRequest?: {
    control: RichEditorFormatterControl;
  };
};

type RichEditorTooltipSurfaceConfig = {
  isEnabled: () => boolean;
};

type RichEditorFormatterConfig = {
  isEnabled: () => boolean;
  capabilities: 'basic' | 'full';
};

type RichEditorEmojiTooltipConfig = RichEditorTooltipSurfaceConfig & {
  addRecentEmoji: GlobalActions['addRecentEmoji'];
  addRecentCustomEmoji: GlobalActions['addRecentCustomEmoji'];
};

type RichEditorCustomEmojiTooltipConfig = RichEditorTooltipSurfaceConfig & {
  addRecentCustomEmoji: GlobalActions['addRecentCustomEmoji'];
};

type RichEditorStickerTooltipConfig = RichEditorTooltipSurfaceConfig & {
  onSelect: (sticker: ApiSticker, isSilent?: boolean, shouldSchedule?: boolean) => void;
};

type RichEditorCommandTooltipConfig = RichEditorTooltipSurfaceConfig & {
  onSelect: NoneToVoidFunction;
  onAgentSelect?: (command: AgentComposerCommand) => void;
};

type RichEditorInlineBotTooltipConfig = RichEditorTooltipSurfaceConfig & {
  onSelect: (
    botId: string,
    result: ApiBotInlineResult | ApiBotInlineMediaResult,
    isSilent?: boolean,
    shouldSchedule?: boolean,
  ) => void;
  onHelpChange: (help?: string) => void;
};

export type RichEditorTooltipsConfig = {
  emoji?: RichEditorEmojiTooltipConfig;
  customEmoji?: RichEditorCustomEmojiTooltipConfig;
  mention?: RichEditorTooltipSurfaceConfig & {
    fetchAgentWorkspaceFiles?: (query: string) => Promise<ApiAgentWorkspaceFile[]>;
    onAgentWorkspaceFileSelect?: (file: ApiAgentWorkspaceFile) => void;
  };
  skill?: RichEditorTooltipSurfaceConfig & {
    fetchAgentWorkspaceSkills?: (query: string) => Promise<ApiAgentWorkspaceSkill[]>;
    onAgentWorkspaceSkillSelect?: (skill: ApiAgentWorkspaceSkill) => void;
  };
  sticker?: RichEditorStickerTooltipConfig;
  command?: RichEditorCommandTooltipConfig;
  inlineBot?: RichEditorInlineBotTooltipConfig;
  formatter?: RichEditorFormatterConfig;
  getTooltipBoundary?: () => HTMLElement | undefined;
  getContext: () => RichEditorTooltipContext;
};
