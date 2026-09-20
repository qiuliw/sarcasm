# sarcasm

Browser extension for independent comments on Bilibili / Douyin video pages.

Built with **WXT (MV3) + Svelte 5 + sql.js**. Comments are keyed by video ID, stored locally, and can sync to Nostr relays in the background.

## Features

- Floating comment panel on Bilibili / Douyin video pages
- JSON **anchor packs** (built-in + import/export) for video ID detection
- Nostr identity (`nsec`) with display name
- Local SQLite via sql.js; optional async Nostr publish with retry + trash for permanent failures
- In-panel settings (identity / sync / anchors / reset)

## Install (development)

Requires [Bun](https://bun.sh/) and Chrome/Chromium.

```bash
bun install
bun run dev
```

Load `.output/chrome-mv3-dev` at `chrome://extensions` (Developer mode → Load unpacked) if the browser does not open automatically.

```bash
bun run build   # .output/chrome-mv3
bun run zip     # packaged zip
bun run test:unit
bun run test    # unit + Chrome smoke
```

## Privacy

- Comments and drafts stay in `chrome.storage.local` on your device
- Private keys (`nsec`) never leave the machine except when you enable Nostr publish
- Resetting config clears identity / sync / custom anchors / drafts; it does **not** delete local comments

## Architecture (short)

| Layer | Role |
| --- | --- |
| Content UI | Shadow-root overlay panel |
| Background | SQLite CRUD, outbox flush, messaging |
| Anchors | Declarative host/path rules → `platform` + `videoId` |
| Backends | Local always; Nostr via queued publish |

```sql
comments(
  id, platform, video_id,
  parent_id, reply_to_author,
  author, body,
  likes, dislikes, my_vote,
  created_at, updated_at
)
```

## Notes

- `extension-key.b64` / `extension-id.txt` pin a stable extension ID for smoke tests
- Site layout changes are usually fixed by updating anchor JSON, not code

## License

MIT
