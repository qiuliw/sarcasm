export interface RelayProbeResult {
  url: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
}

const PROBE_TIMEOUT_MS = 8_000;

/** 测试 WebSocket 握手；成功建立连接即视为 relay 可达。 */
export function probeRelay(
  input: string,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<RelayProbeResult> {
  const url = input.trim();
  const startedAt = performance.now();

  if (!/^wss:\/\/\S+$/i.test(url)) {
    return Promise.resolve({
      url,
      ok: false,
      latencyMs: 0,
      error: '仅支持 wss://',
    });
  }

  return new Promise((resolve) => {
    let settled = false;
    let socket: WebSocket | null = null;

    const finish = (ok: boolean, error?: string) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));
      if (socket && socket.readyState <= WebSocket.OPEN) socket.close();
      resolve({ url, ok, latencyMs, ...(error ? { error } : {}) });
    };

    const timer = globalThis.setTimeout(() => {
      finish(false, `连接超时（${Math.round(timeoutMs / 1000)} 秒）`);
    }, timeoutMs);

    try {
      socket = new WebSocket(url);
      socket.onopen = () => finish(true);
      socket.onerror = () => finish(false, '连接失败');
      socket.onclose = () => finish(false, '连接已关闭');
    } catch (error) {
      finish(false, error instanceof Error ? error.message : '无效地址');
    }
  });
}

export function probeRelays(urls: string[]): Promise<RelayProbeResult[]> {
  return Promise.all([...new Set(urls.map((url) => url.trim()).filter(Boolean))].map((url) => probeRelay(url)));
}
