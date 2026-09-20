const AUTHOR_KEY = 'sarcasm_author';
const DEFAULT_AUTHOR = '我';

export function getDefaultAuthor(): string {
  return DEFAULT_AUTHOR;
}

export async function loadAuthor(): Promise<string> {
  const stored = await browser.storage.local.get(AUTHOR_KEY);
  const value = stored[AUTHOR_KEY];
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 24);
  return DEFAULT_AUTHOR;
}

export async function saveAuthor(name: string): Promise<string> {
  const next = name.trim().slice(0, 24) || DEFAULT_AUTHOR;
  await browser.storage.local.set({ [AUTHOR_KEY]: next });
  return next;
}
