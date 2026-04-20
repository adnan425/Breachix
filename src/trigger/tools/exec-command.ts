// trigger/tools/exec-command.ts
import { tool } from 'ai';
import { z } from 'zod';
import { execSync } from 'child_process';
import { logger } from '@trigger.dev/sdk/v3';

// Allowlist — Claude can ONLY run these commands
const ALLOWED_COMMANDS = [
  'nmap', 'httpx', 'ffuf', 'nuclei',
  'sqlmap', 'gobuster', 'curl', 'jwt_tool',
  'cat', 'grep', 'find', 'ls'
];

export const execCommandTool = tool({
  description: `Run a security tool command. Allowed tools: ${ALLOWED_COMMANDS.join(', ')}`,
  parameters: z.object({
    command: z.string().describe('The CLI tool to run e.g. nmap'),
    args: z.array(z.string()).describe('Arguments array'),
    timeoutMs: z.number().default(30000).describe('Max execution time'),
  }),
  execute: async ({ command, args, timeoutMs }) => {
    // Safety: only allow whitelisted commands
    if (!ALLOWED_COMMANDS.includes(command)) {
      return { error: `Command not allowed: ${command}` };
    }

    const fullCmd = `${command} ${args.join(' ')}`;
    logger.info('execCommand', { command, args });

    try {
      const output = execSync(fullCmd, {
        timeout: timeoutMs,
        encoding: 'utf-8',
        maxBuffer: 5 * 1024 * 1024, // 5MB output cap
      });
      return { success: true, output: output.slice(0, 10000) };
    } catch (err: any) {
      return {
        success: false,
        output: err.stdout?.slice(0, 5000) ?? '',
        error: err.message
      };
    }
  }
});