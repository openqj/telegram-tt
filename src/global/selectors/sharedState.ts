import type { GlobalState } from '../types';

import { INITIAL_SHARED_STATE } from '../initialState';

export function selectSharedState<T extends GlobalState>(
  global: T,
) {
  return global.sharedState?.settings ? global.sharedState : INITIAL_SHARED_STATE;
}

export function selectSharedSettings<T extends GlobalState>(
  global: T,
) {
  return selectSharedState(global).settings;
}

export function selectMessageTextSize<T extends GlobalState>(global: T) {
  return selectSharedSettings(global).messageTextSize;
}

export function selectAnimationLevel<T extends GlobalState>(
  global: T,
) {
  return selectSharedSettings(global).animationLevel;
}
