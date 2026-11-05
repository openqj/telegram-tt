import type { ApiKeyboardButton, ApiMessage } from '../../../api/types';

import { getMessageText } from '../../../global/helpers/messages';
import { getServerTime } from '../../../util/serverTime';

const AGENT_ACTIVITY_TEXT_PATTERN = new RegExp(
  '^(?:'
  + '正在(?:阅读|读取|编辑|修改|运行|执行|创建|查询|更新|派发|委派|分析|'
  + '查找|确认|检索|保存|调用|等待)(?:：|:)?'
  + '|正在处理…|正在思考…|已收到任务|已排队|子 Agent 已返回'
  + ')[^\\r\\n]{0,112}$',
  'u',
);
const AGENT_SPEAKER_PREFIX_PATTERN = /^Agent\s*·\s*/iu;
const AGENT_ACTIVITY_STALE_AFTER = 10 * 60;
const AGENT_TASK_CONTROL_STALE_AFTER = 24 * 60 * 60;
const AGENT_TASK_BUTTON_PREFIXES = ['agp:', 'at1_'];
const agentTaskControlCache = new WeakMap<Record<number, ApiMessage>, {
  control: AgentTaskControl | undefined;
  expiresAt: number;
}>();

export type AgentActivity = {
  text: string;
  timestamp: number;
};

export type AgentTaskControl = {
  button: ApiKeyboardButton;
  cancelButton?: ApiKeyboardButton;
  messageId: number;
  action: 'pause' | 'resume';
};

export function shouldShowAgentTaskInlineButtons(isActive?: boolean, isRunning?: boolean) {
  return isActive !== false && !isRunning;
}

export function hasAgentTaskControlButtons(message: ApiMessage) {
  return Boolean(message.inlineButtons?.some((row) => row.some(({ action }) => (
    action.type === 'callback'
    && AGENT_TASK_BUTTON_PREFIXES.some((prefix) => action.data.startsWith(prefix))
  ))));
}

export function getAgentActivity(messages: Record<number, ApiMessage> | undefined): AgentActivity | undefined {
  if (!messages) return undefined;

  let latestMessage: ApiMessage | undefined;
  for (const message of Object.values(messages)) {
    if (message.isOutgoing) continue;

    const timestamp = message.editDate || message.date;
    if (!latestMessage) {
      latestMessage = message;
      continue;
    }

    const latestTimestamp = latestMessage.editDate || latestMessage.date;
    if (timestamp > latestTimestamp || (timestamp === latestTimestamp && message.id > latestMessage.id)) {
      latestMessage = message;
    }
  }

  if (!latestMessage) return undefined;

  const text = parseAgentActivityText(getMessageText(latestMessage)?.text);
  if (!text) return undefined;

  return {
    text,
    timestamp: latestMessage.editDate || latestMessage.date,
  };
}

export function isAgentActivityFresh(agentActivity?: AgentActivity) {
  return Boolean(agentActivity && getServerTime() - agentActivity.timestamp < AGENT_ACTIVITY_STALE_AFTER);
}

export function getAgentTaskControl(messages: Record<number, ApiMessage> | undefined): AgentTaskControl | undefined {
  if (!messages) return undefined;

  const now = getServerTime();
  const cached = agentTaskControlCache.get(messages);
  if (cached && now < cached.expiresAt) return cached.control;

  let latestControl: AgentTaskControl | undefined;
  let latestTimestamp = 0;
  let expiresAt = Number.POSITIVE_INFINITY;

  for (const message of Object.values(messages)) {
    if (message.isOutgoing || !message.inlineButtons || !hasAgentTaskControlButtons(message)) continue;

    const timestamp = message.editDate || message.date;
    const text = getMessageText(message)?.text?.trim().replace(AGENT_SPEAKER_PREFIX_PATTERN, '').trim();
    const isPaused = text === '任务已暂停。';
    const activityText = parseAgentActivityText(text);
    const isRunning = Boolean(activityText && now - timestamp < AGENT_ACTIVITY_STALE_AFTER);
    if ((!isPaused && !isRunning) || now - timestamp >= AGENT_TASK_CONTROL_STALE_AFTER) continue;

    const buttons = message.inlineButtons.flat();
    const button = buttons.find(({ action: buttonAction, text: buttonText }) => (
      buttonAction.type === 'callback'
      && AGENT_TASK_BUTTON_PREFIXES.some((prefix) => buttonAction.data.startsWith(prefix))
      && buttonText === (isPaused ? '继续' : '暂停')
    ));
    if (!button || timestamp < latestTimestamp) continue;

    const cancelButton = buttons.find(({ action: buttonAction, text: buttonText }) => (
      buttonAction.type === 'callback'
      && AGENT_TASK_BUTTON_PREFIXES.some((prefix) => buttonAction.data.startsWith(prefix))
      && buttonText === '取消'
    ));

    latestControl = {
      button,
      cancelButton,
      messageId: message.id,
      action: isPaused ? 'resume' : 'pause',
    };
    latestTimestamp = timestamp;
    expiresAt = timestamp + (isPaused ? AGENT_TASK_CONTROL_STALE_AFTER : AGENT_ACTIVITY_STALE_AFTER);
  }

  agentTaskControlCache.set(messages, { control: latestControl, expiresAt });

  return latestControl;
}

export function parseAgentActivityText(rawText?: string): string | undefined {
  const text = rawText?.trim().replace(AGENT_SPEAKER_PREFIX_PATTERN, '').trim();
  if (!text) return undefined;

  switch (text.toLowerCase()) {
    case 'created':
      return '已收到任务，正在准备执行…';
    case 'planning':
      return '正在分析任务并准备执行步骤…';
    case 'running':
      return '正在思考…';
    case '正在分析任务并决定下一步…':
      return '正在思考…';
    case 'done':
    case 'failed':
      return undefined;
    default:
      return AGENT_ACTIVITY_TEXT_PATTERN.test(text) ? text : undefined;
  }
}
