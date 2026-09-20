/** 面板相关 UI 偏好 */

const KEY = 'sarcasm_ui_prefs_v1';

/** 面板最大高度占视口比例（vh） */
export const PANEL_MAX_VH_MIN = 40;
export const PANEL_MAX_VH_MAX = 95;
export const PANEL_MAX_VH_STEP = 5;
export const PANEL_MAX_VH_DEFAULT = 85;

export interface UiPrefs {
  /** 当前视频有评论时自动展开/收纳面板 */
  autoExpandOnComments: boolean;
  /** 面板最大高度（视口百分比） */
  panelMaxVh: number;
}

export function clampPanelMaxVh(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return PANEL_MAX_VH_DEFAULT;
  const stepped =
    Math.round(n / PANEL_MAX_VH_STEP) * PANEL_MAX_VH_STEP;
  return Math.min(PANEL_MAX_VH_MAX, Math.max(PANEL_MAX_VH_MIN, stepped));
}

export function defaultUiPrefs(): UiPrefs {
  return {
    autoExpandOnComments: true,
    panelMaxVh: PANEL_MAX_VH_DEFAULT,
  };
}

export async function loadUiPrefs(): Promise<UiPrefs> {
  const stored = await browser.storage.local.get(KEY);
  const raw = stored[KEY] as Partial<UiPrefs> | undefined;
  if (!raw || typeof raw !== 'object') return defaultUiPrefs();
  return {
    autoExpandOnComments: raw.autoExpandOnComments !== false,
    panelMaxVh: clampPanelMaxVh(raw.panelMaxVh ?? PANEL_MAX_VH_DEFAULT),
  };
}

export async function saveUiPrefs(next: UiPrefs): Promise<UiPrefs> {
  const cleaned: UiPrefs = {
    autoExpandOnComments: next.autoExpandOnComments !== false,
    panelMaxVh: clampPanelMaxVh(next.panelMaxVh),
  };
  await browser.storage.local.set({ [KEY]: cleaned });
  return cleaned;
}

export const UI_PREFS_KEY = KEY;
