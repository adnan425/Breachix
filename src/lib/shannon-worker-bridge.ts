/**
 * Minimal runtime text so Trigger workers match Shannon prompt files without
 * extra product branding. Shannon policies still reference tools on disk; these
 * notes bridge to inlined evidence + reply-as-deliverable behavior.
 */

/** Pre-recon / phased specialists / synthesis user messages. */
export const PRE_RECON_RUNNER_NOTE = `Your assistant reply must contain the **complete** final markdown report for this subtask or synthesis step. After each step the runner performs the same persistence as Shannon’s \`save-deliverable --type CODE_ANALYSIS\` (writes \`.breachix/deliverables/pre_recon_deliverable.md\` plus \`deliverables/schemas/*\`). You do not invoke \`save-deliverable\`, Bash, Task, Read, Glob, or Grep in chat—all required inputs are pasted below.

`;

/** Recon user message — recon.txt assumes file paths and Write/save-deliverable. */
export const RECON_RUNNER_NOTE = `The same inputs \`recon.txt\` names on disk are **inlined below** (no Write / Task / interactive browser in chat). After your reply the runner runs the same persist step as \`save-deliverable --type RECON\` → \`.breachix/deliverables/recon_deliverable.md\`. Follow \`recon.txt\` and return the **complete** reconnaissance markdown in your reply.

`;

/** Prepended to vuln specialist + synthesis user messages (evidence discipline). */
export const EVIDENCE_GROUNDING_USER_BLOCK = `## Evidence grounding (mandatory)

1. **Evidence only:** Every path, route, filename, function name, or code quote MUST be copied from *Pre-reconnaissance deliverable*, *Reconnaissance deliverable*, or *Repository snapshot* in this message—not from memory or training data.

2. **No fabricated code blocks:** Do not emit fenced code (\`\`\`…\`\`\`) unless the code is a **direct substring** of one of those three sections. No invented tutorial examples.

3. **Empty is valid:** If those sections do not contain material for your category, output only: \`No hypotheses in this category evidenced in the supplied pre-recon, recon, or repository snapshot.\`

`;

/** Prepended to Shannon \`vuln-*.txt\` system body so tool-only lines are harmless. */
export const VULN_SYSTEM_TOOL_BRIDGE = `## worker-environment (read first)

The policy after this header is the KeygraphHQ/shannon \`apps/worker/prompts/\` specialist file (same basename) with \`shared/\` includes expanded. In this execution the model has **no** TodoWrite, Task, Bash, Read, Glob, Grep, Write, Edit, \`save-deliverable\`, browser, Playwright, or outbound network tools—the assessment runner inlined pre-recon, recon, and repository snapshot in the user message. After the merged phase-3 reply, the runner persists \`.breachix/deliverables/vulnerability_hypotheses_deliverable.md\` (single merged deliverable for all five specialists, Shannon-equivalent to running \`save-deliverable\` on the combined report).

If the user message evidence sections do not support your category, reply with exactly one sentence: \`No hypotheses in this category evidenced in the supplied pre-recon, recon, or repository snapshot.\`

---

`;
