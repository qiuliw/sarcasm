import {
  createSecretKey,
  nsecToSecret,
  pubkeyToNpub,
  secretToNsec,
  secretToPubkey,
  tryParseNsec,
} from './keys';

const SETTINGS_KEY = 'sarcasm_nostr_settings_v1';

export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
];

/** 一把密钥 + 其显示名 = 一个身份；同步配置另存同对象 */
export interface NostrSettings {
  nsec: string | null;
  displayName: string;
  relays: string[];
  publishEnabled: boolean;
}

export interface NostrIdentity {
  configured: boolean;
  npub: string | null;
  pubkey: string | null;
  /** 发评作者：显示名，缺省为「我」 */
  shortLabel: string;
  displayName: string;
  publishEnabled: boolean;
  relays: string[];
}

function normalizeRelays(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_RELAYS];
  const list = raw
    .filter((r): r is string => typeof r === 'string')
    .map((r) => r.trim())
    .filter((r) => /^wss:\/\//i.test(r));
  return list.length ? [...new Set(list)] : [...DEFAULT_RELAYS];
}

function normalizeName(name: string): string {
  return name.trim().slice(0, 32);
}

export function defaultNostrSettings(): NostrSettings {
  return {
    nsec: null,
    displayName: '',
    relays: [...DEFAULT_RELAYS],
    publishEnabled: true,
  };
}

export async function loadNostrSettings(): Promise<NostrSettings> {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  const raw = stored[SETTINGS_KEY] as Partial<NostrSettings> | undefined;
  if (!raw || typeof raw !== 'object') return defaultNostrSettings();
  const nsec =
    typeof raw.nsec === 'string' && tryParseNsec(raw.nsec) ? raw.nsec.trim() : null;
  return {
    nsec,
    // 无密钥时不保留显示名，避免「孤儿昵称」
    displayName: nsec
      ? typeof raw.displayName === 'string'
        ? normalizeName(raw.displayName)
        : ''
      : '',
    relays: normalizeRelays(raw.relays),
    publishEnabled: raw.publishEnabled !== false,
  };
}

export async function saveNostrSettings(next: NostrSettings): Promise<NostrSettings> {
  const nsec = next.nsec && tryParseNsec(next.nsec) ? next.nsec.trim() : null;
  const settings: NostrSettings = {
    nsec,
    displayName: nsec ? normalizeName(next.displayName) : '',
    relays: normalizeRelays(next.relays),
    publishEnabled: Boolean(next.publishEnabled),
  };
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
  return settings;
}

/** 换新密钥 = 新身份，清空显示名 */
export async function generateNostrKey(): Promise<NostrSettings> {
  const current = await loadNostrSettings();
  return saveNostrSettings({
    ...current,
    nsec: secretToNsec(createSecretKey()),
    displayName: '',
  });
}

/** 导入密钥 = 切换身份，清空旧显示名 */
export async function importNostrKey(nsecInput: string): Promise<NostrSettings> {
  const nsec = tryParseNsec(nsecInput);
  if (!nsec) throw new Error('nsec 格式无效');
  const current = await loadNostrSettings();
  return saveNostrSettings({
    ...current,
    nsec,
    displayName: '',
  });
}

/** 清除身份（密钥 + 显示名） */
export async function clearNostrKey(): Promise<NostrSettings> {
  const current = await loadNostrSettings();
  return saveNostrSettings({
    ...current,
    nsec: null,
    displayName: '',
  });
}

/** 为当前密钥设置显示名；无密钥时不可用 */
export async function saveDisplayName(name: string): Promise<NostrSettings> {
  const current = await loadNostrSettings();
  if (!current.nsec) throw new Error('请先配置密钥');
  return saveNostrSettings({
    ...current,
    displayName: normalizeName(name),
  });
}

export async function exportNostrKey(): Promise<string> {
  const settings = await loadNostrSettings();
  if (!settings.nsec) throw new Error('尚未配置密钥');
  return settings.nsec;
}

export function identityFromSettings(settings: NostrSettings): NostrIdentity {
  if (!settings.nsec) {
    return {
      configured: false,
      npub: null,
      pubkey: null,
      shortLabel: '未配置',
      displayName: '',
      publishEnabled: settings.publishEnabled,
      relays: settings.relays,
    };
  }
  try {
    const sk = nsecToSecret(settings.nsec);
    const pubkey = secretToPubkey(sk);
    const npub = pubkeyToNpub(pubkey);
    const displayName = normalizeName(settings.displayName);
    return {
      configured: true,
      npub,
      pubkey,
      shortLabel: displayName || '我',
      displayName,
      publishEnabled: settings.publishEnabled,
      relays: settings.relays,
    };
  } catch {
    return {
      configured: false,
      npub: null,
      pubkey: null,
      shortLabel: '密钥无效',
      displayName: '',
      publishEnabled: settings.publishEnabled,
      relays: settings.relays,
    };
  }
}

export async function loadNostrIdentity(): Promise<NostrIdentity> {
  return identityFromSettings(await loadNostrSettings());
}
