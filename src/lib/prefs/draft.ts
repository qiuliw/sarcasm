import type { Platform, ReplyTarget } from '../db/types';

const DRAFTS_KEY = 'sarcasm_composer_drafts_v1';
const MAX_DRAFTS = 40;

export interface VideoDraft {
  body: string;
  replyTarget: ReplyTarget;
  expanded: boolean;
  updatedAt: number;
}

export type DraftMap = Record<string, VideoDraft>;

export function videoDraftKey(platform: Platform, videoId: string): string {
  return `${platform}:${videoId}`;
}

export function isMeaningfulDraft(draft: Pick<VideoDraft, 'body' | 'replyTarget'>): boolean {
  const hasBody = Boolean(draft.body.trim());
  const isReply = draft.replyTarget.kind !== 'video';
  return hasBody || isReply;
}

function normalizeReplyTarget(raw: unknown): ReplyTarget {
  if (!raw || typeof raw !== 'object') return { kind: 'video' };
  const t = raw as ReplyTarget;
  if (t.kind === 'overlay_comment') {
    return {
      kind: 'overlay_comment',
      targetId: typeof t.targetId === 'string' ? t.targetId : undefined,
      threadRootId: typeof t.threadRootId === 'string' ? t.threadRootId : undefined,
      replyToAuthor: typeof t.replyToAuthor === 'string' ? t.replyToAuthor : undefined,
      preview: typeof t.preview === 'string' ? t.preview : undefined,
    };
  }
  return { kind: 'video' };
}

function normalizeDraft(raw: unknown): VideoDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Partial<VideoDraft>;
  if (typeof d.body !== 'string') return null;
  return {
    body: d.body,
    replyTarget: normalizeReplyTarget(d.replyTarget),
    expanded: Boolean(d.expanded),
    updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : Date.now(),
  };
}

export async function loadAllDrafts(): Promise<DraftMap> {
  const stored = await browser.storage.local.get(DRAFTS_KEY);
  const raw = stored[DRAFTS_KEY];
  if (!raw || typeof raw !== 'object') return {};
  const out: DraftMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const draft = normalizeDraft(value);
    if (draft && isMeaningfulDraft(draft)) out[key] = draft;
  }
  return out;
}

export async function loadDraft(platform: Platform, videoId: string): Promise<VideoDraft | null> {
  const all = await loadAllDrafts();
  return all[videoDraftKey(platform, videoId)] ?? null;
}

function prune(map: DraftMap): DraftMap {
  const entries = Object.entries(map).sort((a, b) => b[1].updatedAt - a[1].updatedAt);
  if (entries.length <= MAX_DRAFTS) return map;
  return Object.fromEntries(entries.slice(0, MAX_DRAFTS));
}

export async function saveDraft(
  platform: Platform,
  videoId: string,
  draft: Omit<VideoDraft, 'updatedAt'>,
): Promise<void> {
  const key = videoDraftKey(platform, videoId);
  const all = await loadAllDrafts();
  if (!isMeaningfulDraft(draft)) {
    if (!(key in all)) return;
    delete all[key];
    await browser.storage.local.set({ [DRAFTS_KEY]: all });
    return;
  }
  all[key] = { ...draft, updatedAt: Date.now() };
  await browser.storage.local.set({ [DRAFTS_KEY]: prune(all) });
}

export async function clearDraft(platform: Platform, videoId: string): Promise<void> {
  const key = videoDraftKey(platform, videoId);
  const all = await loadAllDrafts();
  if (!(key in all)) return;
  delete all[key];
  await browser.storage.local.set({ [DRAFTS_KEY]: all });
}
