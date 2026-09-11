import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const PACKAGE = 'package.json';
const CHART = 'charts/mc-mcp-server/Chart.yaml';
const RELEASE_PATHS = ['src/', 'charts/', 'Dockerfile', 'package.json', 'pnpm-lock.yaml'];

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function parse(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);

  if (!match) {
    fail(`"${version}" is not a semantic version`);
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compare(left: string, right: string): number {
  const a = parse(left);
  const b = parse(right);

  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) {
      return a[index]! - b[index]!;
    }
  }

  return 0;
}

function chartVersions(source: string): { version: string; appVersion: string } {
  const version = /^version:\s*(\S+)/m.exec(source)?.[1];
  const appVersion = /^appVersion:\s*"?([^"\s]+)"?/m.exec(source)?.[1];

  if (version === undefined || appVersion === undefined) {
    fail(`${CHART} is missing version or appVersion`);
  }

  return { version, appVersion };
}

function previous(path: string, ref: string): string | null {
  try {
    return execFileSync('git', ['show', `${ref}:${path}`], { encoding: 'utf8' });
  } catch {
    return null;
  }
}

function changedFiles(ref: string): string[] {
  try {
    return execFileSync('git', ['diff', '--name-only', ref, 'HEAD'], { encoding: 'utf8' })
      .split('\n')
      .filter((line) => line !== '');
  } catch {
    return [];
  }
}

const [packageSource, chartSource] = await Promise.all([
  readFile(PACKAGE, 'utf8'),
  readFile(CHART, 'utf8'),
]);

const declared = (JSON.parse(packageSource) as { version: string }).version;
const chart = chartVersions(chartSource);

if (chart.version !== declared || chart.appVersion !== declared) {
  fail(
    `version drift: ${PACKAGE} says ${declared}, ${CHART} says version ${chart.version} ` +
    `and appVersion ${chart.appVersion}. The published tag is built from ${PACKAGE}, so the ` +
    'chart would claim a version it was never released as.',
  );
}

const base = process.argv[2];

if (base === undefined) {
  process.stdout.write(`version ${declared} is consistent\n`);
  process.exit(0);
}

/*
Anything that ships has to arrive under a version of its own. Without this the tag keeps its
0.1.0 root forever and the only thing separating two releases is a timestamp, which says nothing
about whether upgrading between them is safe.
*/
const shipped = changedFiles(base).filter((file) => RELEASE_PATHS.some((prefix) => file.startsWith(prefix)));

if (shipped.length === 0) {
  process.stdout.write(`version ${declared} is consistent; nothing that ships changed\n`);
  process.exit(0);
}

const before = previous(PACKAGE, base);

if (before === null) {
  process.stdout.write(`version ${declared} is consistent; no earlier ${PACKAGE} to compare\n`);
  process.exit(0);
}

const earlier = (JSON.parse(before) as { version: string }).version;

if (compare(declared, earlier) <= 0) {
  fail(
    `${shipped.length} file(s) that ship changed, but the version stayed at ${declared} ` +
    `(was ${earlier}). Raise it: minor when a tool is added, removed, or answers differently, ` +
    `or when a chart default changes how a deployment behaves; patch for a fix. Changed: ` +
    `${shipped.slice(0, 8).join(', ')}${shipped.length > 8 ? ', ...' : ''}`,
  );
}

process.stdout.write(`version ${earlier} -> ${declared}\n`);
