export function getStatusEmojiDocumentId(stickers: readonly { id: string }[] | undefined, index: number) {
  return stickers?.[index]?.id;
}
