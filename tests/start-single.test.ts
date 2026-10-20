import { afterEach, expect, it } from 'vitest';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

it('sets APP_ORIGIN from the container hostname for both services', () => {
  const directory = mkdtempSync(join(tmpdir(), 'opendots-start-single-'));
  temporaryDirectories.push(directory);
  const captureFile = join(directory, 'environment.log');
  const hostname = join(directory, 'hostname');
  const node = join(directory, 'node');
  writeFileSync(hostname, '#!/bin/sh\nprintf "%s\\n" container-test\n');
  writeFileSync(
    node,
    '#!/bin/sh\nprintf "%s|%s\\n" "$APP_ORIGIN" "$*" >> "$CAPTURE_FILE"\nsleep 0.2\n',
  );
  chmodSync(hostname, 0o755);
  chmodSync(node, 0o755);

  const result = spawnSync('bash', [resolve('deployment/start-single.sh')], {
    encoding: 'utf8',
    env: {
      ...process.env,
      APP_ORIGIN:
        'https://4310-${HOSTNAME}.sandbox.airacloud.com,https://admin.example.com',
      CAPTURE_FILE: captureFile,
      PATH: `${directory}:${process.env.PATH}`,
    },
  });

  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  expect(readFileSync(captureFile, 'utf8').trim().split('\n').sort()).toEqual(
    [
      'https://4310-container-test.sandbox.airacloud.com,https://admin.example.com|/app/dist/server/browser/index.js',
      'https://4310-container-test.sandbox.airacloud.com,https://admin.example.com|/app/dist/server/server/index.js',
    ].sort(),
  );
});

it('stops with a clear error when APP_ORIGIN is missing', () => {
  const directory = mkdtempSync(join(tmpdir(), 'opendots-start-single-'));
  temporaryDirectories.push(directory);
  const hostname = join(directory, 'hostname');
  writeFileSync(hostname, '#!/bin/sh\nprintf "%s\\n" container-test\n');
  chmodSync(hostname, 0o755);
  const environment = { ...process.env };
  delete environment.APP_ORIGIN;

  const result = spawnSync('bash', [resolve('deployment/start-single.sh')], {
    encoding: 'utf8',
    env: {
      ...environment,
      PATH: `${directory}:${process.env.PATH}`,
    },
  });

  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('APP_ORIGIN must be set.');
});
