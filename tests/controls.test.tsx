import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { TaskActions } from '../src/client/TaskActions';
import { ThreadList } from '../src/client/ThreadList';
import type { Dot, Settings, Task } from '../src/shared/types';
const settings: Settings = {
  name: 'Dot',
  paused: false,
  researchAllowed: true,
  memoryAllowed: true,
  appsAllowed: false,
};
const task: Task = {
  id: 'one',
  prompt: 'A recurring task',
  status: 'completed',
  intervalSeconds: 3600,
  nextRunAt: Date.now() + 3600000,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  error: null,
  lease: null,
  leaseUntil: null,
};
it('offers pause for a completed task waiting on its next scheduled run', () => {
  const html = renderToStaticMarkup(
    <TaskActions
      task={task}
      settings={settings}
      busy={false}
      onAction={() => {}}
      onSchedule={() => {}}
    />,
  );
  expect(html).toContain('Pause schedule');
  expect(html).toContain('Edit schedule');
});
it('offers resume for a paused task without claiming to be running', () => {
  const html = renderToStaticMarkup(
    <TaskActions
      task={{ ...task, status: 'paused' }}
      settings={settings}
      busy={false}
      onAction={() => {}}
      onSchedule={() => {}}
    />,
  );
  expect(html).toContain('Resume task');
  expect(html).not.toContain('Pause schedule');
});
it('labels an interrupted task for owner review before retry', () => {
  const html = renderToStaticMarkup(
    <TaskActions
      task={{ ...task, status: 'interrupted' }}
      settings={settings}
      busy={false}
      onAction={() => {}}
      onSchedule={() => {}}
    />,
  );
  expect(html).toContain('Retry after review');
  expect(html).not.toContain('Pause task');
});

it('renders local conversation titles without a CopilotKit provider', () => {
  const dot: Dot = {
    id: 'dot',
    spaceId: 'space',
    spaceIds: ['space'],
    name: 'Local Dot',
    instructions: 'Help',
    researchAllowed: true,
    memoryAllowed: true,
    appsAllowed: false,
    composioToolkits: [],
    createdAt: 1,
  };
  const html = renderToStaticMarkup(
    <ThreadList
      dots={[dot]}
      local={[
        {
          id: 'thread',
          dotId: dot.id,
          ownerId: 'owner',
          title: 'Local conversation',
          createdAt: 1,
        },
      ]}
      selected="thread"
      onSelect={() => {}}
      onNew={() => {}}
    />,
  );
  expect(html).toContain('Local conversation');
  expect(html).toContain('Local Dot');
});
