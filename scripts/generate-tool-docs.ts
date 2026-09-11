import { readFile, writeFile } from 'node:fs/promises';
import { BotRegistry } from '../src/bot/registry.ts';

const START = '<!-- BEGIN GENERATED TOOLS -->';
const END = '<!-- END GENERATED TOOLS -->';

const GROUPS: { file: string; title: string }[] = [
  { file: 'session-tools', title: 'Sessions' },
  { file: 'probe-tools', title: 'Server checks' },
  { file: 'server-tools', title: 'Server interaction' },
  { file: 'movement-tools', title: 'Movement' },
  { file: 'interact-tools', title: 'World interaction' },
  { file: 'window-tools', title: 'GUI windows' },
  { file: 'slot-tools', title: 'Slots and containers' },
  { file: 'inventory-tools', title: 'Inventory' },
  { file: 'block-tools', title: 'Blocks' },
  { file: 'entity-tools', title: 'Entities' },
  { file: 'chat-tools', title: 'Chat' },
  { file: 'hud-tools', title: 'HUD' },
  { file: 'effect-tools', title: 'Sounds and particles' },
  { file: 'crafting-tools', title: 'Crafting' },
  { file: 'furnace-tools', title: 'Smelting' },
];

interface JsonSchema {
  properties?: Record<string, { type?: string; description?: string; enum?: unknown[] }>;
  required?: string[];
}

interface ToolInfo {
  name: string;
  description: string;
  schema: JsonSchema;
}

async function collectTools(): Promise<Map<string, ToolInfo[]>> {
  const byGroup = new Map<string, ToolInfo[]>();
  const registry = new BotRegistry({
    defaults: { version: undefined, usernamePrefix: 'mcp' },
    limits: { max: 1, idleTimeoutMs: 0 },
  });

  for (const group of GROUPS) {
    const module = await import(`../src/tools/${group.file}.ts`) as Record<string, unknown>;
    const register = Object.entries(module)
      .find(([name]) => name.startsWith('register'))?.[1] as
      ((server: unknown, registry: BotRegistry) => void) | undefined;

    if (!register) {
      throw new Error(`${group.file} exports no register function`);
    }

    const tools: ToolInfo[] = [];
    const server = {
      registerTool(name: string, config: { description?: string; inputSchema?: unknown }) {
        const schema = config.inputSchema as { toJSONSchema?: () => JsonSchema } | undefined;
        tools.push({
          name,
          description: config.description ?? '',
          schema: schema?.toJSONSchema?.() ?? {},
        });
        return {};
      },
    };

    register(server, registry);
    byGroup.set(group.title, tools);
  }

  registry.shutdown();

  return byGroup;
}

function renderArgument(
  name: string,
  property: { type?: string; description?: string; enum?: unknown[] },
  required: boolean,
): string {
  const type = property.enum ? property.enum.map((value) => `\`${String(value)}\``).join(' | ') : property.type ?? '?';
  const need = required ? 'required' : 'optional';

  return `  - \`${name}\` (${type}, ${need})${property.description ? ` — ${property.description}` : ''}`;
}

function render(byGroup: Map<string, ToolInfo[]>): { summary: string; detail: string } {
  const total = [...byGroup.values()].reduce((sum, tools) => sum + tools.length, 0);
  const summaryLines: string[] = [`${total} tools in total.`, ''];
  const detailLines: string[] = [];

  for (const [title, tools] of byGroup) {
    summaryLines.push(`**${title}**: ${tools.map((tool) => `\`${tool.name}\``).join(', ')}`, '');

    detailLines.push(`## ${title}`, '');

    for (const tool of tools) {
      const required = new Set(tool.schema.required ?? []);
      const properties = Object.entries(tool.schema.properties ?? {});

      detailLines.push(`### \`${tool.name}\``, '', tool.description, '');

      if (properties.length === 0) {
        detailLines.push('Takes no arguments.', '');
        continue;
      }

      detailLines.push('Arguments:', '');
      for (const [name, property] of properties) {
        detailLines.push(renderArgument(name, property, required.has(name)));
      }
      detailLines.push('');
    }
  }

  return { summary: summaryLines.join('\n').trimEnd(), detail: detailLines.join('\n').trimEnd() };
}

function replaceBlock(source: string, body: string): string {
  const start = source.indexOf(START);
  const end = source.indexOf(END);

  if (start === -1 || end === -1) {
    throw new Error(`README is missing the ${START} / ${END} markers`);
  }

  return `${source.slice(0, start + START.length)}\n\n${body}\n\n${source.slice(end)}`;
}

const byGroup = await collectTools();
const { summary, detail } = render(byGroup);

const readme = await readFile('README.md', 'utf8');
await writeFile('README.md', replaceBlock(readme, summary));

await writeFile(
  'docs/tools.md',
  `# Tools\n\nGenerated from the code by \`pnpm docs:tools\`. Do not edit by hand.\n\n${detail}\n`,
);

process.stdout.write(`generated docs for ${[...byGroup.values()].flat().length} tools\n`);
