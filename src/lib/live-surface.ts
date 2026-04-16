/**
 * Read-only HTTP discovery against a target origin — complements Playwright in `recon-lite-agent`
 * (raw HTML / redirects vs JS-rendered DOM). Used together for Shannon-style surface comparison.
 */

const DEFAULT_UA = "ShannonStyleRecon/1.0 (read-only surface check; KeygraphHQ/shannon-style pipeline)";

function originOf(input: string): string | null {
  try {
    const u = new URL(input);
    return u.origin;
  } catch {
    return null;
  }
}

async function fetchText(
  url: string,
  signal: AbortSignal,
  maxBytes: number,
): Promise<{ ok: boolean; status: number; contentType: string; snippet: string; finalUrl: string }> {
  const res = await fetch(url, {
    method: "GET",
    redirect: "follow",
    signal,
    headers: { Accept: "*/*", "User-Agent": DEFAULT_UA },
  });
  const contentType = res.headers.get("content-type") ?? "";
  const buf = await res.arrayBuffer();
  const slice = buf.byteLength > maxBytes ? buf.slice(0, maxBytes) : buf;
  const snippet = new TextDecoder("utf-8", { fatal: false }).decode(slice);
  return {
    ok: res.ok,
    status: res.status,
    contentType,
    snippet,
    finalUrl: res.url,
  };
}

function extractSameOriginHrefs(html: string, pageUrl: string, limit: number): string[] {
  let base: URL;
  try {
    base = new URL(pageUrl);
  } catch {
    return [];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /href\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && out.length < limit) {
    const raw = m[1]?.trim();
    if (!raw || raw.startsWith("javascript:") || raw.startsWith("mailto:")) continue;
    let abs: string;
    try {
      abs = new URL(raw, base).href;
    } catch {
      continue;
    }
    try {
      const u = new URL(abs);
      if (u.origin !== base.origin) continue;
      const norm = `${u.pathname}${u.search}` || "/";
      if (seen.has(norm)) continue;
      seen.add(norm);
      out.push(abs);
    } catch {
      continue;
    }
  }
  return out;
}

function parseSitemapUrls(xml: string, origin: string, limit: number): string[] {
  const out: string[] = [];
  const re = /<loc>\s*([^<]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null && out.length < limit) {
    const u = m[1]?.trim();
    if (!u) continue;
    try {
      if (new URL(u).origin === origin) out.push(u);
    } catch {
      continue;
    }
  }
  return out;
}

export async function collectLiveSurfaceSignals(
  targetUrl: string,
  opts?: { timeoutMs?: number; maxLinks?: number },
): Promise<string> {
  const timeoutMs = opts?.timeoutMs ?? 12_000;
  const maxLinks = opts?.maxLinks ?? 80;
  const origin = originOf(targetUrl);
  if (!origin) {
    return "## Live surface fetch\n\nInvalid target URL.\n";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const lines: string[] = [`## Live surface signals`, `Target: ${targetUrl}`, `Origin: ${origin}`, ""];

  try {
    const primary = await fetchText(targetUrl, controller.signal, 400_000);
    lines.push(`### Primary GET`);
    lines.push(`Final URL: ${primary.finalUrl}`);
    lines.push(`HTTP status: ${primary.status}`);
    lines.push(`Content-Type: ${primary.contentType}`);
    if (primary.contentType.toLowerCase().includes("html")) {
      const links = extractSameOriginHrefs(primary.snippet, primary.finalUrl, maxLinks);
      lines.push("", `### Same-origin links discovered (from HTML, max ${maxLinks})`, links.length ? links.join("\n") : "(none parsed)");
    } else {
      lines.push("", "### Body preview (truncated)", "```", primary.snippet.slice(0, 4000), "```");
    }

    const robots = await fetchText(`${origin}/robots.txt`, controller.signal, 32_000).catch((e) => ({
      ok: false,
      status: 0,
      contentType: "",
      snippet: String(e),
      finalUrl: `${origin}/robots.txt`,
    }));
    lines.push("", "### robots.txt");
    if (robots.status) lines.push(`Status: ${robots.status}`);
    lines.push(robots.snippet.slice(0, 8000));

    const sitemap = await fetchText(`${origin}/sitemap.xml`, controller.signal, 500_000).catch((e) => ({
      ok: false,
      status: 0,
      contentType: "",
      snippet: String(e),
      finalUrl: `${origin}/sitemap.xml`,
    }));
    lines.push("", "### sitemap.xml");
    if (sitemap.status) lines.push(`Status: ${sitemap.status}`);
    if (sitemap.contentType.includes("xml") && sitemap.ok) {
      const locs = parseSitemapUrls(sitemap.snippet, origin, 50);
      lines.push(locs.length ? locs.join("\n") : "(no loc entries or unreachable)");
    } else {
      lines.push(sitemap.snippet.slice(0, 2000));
    }
  } catch (e) {
    lines.push("", "### Fetch error", e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }

  return lines.join("\n");
}
