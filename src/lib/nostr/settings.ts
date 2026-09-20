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

export interface NostrSettings {
  nsec: string | null;
  relays: string[];
  publishEnabled: boolean;
  displayName: string;
}

export interface NostrIdentity {
  configured: boolean;
  npub: string | null;
  pubkey: string | null;
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

export function defaultNostrSettings(): NostrSettings {
  return {
    nsec: null,
    relays: [...DEFAULT_RELAYS],
    publishEnabled: true,
    displayName: '',
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
    relays: normalizeRelays(raw.relays),
    publishEnabled: raw.publishEnabled !== false,
    displayName: typeof raw.displayName === 'string' ? raw.displayName.trim().slice(0, 32) : '',
  };
}

export async function saveNostrSettings(next: NostrSettings): Promise<NostrSettings> {
  const nsec = next.nsec && tryParseNsec(next.nsec) ? next.nsec.trim() : null;
  const settings: NostrSettings = {
    nsec,
    relays: normalizeRelays(next.relays),
    publishEnabled: Boolean(next.publishEnabled),
    displayName: next.displayName.trim().slice(0, 32),
  };
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
  return settings;
}

export async function generateNostrKey(): Promise<NostrSettings> {
  const current = await loadNostrSettings();
  const sk = createSecretKey();
  return saveNostrSettings({
    ...current,
    nsec: secretToNsec(sk),
  });
}

export async function importNostrKey(nsecInput: string): Promise<NostrSettings> {
  const nsec = tryParseNsec(nsecInput);
  if (!nsec) throw new Error('nsec 格式无效');
  const current = await loadNostrSettings();
  return saveNostrSettings({ ...current, nsec });
}

export async function clearNostrKey(): Promise<NostrSettings> {
  const current = await loadNostrSettings();
  return saveNostrSettings({ ...current, nsec: null });
}

/** 只改显示名，不动密钥与同步配置 */
export async function saveDisplayName(name: string): Promise<NostrSettings> {
  const current = await loadNostrSettings();
  return saveNostrSettings({
    ...current,
    displayName: name.trim().slice(0, 32),
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
      shortLabel: '未配置密钥',
      displayName: settings.displayName,
      publishEnabled: settings.publishEnabled,
      relays: settings.relays,
    };
  }
  try {
    const sk = nsecToSecret(settings.nsec);
    const pubkey = secretToPubkey(sk);
    const npub = pubkeyToNpub(pubkey);
    return {
      configured: true,
      npub,
      pubkey,
      shortLabel: settings.displayName || '我',
      displayName: settings.displayName,
      publishEnabled: settings.publishEnabled,
      relays: settings.relays,
    };
  } catch {
    return {
      configured: false,
      npub: null,
      pubkey: null,
      shortLabel: '密钥无效',
      displayName: settings.displayName,
      publishEnabled: settings.publishEnabled,
      relays: settings.relays,
    };
  }
}

export async function loadNostrIdentity(): Promise<NostrIdentity> {
  return identityFromSettings(await loadNostrSettings());
}
