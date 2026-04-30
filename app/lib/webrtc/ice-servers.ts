export interface IceServerConfig {
  credential?: string;
  urls: string | string[];
  username?: string;
}

const BLOCKED_BROWSER_PORT_SUFFIXES = [":53", ":53?transport=udp", ":53?transport=tcp"];

export const DEFAULT_ICE_SERVERS: IceServerConfig[] = [
  {
    urls: ["stun:stun.cloudflare.com:3478"],
  },
];

function normalizeUrls(urls: string | string[]): string[] {
  return (Array.isArray(urls) ? urls : [urls]).map((url) => url.trim()).filter(Boolean);
}

function isBrowserSafeIceUrl(url: string): boolean {
  return !BLOCKED_BROWSER_PORT_SUFFIXES.some((suffix) => url.includes(suffix));
}

export function sanitizeIceServers(iceServers: IceServerConfig[] | null | undefined): IceServerConfig[] {
  if (!iceServers || iceServers.length === 0) {
    return DEFAULT_ICE_SERVERS;
  }

  const sanitized: IceServerConfig[] = [];

  for (const server of iceServers) {
    const urls = normalizeUrls(server.urls).filter(isBrowserSafeIceUrl);
    if (urls.length === 0) {
      continue;
    }

    sanitized.push({
      ...server,
      urls: Array.from(new Set(urls)),
    });
  }

  return sanitized.length > 0 ? sanitized : DEFAULT_ICE_SERVERS;
}
