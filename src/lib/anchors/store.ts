import {
  BUILTIN_PACKS,
  createRulesDocument,
  parseRulesDocument,
  type AnchorPack,
} from './packs';

export const ANCHOR_PACKS_KEY = 'sarcasm_anchor_packs_v1';

export async function loadCustomPacks(): Promise<AnchorPack[]> {
  const stored = await browser.storage.local.get(ANCHOR_PACKS_KEY);
  const raw = stored[ANCHOR_PACKS_KEY];
  if (raw === undefined) return [];
  try {
    return parseRulesDocument(raw).packs;
  } catch (error) {
    console.warn('[sarcasm] ignored invalid stored anchor rules', error);
    return [];
  }
}

/** 自定义规则覆盖同 ID 的内置规则。 */
export async function loadAllPacks(): Promise<AnchorPack[]> {
  const byId = new Map(BUILTIN_PACKS.map((pack) => [pack.id, pack]));
  for (const pack of await loadCustomPacks()) byId.set(pack.id, pack);
  return [...byId.values()];
}

export async function saveCustomPacks(packs: AnchorPack[]): Promise<AnchorPack[]> {
  const document = createRulesDocument(packs);
  await browser.storage.local.set({ [ANCHOR_PACKS_KEY]: document });
  return document.packs;
}

export async function importPacksJson(text: string): Promise<AnchorPack[]> {
  const incoming = parseRulesDocument(JSON.parse(text) as unknown).packs;
  const byId = new Map((await loadCustomPacks()).map((pack) => [pack.id, pack]));
  for (const pack of incoming) byId.set(pack.id, pack);
  return saveCustomPacks([...byId.values()]);
}

export async function exportPacksJson(): Promise<string> {
  return `${JSON.stringify(createRulesDocument(await loadAllPacks()), null, 2)}\n`;
}
