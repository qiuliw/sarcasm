import { mount, unmount } from 'svelte';
import OverlayPanel from '~/components/OverlayPanel.svelte';

export default defineContentScript({
  matches: [
    '*://*.bilibili.com/*',
    '*://*.douyin.com/*',
  ],
  cssInjectionMode: 'ui',
  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'sarcasm-root',
      position: 'overlay',
      zIndex: 2147483640,
      onMount(container) {
        return mount(OverlayPanel, { target: container });
      },
      onRemove(app) {
        if (app) unmount(app);
      },
    });

    ui.mount();
  },
});
