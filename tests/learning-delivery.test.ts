import { afterEach, expect, it, vi } from 'vitest';
import { CopilotKitIntelligence } from '@copilotkit/runtime/v2';
import { lastValueFrom, toArray } from 'rxjs';
import { chat } from '@tanstack/ai';
import { DotAgent } from '../src/server/dot-agent.js';
import { completion } from './fixtures/model-stream.js';
import { Store } from '../src/server/store.js';
import { WorkspaceStore } from '../src/server/workspace.js';

vi.mock('@tanstack/ai', { spy: true });
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it('ignores Intelligence skill delivery settings and runs the local model', async () => {
  const store = new Store(':memory:');
  const workspace = new WorkspaceStore(':memory:', 'owner');
  try {
    const dot = workspace.dots()[0];
    workspace.updateDot(dot.id, {
      ...dot,
      learningContainerId: 'research',
      skillDeliveryEnabled: true,
    });
    workspace.bindThread('thread', dot.id, 'Learning');
    const delivery = vi
      .spyOn(CopilotKitIntelligence.prototype, 'getLearnedSkillsSnapshots')
      .mockRejectedValue(new Error('Intelligence must not be contacted'));
    const network = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        completion({ role: 'assistant', content: 'Ready to review evidence.' }),
      );
    const agent = new DotAgent(
      store,
      workspace,
      {
        apiKey: 'fixture',
        model: 'fixture',
        baseUrl: 'https://unused.invalid',
        runtimeUrl: '',
        voiceName: 'marin',
        slackUsers: [],
      },
      dot.id,
    );
    const events = await lastValueFrom(
      agent
        .run({
          threadId: 'thread',
          runId: 'run',
          messages: [
            { id: 'message', role: 'user', content: 'Review the evidence.' },
          ],
          state: {},
          tools: [],
          context: [],
          forwardedProps: {},
        })
        .pipe(toArray()),
    );
    expect(JSON.stringify(events)).toContain('Ready to review evidence.');
    expect(chat).toHaveBeenCalledTimes(1);
    expect(network).toHaveBeenCalledTimes(1);
    expect(delivery).not.toHaveBeenCalled();
    const request = String(network.mock.calls[0][1]?.body);
    expect(request).not.toContain('copilotkit_load_skill');
    expect(request).not.toContain('copilotkit_read_skill_file');
    expect(request).toContain('read_space_page');
    expect(request).toContain(
      'Use only the tools provided in this conversation',
    );
  } finally {
    workspace.close();
    store.close();
  }
});
