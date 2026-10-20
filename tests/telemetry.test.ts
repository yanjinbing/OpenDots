import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

const run = promisify(execFile);
const platformUrl = new URL('../src/server/platform.ts', import.meta.url).href;
const storeUrl = new URL('../src/server/store.ts', import.meta.url).href;
const workspaceUrl = new URL('../src/server/workspace.ts', import.meta.url)
  .href;
const tsxUrl = 'tsx';

// Intercept the real SDK transport before import, in a fresh process so its
// singleton observes each environment. These probes never send live telemetry.
const probe = `
import { writeFileSync } from 'node:fs';
const requests = [];
globalThis.fetch = async (url, options) => {
  requests.push({ url: String(url), headers: options.headers, body: JSON.parse(options.body) });
  return new Response('{"ok":true}', { status: 202 });
};
const { Platform } = await import(${JSON.stringify(platformUrl)});
const { Store } = await import(${JSON.stringify(storeUrl)});
const { WorkspaceStore } = await import(${JSON.stringify(workspaceUrl)});
const store = new Store(':memory:');
const workspace = new WorkspaceStore(':memory:', 'fixture-owner');
try {
  const platform = new Platform(store, workspace, {
    intelligenceKey: 'test-project-key-never-sent',
    baseUrl: '', runtimeUrl: '', voiceName: 'marin', slackUsers: [],
  });
  await platform.handle(new Request('http://localhost/api/copilotkit/info'));
  await new Promise(resolve => setImmediate(resolve));
  writeFileSync(process.env.OPENDOTS_TELEMETRY_OUTPUT, JSON.stringify(requests));
} finally {
  store.close();
  workspace.close();
}
`;

interface CapturedEvent {
  url: string;
  headers: Record<string, string>;
  body: {
    event: string;
    global_properties: {
      accessibility_title?: string;
      sampleRate: number;
      installation_id?: string;
      opendots_distribution?: string;
    };
  };
}

async function captureRuntime(overrides: Record<string, string> = {}) {
  const env = { ...process.env };
  for (const key of [
    'DO_NOT_TRACK',
    'COPILOTKIT_TELEMETRY_DISABLED',
    'COPILOTKIT_TELEMETRY_SAMPLE_RATE',
    'COPILOTKIT_LICENSE_TOKEN',
    'COPILOTKIT_TELEMETRY_URL',
  ])
    delete env[key];
  const directory = await mkdtemp(join(tmpdir(), 'opendots-telemetry-'));
  const script = join(directory, 'probe.mjs');
  const output = join(directory, 'events.json');
  await writeFile(script, probe);
  let serialized: string;
  try {
    await run(process.execPath, ['--import', tsxUrl, script], {
      env: {
        ...env,
        CPK_TELEMETRY_ID: 'test-project-identity',
        OPENDOTS_TELEMETRY_OUTPUT: output,
        ...overrides,
      },
      timeout: 15000,
    });
    serialized = await readFile(output, 'utf8');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  const events: CapturedEvent[] = JSON.parse(serialized);
  return events;
}

it('sends OpenDots runtime metadata with CLI identity and without the project key', async () => {
  const events = await captureRuntime();
  const created = events.find(
    (event) => event.body.event === 'oss.runtime.instance_created',
  );
  expect(created).toBeDefined();
  expect(created?.url).toBe('https://telemetry.copilotkit.ai/ingest');
  expect(created?.headers['X-CopilotKit-Telemetry-Id']).toBe(
    'test-project-identity',
  );
  expect(created?.body.global_properties.accessibility_title).toBe('OpenDots');
  expect(created?.body.global_properties.sampleRate).toBe(1);
  expect(JSON.stringify(events)).not.toContain('test-project-key-never-sent');
  expect(
    events.some((event) => event.body.event === 'intelligence_signup'),
  ).toBe(false);
});

it.each([
  ['DO_NOT_TRACK', 'true'],
  ['DO_NOT_TRACK', '1'],
  ['COPILOTKIT_TELEMETRY_DISABLED', 'true'],
  ['COPILOTKIT_TELEMETRY_DISABLED', '1'],
  ['COPILOTKIT_TELEMETRY_SAMPLE_RATE', '0'],
])('respects %s=%s', async (key, value) => {
  expect(await captureRuntime({ [key]: value })).toEqual([]);
});

it('forwards the CLI identity and both opt-outs into the Docker app', async () => {
  const compose = await readFile(
    new URL('../compose.yml', import.meta.url),
    'utf8',
  );
  expect(compose).toContain('CPK_TELEMETRY_ID: ${CPK_TELEMETRY_ID:-}');
  expect(compose).toContain('DO_NOT_TRACK: ${DO_NOT_TRACK:-0}');
  expect(compose).toContain(
    'COPILOTKIT_TELEMETRY_DISABLED: ${COPILOTKIT_TELEMETRY_DISABLED:-false}',
  );
});

it('hands the persistent installation fallback to the installed runtime when CLI identity is absent', async () => {
  const events = await captureRuntime({ CPK_TELEMETRY_ID: '' });
  const created = events.find(
    (event) => event.body.event === 'oss.runtime.instance_created',
  );
  expect(created).toBeDefined();
  expect(created?.body.global_properties.installation_id).toMatch(
    /^[0-9a-f-]{36}$/,
  );
  expect(created?.headers['X-CopilotKit-Telemetry-Id']).toBe(
    created?.body.global_properties.installation_id,
  );
  expect(created?.body.global_properties.opendots_distribution).toBe('web');
});
