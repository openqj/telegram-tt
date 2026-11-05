import { useEffect, useMemo } from '../lib/teact/teact';

import { ALL_FOLDER_ID } from '../config';
import {
  addChatsCountCallback,
  addOrderedIdsCallback, addUnreadChatsByFolderIdCallback,
  addUnreadCountersCallback,
  getChatsCount,
  getOrderedIds, getUnreadChatsByFolderId,
  getUnreadCounters,
} from '../util/folderManager';
import useSelector from './data/useSelector';
import useForceUpdate from './useForceUpdate';

const EMPTY_ORDERED_IDS: string[] = [];

export function useFolderManagerForOrderedIds(folderId: number) {
  const forceUpdate = useForceUpdate();
  const paseoWorkbench = useSelector((global) => global.paseoWorkbench);

  useEffect(() => addOrderedIdsCallback(folderId, forceUpdate), [folderId, forceUpdate]);

  const orderedIds = getOrderedIds(folderId);
  const paseoOrderedIds = useMemo(() => {
    if (folderId !== ALL_FOLDER_ID || !paseoWorkbench?.isActive) return undefined;
    if (!paseoWorkbench.chatIds.length) return EMPTY_ORDERED_IDS;
    return orderedIds?.filter((id) => paseoWorkbench.chatIds.includes(id));
  }, [folderId, orderedIds, paseoWorkbench]);

  return paseoOrderedIds ?? orderedIds;
}

export function useFolderManagerForUnreadCounters() {
  const forceUpdate = useForceUpdate();

  useEffect(() => addUnreadCountersCallback(forceUpdate), [forceUpdate]);

  return getUnreadCounters();
}

export function useFolderManagerForChatsCount() {
  const forceUpdate = useForceUpdate();

  useEffect(() => addChatsCountCallback(forceUpdate), [forceUpdate]);

  return getChatsCount();
}

export function useFolderManagerForUnreadChatsByFolder() {
  const forceUpdate = useForceUpdate();

  useEffect(() => addUnreadChatsByFolderIdCallback(forceUpdate), [forceUpdate]);

  return getUnreadChatsByFolderId();
}
