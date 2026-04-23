# Breachix

Local tool to kick off a **pre-recon** pass over a repo path: the UI stores **LLM base URL + model**, creates a scan row, and **Trigger.dev** runs the worker below.

## Pre-recon agent (`pre-recon-agent`)

Task id **`pre-recon-agent`** in `src/trigger/pre-recon-agent.ts`.

1. **Policy** — Loads `src/prompts/pre-recon-code.txt` as the system prompt (`{{REPO_PATH}}` / `{{DESCRIPTION}}` substituted). Six quoted specialist lines in that file are parsed and drive sub-prompts.
2. **Repo snapshot** — Walks `repoPath` on the worker (skips heavy dirs), includes selected file contents and git-ignored paths.
3. **LLM** — OpenAI SDK against any **OpenAI-compatible** `baseUrl/v1` server (`src/lib/ai-client.ts`).
4. **Phases** — **Phase 1:** three parallel chats (architecture, entry points, security patterns). **Phase 2:** three parallel chats (injection sinks, SSRF, data security). **Phase 3:** one synthesis pass into the final markdown report.
5. **Scope** — Runtime prefix tells the model file/Task/Bash tools from the policy are **not** available; answers use only the snapshot. Result is stored on the scan (`completed` / `failed` + deliverable). Trigger `metadata` carries `phase`, `progress`, `agentStatus`.

## Run it

1. `npm install` → `npx prisma migrate dev` → `npx prisma generate`
2. `.env`:

```env
DATABASE_URL="file:./dev.db"
AI_BASE_URL="https://your-api-host"
AI_MODEL="your-model-id"
AI_API_KEY="your-api-key"
TRIGGER_SECRET_KEY="from Trigger.dev dashboard"
```

Optional phase-1 router mode (Shannon-style custom base URL flow):

```env
PRE_RECON_USE_ROUTER=1
PRE_RECON_MODEL="openai/gpt-oss-120b"
```

3. Worker must reach that API. Two terminals: `npm run dev` and `npx trigger.dev@latest dev`.

## Layout

| Path | Role |
|------|------|
| `app/api/` | Settings, scan start, scan by id, list scans |
| `src/trigger/` | Trigger task definitions |
| `src/lib/` | DB, chat client, prompt helpers |
| `src/prompts/` | Pre-recon policy text |

The bundled policy text is adapted from a Shannon-style pre-recon spec; Breachix does not run Shannon’s tooling or `.shannon/` deliverable paths—it reproduces the **analytical intent** with snapshot + LLM only.

## After pre-recon (Shannon’s pipeline)

In [Shannon](https://github.com/KeygraphHQ/shannon), **pre-recon** is only **phase 1**. Next comes:

| Shannon phase | What it does | Breachix today |
|-----------------|----------------|----------------|
| **2 — Reconnaissance** | Live app + browser automation; attack-surface map tied to the running target | Not implemented |
| **3 — Vulnerability analysis** | Parallel OWASP-style agents; outputs **hypothesized** exploitable paths | Not implemented |
| **4 — Exploitation** | Real attacks against the app; **no exploit → no report** | Not implemented |
| **5 — Reporting** | Final pentest-style report with PoCs | Pre-recon only stores its own markdown report |

**Practical order to build toward parity (without copying Shannon’s Docker/Temporal stack):**

1. **Optional inputs** — Feed real nmap / subfinder / whatweb output into the same scan (file upload or paths), like Shannon’s pre-recon expects external recon.
2. **New Trigger task: “recon-lite” or extend scan** — Given `targetUrl`, optional headless **crawl** (e.g. Playwright) + sitemap/API discovery text, merged with the pre-recon deliverable for a **phase-2-style** map (still read-only if you want).
3. **New task: vulnerability analysis** — Input = pre-recon deliverable + snapshot (+ crawl). Output = structured **hypotheses** per category (Injection, XSS, Auth, Authz, SSRF), parallel LLM calls—Shannon phase 3 without exploitation.
4. **Exploitation** — Only in an isolated lab with explicit authorization; needs a separate design (browser + mutative actions), not a small follow-on.

Shannon Lite runs the full chain in Docker with Claude Agent SDK; Breachix can mirror **phase order and artifacts** first, then add **dynamic** steps when you are ready for Playwright and legal/safety constraints.
