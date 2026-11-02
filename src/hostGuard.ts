// The single hard safety boundary: the agent may only ever reach hosts the
// target file explicitly allows, and those must be loopback (your own
// machine) unless you opted a specific preview host in. Production is never
// reachable. Every URL the agent builds passes through assertAllowedUrl first.

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export class HostNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HostNotAllowedError';
  }
}

function isLoopback(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname.toLowerCase());
}

/**
 * Throws unless `url` is http(s), its host is in `allowedHosts`, and the host
 * is loopback (or appears in `allowExternalHosts`, which a target may set for a
 * disposable preview deployment — never for production).
 */
export function assertAllowedUrl(
  url: string,
  allowedHosts: string[],
  allowExternalHosts: string[] = [],
): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new HostNotAllowedError(`Not a valid URL: ${url}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new HostNotAllowedError(`Only http/https allowed, got ${parsed.protocol} (${url})`);
  }

  const host = parsed.hostname;
  const allowed = allowedHosts.map((h) => h.toLowerCase());
  if (!allowed.includes(host.toLowerCase())) {
    throw new HostNotAllowedError(
      `Host "${host}" is not in the target's allowedHosts (${allowedHosts.join(', ') || 'none'}).`,
    );
  }

  if (!isLoopback(host) && !allowExternalHosts.map((h) => h.toLowerCase()).includes(host.toLowerCase())) {
    throw new HostNotAllowedError(
      `Host "${host}" is not loopback and not in allowExternalHosts — refusing. ` +
        `This tool only runs against your own machine or an explicitly allowed preview.`,
    );
  }

  return parsed;
}
