/**
 * Shannon-style live target recon: real Chromium navigation + DOM (runtime surface),
 * bounded same-origin crawl only — no credential injection, no cross-origin follow.
 */

import { chromium, type Browser } from "playwright";

const BROWSER_UA = "ShannonStyleRecon/1.0 (Playwright read-only same-origin crawl)";

export interface GatherLiveBrowserReconOptions {
  maxSameOriginPages?: number;
  firstNavigationTimeoutMs?: number;
  followNavigationTimeoutMs?: number;
  textCharsPerPage?: number;
  maxBundleChars?: number;
}

function visitKey(u: URL): string {
  return `${u.pathname}${u.search}` || "/";
}

export async function gatherLiveBrowserRecon(
  targetUrl: string,
  opts?: GatherLiveBrowserReconOptions,
): Promise<string> {
  const maxSameOriginPages = Math.min(Math.max(opts?.maxSameOriginPages ?? 16, 1), 40);
  const firstNavMs = opts?.firstNavigationTimeoutMs ?? 45_000;
  const followNavMs = opts?.followNavigationTimeoutMs ?? 25_000;
  const textCap = opts?.textCharsPerPage ?? 6000;
  const maxBundle = opts?.maxBundleChars ?? 95_000;

  let seed: URL;
  try {
    seed = new URL(targetUrl);
  } catch {
    return "## Playwright live navigation\n\nInvalid target URL (could not parse).\n";
  }
  if (seed.protocol !== "http:" && seed.protocol !== "https:") {
    return "## Playwright live navigation\n\nOnly http(s) targets are supported.\n";
  }

  const lines: string[] = [
    "## Playwright live navigation (Chromium, headless)",
    `Seed URL: ${seed.href}`,
    "Scope: same-origin only, GET navigations, no forms submitted, no stored auth.",
    "",
  ];

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--disable-dev-shm-usage", "--no-sandbox", "--disable-setuid-sandbox"],
    });
    const context = await browser.newContext({
      userAgent: BROWSER_UA,
      ignoreHTTPSErrors: true,
      javaScriptEnabled: true,
    });
    const page = await context.newPage();

    const visitedKeys = new Set<string>();
    const queue: string[] = [seed.href];

    const enqueue = (hrefs: string[], origin: string) => {
      let o: URL;
      try {
        o = new URL(origin);
      } catch {
        return;
      }
      for (const href of hrefs) {
        let u: URL;
        try {
          u = new URL(href);
        } catch {
          continue;
        }
        if (u.origin !== o.origin) continue;
        if (u.protocol !== "http:" && u.protocol !== "https:") continue;
        const k = visitKey(u);
        if (visitedKeys.has(k)) continue;
        queue.push(u.href);
      }
    };

    let pageIndex = 0;
    while (queue.length > 0 && visitedKeys.size < maxSameOriginPages) {
      const nextHref = queue.shift();
      if (!nextHref) break;

      let nextUrl: URL;
      try {
        nextUrl = new URL(nextHref);
      } catch {
        continue;
      }
      if (nextUrl.origin !== seed.origin) continue;
      const key = visitKey(nextUrl);
      if (visitedKeys.has(key)) continue;
      visitedKeys.add(key);

      const isFirst = pageIndex === 0;
      const timeout = isFirst ? firstNavMs : followNavMs;
      pageIndex += 1;

      const resp = await page.goto(nextHref, { waitUntil: "domcontentloaded", timeout }).catch((e) => {
        lines.push(`### Page ${pageIndex} (navigation failed)`);
        lines.push(`Requested: ${nextHref}`);
        lines.push(`Error: ${e instanceof Error ? e.message : String(e)}`);
        lines.push("");
        return null;
      });
      if (!resp) continue;

      const finalUrl = page.url();
      const title = await page.title().catch(() => "");
      const status = resp.status();
      const text = await page
        .evaluate((cap) => {
          const el = document.body;
          if (!el) return "";
          return (el.innerText || "").replace(/\s+/g, " ").trim().slice(0, cap);
        }, textCap)
        .catch(() => "");

      const cookieNames = [...new Set((await context.cookies(finalUrl).catch(() => [])).map((c) => c.name))].sort();

      lines.push(`### Page ${pageIndex} (same-origin)`);
      lines.push(`Requested: ${nextHref}`);
      lines.push(`Final URL: ${finalUrl}`);
      lines.push(`HTTP status (document): ${status}`);
      lines.push(`Title: ${title}`);
      lines.push(
        cookieNames.length
          ? `Cookie names present after navigation (values omitted): ${cookieNames.join(", ")}`
          : "Cookie names: (none)",
      );
      lines.push("", "#### Visible text (body `innerText`, truncated)", "```", text, "```", "");

      if (visitedKeys.size < maxSameOriginPages) {
        const hrefs = await page
          .$$eval(
            "a[href]",
            (anchors, originStr) => {
              const out: string[] = [];
              const seen = new Set<string>();
              let base: URL;
              try {
                base = new URL(originStr);
              } catch {
                return out;
              }
              for (const a of anchors) {
                const href = a.getAttribute("href")?.trim();
                if (!href || href.startsWith("javascript:") || href.startsWith("mailto:") || href === "#")
                  continue;
                try {
                  const u = new URL(href, originStr);
                  if (u.protocol !== "http:" && u.protocol !== "https:") continue;
                  if (u.origin !== base.origin) continue;
                  const k = `${u.pathname}${u.search}` || "/";
                  if (seen.has(k)) continue;
                  seen.add(k);
                  out.push(u.href);
                } catch {
                  // ignore
                }
              }
              return out.slice(0, 120);
            },
            new URL(finalUrl).origin,
          )
          .catch(() => [] as string[]);
        enqueue(hrefs, new URL(finalUrl).origin);
      }
    }

    await context.close().catch(() => null);
  } catch (e) {
    lines.push("", "### Playwright error", e instanceof Error ? e.message : String(e));
  } finally {
    await browser?.close().catch(() => null);
  }

  let out = lines.join("\n");
  if (out.length > maxBundle) {
    out = `${out.slice(0, maxBundle)}\n\n_(bundle truncated to ${maxBundle} chars)_\n`;
  }
  return out;
}
