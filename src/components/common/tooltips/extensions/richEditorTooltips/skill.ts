/* eslint-disable no-null/no-null */
import type { Editor } from '@tiptap/core';
import type { ResolvedPos } from '@tiptap/pm/model';
import { Suggestion, type SuggestionMatch } from '@tiptap/suggestion';

import type { ApiAgentWorkspaceSkill } from '../../../../../api/types';
import type { RichEditorTooltipItem, RichEditorTooltipsConfig } from '../../types';

import { replaceEditorRange } from '../../../../middle/composer/helpers/richEditorComposer';
import {
  buildBlockMatch,
  buildSuggestionRenderer,
  getSolePlainTextAtCaret,
  type GetTooltipController,
  PLUGIN_KEYS,
  SEARCH_DEBOUNCE_MS,
  TOOLTIP_GAP_PX,
} from './suggestion';

export function buildSkillSuggestion(
  editor: Editor,
  config: RichEditorTooltipsConfig,
  getController: GetTooltipController,
) {
  return Suggestion<RichEditorTooltipItem, RichEditorTooltipItem>({
    editor,
    pluginKey: PLUGIN_KEYS.skill,
    placement: 'top-start',
    offset: { mainAxis: TOOLTIP_GAP_PX },
    dismissOnOutsideClick: false,
    findSuggestionMatch: findSkillMatch,
    allow: () => config.skill!.isEnabled(),
    debounce: SEARCH_DEBOUNCE_MS,
    items: ({ query }) => config.skill?.fetchAgentWorkspaceSkills?.(query) || [],
    command: ({ editor: currentEditor, range, props }) => {
      if (!isAgentWorkspaceSkill(props)) return;

      replaceEditorRange(currentEditor, range, { type: 'text', text: `//${props.name} ` });
      config.skill?.onAgentWorkspaceSkillSelect?.(props);
    },
    shouldResetDismissed: ({ transaction }) => transaction.docChanged,
    render: () => buildSuggestionRenderer('skill', getController),
  });
}

function isAgentWorkspaceSkill(item: RichEditorTooltipItem): item is ApiAgentWorkspaceSkill {
  return 'path' in item && 'name' in item && !('kind' in item);
}

function findSkillMatch({ $position }: { $position: ResolvedPos }): SuggestionMatch {
  const text = getSolePlainTextAtCaret($position);
  const match = text?.match(/(?:^|\s)(\/\/[^\n]{0,128})$/u);
  if (!match) return null;

  const triggerText = match[1];
  return buildBlockMatch($position, triggerText, triggerText.slice(2));
}
