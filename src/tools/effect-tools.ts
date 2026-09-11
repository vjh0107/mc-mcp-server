import type { McpServer } from '@modelcontextprotocol/server';
import type { BotRegistry } from '../bot/registry.ts';
import { registerFeed } from '../mcp/feed.ts';

export function registerEffectTools(server: McpServer, registry: BotRegistry): void {
  /*
  Plenty of feedback never reaches the screen as words: a success chime, a level-up, the particles
  an effect throws off. Keeping them lets a test assert on things it otherwise cannot see.
  */
  registerFeed(server, registry, {
    tool: 'read-effects',
    waitTool: 'wait-for-effect',
    noun: 'sound or particle',
    feed: (session) => session.effects,
    describe: 'Read the sounds and particles the server has played near the bot.',
    describeWait: 'Wait until a sound or particle whose name matches a regular expression is played.',
  });
}
