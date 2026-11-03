/* eslint-disable no-null/no-null */
import type { Editor } from '@tiptap/core';
import type { ResolvedPos } from '@tiptap/pm/model';
import { Suggestion, type SuggestionMatch } from '@tiptap/suggestion';
import { getActions, getGlobal } from '../../../../../global';

import type { ApiBotCommand } from '../../../../../api/types';
import type { AgentComposerCommand, RichEditorTooltipItem, RichEditorTooltipsConfig } from '../../types';

import { getMainUsername } from '../../../../../global/helpers';
import { replaceEditorRange } from '../../../../middle/composer/helpers/richEditorComposer';
import { filterAgentCommands } from '../../agentCommands';
import {
  buildBlockMatch,
  buildSuggestionRenderer,
  getSolePlainTextAtCaret,
  type GetTooltipController,
  PLUGIN_KEYS,
  TOOLTIP_GAP_PX,
} from './suggestion';

export function buildCommandSuggestion(
  editor: Editor,
  config: RichEditorTooltipsConfig,
  getController: GetTooltipController,
) {
  return Suggestion<RichEditorTooltipItem, RichEditorTooltipItem>({
    editor,
    pluginKey: PLUGIN_KEYS.command,
    placement: 'top-start',
    offset: { mainAxis: TOOLTIP_GAP_PX },
    dismissOnOutsideClick: false,
    findSuggestionMatch: findCommandMatch,
    allow: () => config.command!.isEnabled(),
    items: ({ query }) => filterCommands(config, query),
    command: ({ editor: currentEditor, range, props }) => {
      if (isAgentComposerCommand(props)) {
        if (props.setting === 'submenu' || props.setting === 'command') {
          replaceEditorRange(currentEditor, range, { type: 'text', text: `/${props.value} ` });
          return;
        }

        if (props.setting === 'prompt') {
          replaceEditorRange(currentEditor, range, { type: 'text', text: props.insertText! });
          return;
        }

        currentEditor.chain().focus().deleteRange(range).run();
        config.command?.onAgentSelect?.(props);
        config.command?.onSelect();
        return;
      }

      const { sendBotCommand, sendQuickReply } = getActions();
      const context = config.getContext();
      if ('shortcut' in props) {
        replaceEditorRange(currentEditor, range, { type: 'text', text: `/${props.shortcut}` });
        sendQuickReply({ chatId: context.chatId, quickReplyId: props.id });
      } else {
        const command = props as ApiBotCommand;
        const bot = getGlobal().users.byId[command.botId];
        const username = bot ? getMainUsername(bot) : undefined;
        const suffix = context.chatBotCommands && username ? `@${username}` : '';
        const commandText = `/${command.command}${suffix}`;
        replaceEditorRange(currentEditor, range, { type: 'text', text: commandText });
        sendBotCommand({
          command: commandText,
          botId: command.botId,
        });
      }
      config.command?.onSelect();
    },
    shouldResetDismissed: ({ transaction }) => transaction.docChanged,
    render: () => buildSuggestionRenderer('command', getController),
  });
}

function findCommandMatch({ $position }: { $position: ResolvedPos }): SuggestionMatch {
  const text = getSolePlainTextAtCaret($position);
  const match = text?.match(/^\/([\w@:-]{0,64})(\s?)$/i);
  return match ? buildBlockMatch($position, text!, `${match[1] || ''}${match[2] || ''}`) : null;
}

function filterCommands(config: RichEditorTooltipsConfig, query: string) {
  const context = config.getContext();
  if (context.isAgentChat) {
    return filterAgentCommands(context.agentComposerConfig, query);
  }

  const commands = context.botCommands && context.botCommands.length
    ? context.botCommands
    : context.chatBotCommands;
  const quickReplies = context.isCurrentUserPremium
    ? Object.values(context.quickReplies || {}).filter(
      (quickReply) => !query || quickReply.shortcut.startsWith(query),
    )
    : [];
  const filteredCommands = commands?.filter((command) => (
    (!context.isInScheduledList || !command.isEphemeral)
    && (!query || command.command.startsWith(query))
  )) || [];
  return [...quickReplies, ...filteredCommands];
}

function isAgentComposerCommand(item: RichEditorTooltipItem): item is AgentComposerCommand {
  return 'type' in item && item.type === 'agentComposerCommand';
}
