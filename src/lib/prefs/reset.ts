/** 重置插件配置（不含本机评论数据） */

import { saveCustomPacks } from '../anchors/store';
import { OUTBOX_KEY, OUTBOX_TRASH_KEY } from '../backends/outbox';
import { defaultNostrSettings, saveNostrSettings } from '../nostr/settings';

const BACKENDS_KEY = 'sarcasm_event_backends_v1';
const DRAFTS_KEY = 'sarcasm_composer_drafts_v1';
const AUTHOR_KEY = 'sarcasm_author';
const PANEL_OPEN_KEY = 'sarcasm_panel_open';

export async function resetAllConfig(): Promise<void> {
  await saveNostrSettings(defaultNostrSettings());
  await saveCustomPacks([]);
  await browser.storage.local.set({
    [BACKENDS_KEY]: ['nostr'],
    [OUTBOX_KEY]: [],
    [OUTBOX_TRASH_KEY]: [],
    [DRAFTS_KEY]: {},
  });
  await browser.storage.local.remove([AUTHOR_KEY, PANEL_OPEN_KEY]);
}
