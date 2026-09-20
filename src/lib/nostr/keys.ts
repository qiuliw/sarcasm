import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';

export function createSecretKey(): Uint8Array {
  return generateSecretKey();
}

export function secretToNsec(sk: Uint8Array): string {
  return nip19.nsecEncode(sk);
}

export function nsecToSecret(nsec: string): Uint8Array {
  const decoded = nip19.decode(nsec.trim());
  if (decoded.type !== 'nsec') throw new Error('不是有效的 nsec');
  return decoded.data;
}

export function secretToPubkey(sk: Uint8Array): string {
  return getPublicKey(sk);
}

export function pubkeyToNpub(pubkey: string): string {
  return nip19.npubEncode(pubkey);
}

export function shortNpub(npubOrPubkey: string): string {
  const npub = npubOrPubkey.startsWith('npub1')
    ? npubOrPubkey
    : pubkeyToNpub(npubOrPubkey);
  return `${npub.slice(0, 8)}…${npub.slice(-4)}`;
}

export function tryParseNsec(input: string): string | null {
  try {
    const nsec = input.trim();
    nsecToSecret(nsec);
    return nsec;
  } catch {
    return null;
  }
}
