export interface OAuthWindowOptions {
  /** Window name; one per provider keeps a second click on the same window. */
  name?: string;
  width?: number;
  height?: number;
  /** The message type your callback page posts. */
  type?: string;
  /** Give up after this long (ms). */
  timeout?: number;
}

export function openOAuthWindow<T extends Record<string, unknown> = Record<string, unknown>>(url: string, options: OAuthWindowOptions = {}): Promise<T> {
  const { name = "oauth", width = 520, height = 680, type = "oauth:done", timeout = 10 * 60_000 } = options;
  const left = Math.round(window.screenX + (window.outerWidth - width) / 2);
  const top = Math.round(window.screenY + (window.outerHeight - height) / 2.5);
  const popup = window.open(url, name, `popup=yes,width=${width},height=${height},left=${left},top=${top}`);
  if (!popup) return Promise.reject(new Error("The sign-in window was blocked. Allow pop-ups for this site and try again."));
  popup.focus();

  return new Promise<T>((resolve, reject) => {
    const channel = "BroadcastChannel" in window ? new BroadcastChannel("oauth") : null;
    let settled = false;
    let closedAt = 0;

    const finish = (data: unknown) => {
      if (settled) return;
      const msg = data as { type?: string; error?: string } | null;
      if (!msg || msg.type !== type) return;
      settled = true;
      cleanup();
      if (msg.error) reject(new Error(String(msg.error)));
      else resolve(msg as T);
    };
    const onMessage = (e: MessageEvent) => {
      if (e.origin === window.location.origin) finish(e.data);
    };
    const onChannel = (e: MessageEvent) => finish(e.data);
    const poll = window.setInterval(() => {
      if (!popup.closed) return;
      // The callback posts right before it closes; give that message a moment to land.
      if (!closedAt) closedAt = Date.now();
      else if (Date.now() - closedAt > 1200 && !settled) {
        settled = true;
        cleanup();
        reject(new Error("The window was closed before it finished."));
      }
    }, 300);
    const limit = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("That took too long. Try again."));
    }, timeout);

    function cleanup() {
      window.removeEventListener("message", onMessage);
      channel?.removeEventListener("message", onChannel);
      channel?.close();
      window.clearInterval(poll);
      window.clearTimeout(limit);
      try {
        if (!popup!.closed) popup!.close();
      } catch {
        /* Already gone. */
      }
    }

    window.addEventListener("message", onMessage);
    channel?.addEventListener("message", onChannel);
  });
}
