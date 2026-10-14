// Pasting images (for stickers and themes): a Paste button that reads the
// clipboard, plus Ctrl+V / ⌘V on a keyboard.

export const canReadClipboard = !!navigator.clipboard?.read;

const asFile = (blob, name) =>
  new File([blob], `${name}.${(blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: blob.type });

/** Reads images from the clipboard (must be called from a tap/click). */
export async function readClipboardImages(name) {
  let items;
  try {
    items = await navigator.clipboard.read();
  } catch (error) {
    if (error?.name === 'NotAllowedError') {
      throw new Error('The app was not allowed to read the clipboard. Tap Paste again and choose “Paste” or “Allow”.');
    }
    throw new Error('Nothing could be pasted. Copy an image first, then tap Paste.');
  }
  const files = [];
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith('image/'));
    if (type) files.push(asFile(await item.getType(type), name));
  }
  if (!files.length) throw new Error('There is no image on the clipboard. Copy an image first, then tap Paste.');
  return files;
}

/**
 * Calls `onImages(files)` when an image is pasted with the keyboard while
 * this screen is open. Returns a function that stops listening.
 */
export function onPasteImages(name, onImages) {
  const handler = (event) => {
    if (event.target?.closest?.('input, textarea')) return;
    const files = [...(event.clipboardData?.items ?? [])]
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter(Boolean)
      .map((file) => asFile(file, name));
    if (!files.length) return;
    event.preventDefault();
    onImages(files);
  };
  document.addEventListener('paste', handler);
  return () => document.removeEventListener('paste', handler);
}
