/**
 * 实网探测：发一条 sarcasm 事件到默认 relays，再按 #i 拉回。
 * bun scripts/nostr-pull-probe.mjs
 */
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { SimplePool } from 'nostr-tools/pool';

const RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
];

function parseSarcasmBody(content) {
  return content.replace(/\n\n#sarcasm\s+\S[\s\S]*$/u, '').trim();
}

const platform = 'douyin';
const videoId = `pulltest_${Date.now()}`;
const body = `sarcasm-pull-test ${videoId}`;
const tag = `${platform}:${videoId}`;

const sk = generateSecretKey();
const pool = new SimplePool();

const event = finalizeEvent(
  {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    content: `${body}\n\n#sarcasm ${tag}`,
    tags: [
      ['client', 'sarcasm'],
      ['i', tag],
      ['n', 'pull-tester'],
    ],
  },
  sk,
);

console.log('pubkey', `${getPublicKey(sk).slice(0, 16)}…`);
console.log('eventId', event.id);
console.log('tag', tag);
console.log('publishing…');

const pubResults = await Promise.allSettled(pool.publish(RELAYS, event));
const accepted = pubResults.filter((r) => r.status === 'fulfilled').length;
console.log(`publish accepted ${accepted}/${RELAYS.length}`);
for (const [i, r] of pubResults.entries()) {
  if (r.status === 'rejected') {
    console.log('  fail', RELAYS[i], String(r.reason).slice(0, 160));
  }
}

if (accepted === 0) {
  pool.close(RELAYS);
  console.log('RESULT: FAIL publish');
  process.exit(1);
}

console.log('waiting 2s then querying…');
await new Promise((r) => setTimeout(r, 2000));

const events = await pool.querySync(
  RELAYS,
  { kinds: [1], '#i': [tag], limit: 20 },
  { maxWait: 8000 },
);
console.log('fetched', events.length);
const hit = events.find((e) => e.id === event.id);
if (hit) {
  console.log('body', parseSarcasmBody(hit.content));
  console.log('author tag', hit.tags.find((t) => t[0] === 'n')?.[1]);
  console.log('RESULT: OK pulled own event');
} else {
  console.log(
    'other ids',
    events.map((e) => e.id.slice(0, 12)),
  );
  console.log('RESULT: FAIL not found after publish');
}

pool.close(RELAYS);
process.exit(hit ? 0 : 2);
