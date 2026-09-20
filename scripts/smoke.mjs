/**
 * Headed Chrome smoke test: load unpacked sarcasm, exercise sqlite via popup → background.
 * Usage: bun run smoke
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensionPath = path.join(root, '.output', 'chrome-mv3');
const chromePath = process.env.CHROME_PATH || '/usr/bin/google-chrome';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function send(page, message) {
  return page.evaluate(async (msg) => {
    try {
      return await chrome.runtime.sendMessage(msg);
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }, message);
}

async function openPopup(browser, extensionId) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });

  const url = `chrome-extension://${extensionId}/popup.html`;
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  assert(res && res.ok(), `打开 popup 失败 status=${res?.status()} url=${url}`);
  return { page, errors };
}

async function runCrud(page) {
  const ping = await send(page, { type: 'ping' });
  assert(ping?.ok, `ping failed: ${JSON.stringify(ping)}`);

  const relayProbe = await send(page, {
    type: 'nostr_probe_relays',
    urls: ['https://invalid-relay.example'],
  });
  assert(relayProbe?.ok, `relay probe request failed: ${JSON.stringify(relayProbe)}`);
  assert(relayProbe.data?.[0]?.error === '仅支持 wss://', 'relay probe validation failed');

  const anchorExport = await send(page, { type: 'anchors_export' });
  assert(anchorExport?.ok && anchorExport.data.includes('"bilibili"'), 'anchor export failed');
  assert(!anchorExport.data.includes('"tests"'), 'anchor export leaked internal fixtures');
  const anchorImport = await send(page, {
    type: 'anchors_import',
    json: JSON.stringify({
      schemaVersion: 1,
      packs: [
        {
          id: 'smoke',
          name: 'Smoke',
          hosts: ['example.com'],
          videoIdRules: [
            { from: 'query', queryKey: 'video', pattern: '^(\\d+)$' },
          ],
        },
      ],
    }),
  });
  assert(anchorImport?.ok, `anchor import failed: ${JSON.stringify(anchorImport)}`);
  const anchors = await send(page, { type: 'anchors_list' });
  assert(anchors?.ok && anchors.data.custom.some((pack) => pack.id === 'smoke'), 'anchor list failed');
  const anchorsCleared = await send(page, { type: 'anchors_clear_custom' });
  assert(anchorsCleared?.ok, 'anchor reset failed');

  const key = await send(page, { type: 'nostr_generate_key' });
  assert(key?.ok, `generate key failed: ${JSON.stringify(key)}`);
  assert(key.data?.nsec, '未生成 nsec');
  const identity = await send(page, { type: 'nostr_identity' });
  assert(identity?.ok && identity.data?.pubkey, '未生成 Nostr 公钥');

  const created = await send(page, {
    type: 'create_comment',
    input: {
      platform: 'bilibili',
      videoId: 'BV_SMOKE_TEST',
      body: 'smoke hello',
      author: 'tester',
    },
  });
  assert(created?.ok, `create failed: ${JSON.stringify(created)}`);
  assert(created.data?.id, 'create 未返回 id');
  assert(created.data?.authorPubkey === identity.data.pubkey, '本地评论未关联作者公钥');
  assert(created.data?.nativeParentId == null, '新评论不应写入原生锚点');

  const reply = await send(page, {
    type: 'create_comment',
    input: {
      platform: 'bilibili',
      videoId: 'BV_SMOKE_TEST',
      body: 'smoke reply',
      parentId: created.data.id,
      replyToAuthor: 'tester',
    },
  });
  assert(reply?.ok, `reply failed: ${JSON.stringify(reply)}`);
  assert(reply.data?.replyToAuthor === 'tester', '二级回复未写入 @用户名');
  assert(reply.data?.parentId === created.data.id, '二级应挂在一级下');

  const liked = await send(page, {
    type: 'vote_comment',
    input: { id: created.data.id, vote: 'up' },
  });
  assert(liked?.ok, `like failed: ${JSON.stringify(liked)}`);
  assert(liked.data?.likes === 1 && liked.data?.myVote === 'up', '点赞未生效');

  const disliked = await send(page, {
    type: 'vote_comment',
    input: { id: created.data.id, vote: 'down' },
  });
  assert(disliked?.ok, `dislike failed: ${JSON.stringify(disliked)}`);
  assert(
    disliked.data?.likes === 0 && disliked.data?.dislikes === 1 && disliked.data?.myVote === 'down',
    '点踩切换未生效',
  );

  const listed = await send(page, {
    type: 'list_comments',
    query: { platform: 'bilibili', videoId: 'BV_SMOKE_TEST' },
  });
  assert(listed?.ok, `list failed: ${JSON.stringify(listed)}`);
  const rows = listed.data;
  assert(
    rows.some((r) => r.body === 'smoke hello') && rows.some((r) => r.body === 'smoke reply'),
    'list 缺评论',
  );

  const deleted = await send(page, { type: 'delete_comment', id: created.data.id });
  assert(deleted?.ok, `delete failed: ${JSON.stringify(deleted)}`);

  const listed2 = await send(page, {
    type: 'list_comments',
    query: { platform: 'bilibili', videoId: 'BV_SMOKE_TEST' },
  });
  assert(listed2?.ok, `list2 failed: ${JSON.stringify(listed2)}`);
  assert(
    !listed2.data.some((r) => r.id === created.data.id || r.id === reply.data.id),
    '级联删除失败，子评论仍在',
  );

  const stats = await send(page, { type: 'stats' });
  assert(stats?.ok, `stats failed: ${JSON.stringify(stats)}`);

  return {
    createdId: created.data.id,
    replyId: reply.data.id,
    count: stats.data.count,
  };
}

async function runPopupUi(page, errors) {
  await page.waitForFunction(
    () => {
      const text = document.body?.innerText || '';
      return text.includes('本机评论') && text.includes('sarcasm');
    },
    { timeout: 15000 },
  );
  const body = await page.evaluate(() => document.body.innerText);
  assert(body.includes('sarcasm'), 'popup 未显示品牌');
  assert(body.includes('本机评论'), `popup 未拿到 stats 区域：${body}`);
  assert(body.includes('Nostr'), `popup 未显示 Nostr 身份：${body}`);
  assert(
    !errors.some((e) => /XMLHttpRequest|Content Security|CompileError|wasm/i.test(e)),
    `popup 仍有 wasm/csp 错误：${errors.join(' | ')}`,
  );
  return body;
}

async function runContentScriptOnBilibili(browser, extensionId) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });

  // 公开可访问的视频页；失败则跳过（网络/地区限制）
  const url = 'https://www.bilibili.com/video/BV1GJ411x7h7';
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (e) {
    await page.close();
    console.warn('[smoke] bilibili 页面打开失败，跳过 content 注入检查:', String(e));
    return { skipped: true };
  }

  // content script 注入的 host 元素：wxt createShadowRootUi name=sarcasm-root
  await page.waitForSelector('sarcasm-root', { timeout: 20000 });

  await page.evaluate(() => {
    const host = document.querySelector('sarcasm-root');
    const button = host?.shadowRoot?.querySelector('button.fab');
    if (button instanceof HTMLElement) button.click();
  });
  await page.waitForFunction(
    () => !!document.querySelector('sarcasm-root')?.shadowRoot?.querySelector('.panel'),
    { timeout: 10000 },
  );

  const injected = await page.evaluate(() => {
    const host = document.querySelector('sarcasm-root');
    const text = host?.shadowRoot?.textContent || '';
    return {
      hasHost: !!host,
      hasPanel: !!host?.shadowRoot?.querySelector('.panel'),
      shadowHasPlatform: text.includes('B站') || text.includes('bilibili'),
      href: location.href,
      snippet: text.replace(/\s+/g, ' ').slice(0, 240),
    };
  });

  assert(injected.hasHost, `未找到 sarcasm-root：${JSON.stringify(injected)}`);
  assert(injected.hasPanel, `侧栏未渲染：${JSON.stringify(injected)}`);
  assert(injected.shadowHasPlatform, `未识别视频平台：${JSON.stringify(injected)}`);

  await page.screenshot({
    path: path.join(root, '.output', 'smoke-bilibili-panel.png'),
    fullPage: false,
  });
  await page.evaluate(() => {
    const root = document.querySelector('sarcasm-root')?.shadowRoot;
    const settings = root?.querySelector('button[aria-label="设置"]');
    if (settings instanceof HTMLElement) settings.click();
  });
  await page.waitForFunction(
    () => (document.querySelector('sarcasm-root')?.shadowRoot?.textContent || '').includes('Nostr'),
    { timeout: 10_000 },
  );
  await page.evaluate(() => {
    const root = document.querySelector('sarcasm-root')?.shadowRoot;
    const sync = [...(root?.querySelectorAll('button.card-toggle') || [])].find((button) =>
      (button.textContent || '').includes('同步'),
    );
    if (sync instanceof HTMLElement) sync.click();
  });
  await page.waitForFunction(
    () => !!document.querySelector('sarcasm-root')?.shadowRoot?.querySelector('input.relay-url'),
    { timeout: 10_000 },
  );
  await page.screenshot({
    path: path.join(root, '.output', 'smoke-settings.png'),
    fullPage: false,
  });
  await page.evaluate(() => {
    const root = document.querySelector('sarcasm-root')?.shadowRoot;
    const anchors = [...(root?.querySelectorAll('button.card-toggle') || [])].find((button) =>
      (button.textContent || '').includes('锚点规则'),
    );
    if (anchors instanceof HTMLElement) anchors.click();
  });
  await page.waitForFunction(
    () =>
      [...(document.querySelector('sarcasm-root')?.shadowRoot?.querySelectorAll('button') || [])]
        .some((button) => button.textContent?.trim() === '导出'),
    { timeout: 10_000 },
  );
  await page.evaluate(() => {
    const root = document.querySelector('sarcasm-root')?.shadowRoot;
    const exportButton = [...(root?.querySelectorAll('button') || [])].find(
      (button) => button.textContent?.trim() === '导出',
    );
    if (exportButton instanceof HTMLElement) exportButton.click();
  });
  await page.waitForFunction(
    () => {
      const root = document.querySelector('sarcasm-root')?.shadowRoot;
      const output = root?.querySelector('textarea[aria-label="导出的锚点规则 JSON"]');
      return output instanceof HTMLTextAreaElement && output.value.includes('"bilibili"');
    },
    { timeout: 10_000 },
  );
  await page.close();
  return { skipped: false, injected };
}

async function main() {
  const expectedId = (await readFile(path.join(root, 'extension-id.txt'), 'utf8')).trim();
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'sarcasm-smoke-'));
  let browser = null;

  try {
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: false,
      userDataDir,
      enableExtensions: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-default-apps',
      ],
    });

    const installedId = await browser.installExtension(extensionPath);
    console.log(`[smoke] installedId=${installedId} expectedId=${expectedId}`);
    assert(
      installedId === expectedId,
      `扩展 ID 与 key 推算不一致：installed=${installedId} expected=${expectedId}`,
    );

    const { page, errors } = await openPopup(browser, installedId);
    console.log(`[smoke] path=${extensionPath}`);

    const crud = await runCrud(page);
    console.log('[smoke] sqlite CRUD + cascade delete ok', crud);

    const popupText = await runPopupUi(page, errors);
    console.log('[smoke] popup ok\n', popupText.trim());
    await page.screenshot({
      path: path.join(root, '.output', 'smoke-popup.png'),
      fullPage: false,
    });

    const ping2 = await send(page, { type: 'ping' });
    assert(ping2?.ok, `second ping failed: ${JSON.stringify(ping2)}`);
    await page.evaluate(() =>
      chrome.storage.local.set({
        sarcasm_ui_prefs_v1: { autoExpandOnComments: false, panelMaxVh: 85 },
      }),
    );

    const swErrors = errors.filter((e) => /XMLHttpRequest|Content Security|CompileError|wasm/i.test(e));
    assert(swErrors.length === 0, `仍有 wasm/csp 错误：${swErrors.join(' | ')}`);

    await page.close();

    const content = await runContentScriptOnBilibili(browser, installedId);
    if (!content.skipped) {
      console.log('[smoke] bilibili content inject ok', content.injected);
    }

    console.log('[smoke] PASS');
  } finally {
    await browser?.close().catch(() => undefined);
    await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

main().catch((err) => {
  console.error('[smoke] FAIL', err);
  process.exit(1);
});
