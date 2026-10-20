# Local In-Memory Conversations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run OpenDots text conversations entirely through the local CopilotKit SSE runtime with bounded process-memory history and no CopilotKit Intelligence network dependency.

**Architecture:** `Platform` owns one `InMemoryAgentRunner` and supplies it to an SSE-mode `CopilotRuntime`. SQLite remains the source of conversation identity and authorization, while the runner stores messages and events only until process exit; browser and headless turns share the same local runtime endpoints.

**Tech Stack:** TypeScript, Hono, CopilotKit runtime/react SDK in local SSE mode, AG-UI, Vitest, React 19.

**Spec:** `docs/superpowers/specs/2026-10-10-local-in-memory-conversations-design.md`

## Global Constraints

- Keep `@copilotkit/react-core` and `@copilotkit/runtime`; remove only the Intelligence service dependency from conversation execution.
- Message history is process-local and intentionally disappears on restart.
- SQLite conversation metadata and authorization remain durable.
- Managed Slack Channels and Automatic Learning are unavailable in local conversation mode.
- Existing text chat, page tools, computer tools, human review, stop, voice, and scheduled turns remain functional.

---

### Task 1: Local Runtime And Setup

**Files:**
- Modify: `src/server/platform.ts`
- Modify: `src/server/platform-config.ts`
- Modify: `src/server/dot-agent.ts`
- Modify: `tests/intelligence-key.test.ts`
- Modify: `tests/setup.test.ts`

**Interfaces:**
- Produces: `Platform.runner: InMemoryAgentRunner`, an always-present local `Platform.handler`, and `setupStatus(config)` that requires only model credentials for chat.
- Consumes: existing `PlatformConfig`, `DotAgent`, and `/api/copilotkit/*` request scope validation.

- [ ] **Step 1: Write failing local-mode setup and runtime-info tests**

Add assertions that a model-configured platform without `intelligenceKey` has no missing setup values and that `/api/copilotkit/info` returns `mode: "sse"` rather than 503.

- [ ] **Step 2: Run focused tests and verify the old Intelligence requirement fails**

Run: `npm test -- tests/intelligence-key.test.ts tests/setup.test.ts`

- [ ] **Step 3: Construct `CopilotRuntime` with one bounded `InMemoryAgentRunner`**

Use `new InMemoryAgentRunner({ maxThreads: 100, maxRunsPerThread: 50, maxBytes: 50 * 1024 * 1024 })`, pass it as `runner`, omit `intelligence`, `identifyUser`, `channels`, and generated thread names, and always construct the handler.

- [ ] **Step 4: Remove the Intelligence credential guard and learned-skill attachment from `DotAgent`**

Require only `apiKey` and `model`; do not send Intelligence keys or URLs during a run.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `npm test -- tests/intelligence-key.test.ts tests/setup.test.ts tests/tanstack-agent.test.ts`

Run: `npm run typecheck`

### Task 2: Local Conversation Creation And Navigation

**Files:**
- Modify: `src/server/platform.ts`
- Modify: `src/server/workspace-routes.ts`
- Modify: `src/client/ThreadList.tsx`
- Modify: `tests/app.test.ts`
- Modify: `tests/workspace.test.ts`

**Interfaces:**
- Consumes: `WorkspaceStore.bindThread(id, dotId, title)` and `WorkspaceState.conversations`.
- Produces: `Platform.createConversation(dotId, title)` with no network I/O and a thread list rendered solely from local metadata.

- [ ] **Step 1: Write a failing conversation-creation test without an Intelligence key**

Assert `POST /api/conversations` returns 201 with a locally bound UUID when model setup is present and no Intelligence fetch occurs.

- [ ] **Step 2: Run the focused test and verify the current 503 failure**

Run: `npm test -- tests/app.test.ts`

- [ ] **Step 3: Bind generated conversations locally and simplify `ThreadList`**

Remove `useThreads`, remote title lookup, remote errors, and pagination. Render `thread.title` from `local` conversations.

- [ ] **Step 4: Run server and component tests**

Run: `npm test -- tests/app.test.ts tests/workspace.test.ts tests/controls.test.tsx`

### Task 3: Shared Local History For Headless And Voice Turns

**Files:**
- Modify: `src/server/headless.ts`
- Modify: `src/server/platform.ts`
- Modify: `tests/headless-runtime.test.ts`
- Modify: `tests/voice.test.ts`

**Interfaces:**
- Produces: `runThreadTurn(...)` using `ProxiedCopilotRuntimeAgent` in SSE mode; `Platform.history(threadId)` reading `runner.getThreadMessages(threadId)`.
- Consumes: the existing local runtime URL, authorization headers, thread ID, Dot ID, prompt metadata, and `InMemoryAgentRunner` message snapshot.

- [ ] **Step 1: Replace Intelligence mocks with failing SSE proxy expectations**

Assert discovery accepts `{ mode: "sse", agents }`, constructs `ProxiedCopilotRuntimeAgent`, connects existing history before adding the new prompt, preserves scheduled/voice message prefixes, and aborts cleanly.

- [ ] **Step 2: Run headless tests and verify they fail against `IntelligenceAgent`**

Run: `npm test -- tests/headless-runtime.test.ts`

- [ ] **Step 3: Implement SSE headless turns and runner-backed history**

Create the proxy with `runtimeUrl`, `agentId`, headers and fetch signal composition; assign `threadId`, call `connectAgent()`, add the marked message, call `runAgent()`, and read the newest assistant response. Format the last 12 local user/assistant messages in `Platform.history` with the existing 12,000-character limit.

- [ ] **Step 4: Run headless and voice tests**

Run: `npm test -- tests/headless-runtime.test.ts tests/voice.test.ts`

### Task 4: Intelligence-Only Feature Degradation And Full Verification

**Files:**
- Modify: `src/server/platform-config.ts`
- Modify: `src/server/platform.ts`
- Modify: `src/server/index.ts`
- Modify: `src/client/WorkspaceDialog.tsx`
- Modify: `README.md`
- Modify: `.env.example`
- Test: `tests/setup.test.ts`
- Test: `tests/intelligence-key.test.ts`

**Interfaces:**
- Produces: setup status and user-facing copy that identify local, non-durable chat; declared managed Slack reports `unavailable`; CSP no longer needs the Intelligence WebSocket origin.
- Consumes: the local runtime behavior established by Tasks 1-3.

- [ ] **Step 1: Add failing degradation assertions**

Assert a declared Slack configuration reports `unavailable`, voice readiness depends on voice and model settings only, and setup never lists an Intelligence key as missing.

- [ ] **Step 2: Run focused tests and verify expected failures**

Run: `npm test -- tests/setup.test.ts tests/intelligence-key.test.ts`

- [ ] **Step 3: Remove Intelligence startup, CSP, and setup-copy assumptions**

Keep legacy environment parsing only where compatibility tests require it, but remove normal chat dependence and update setup/readme text to state that message history is memory-only.

- [ ] **Step 4: Run all verification**

Run: `npm test`

Run: `npm run typecheck`

Run: `npm run lint`

Run: `npm run build`

Run: `npm run check-format`

- [ ] **Step 5: Review the final diff for accidental Intelligence requests and unrelated files**

Run: `rg -n "new CopilotKitIntelligence|new IntelligenceAgent|intelligence\.copilotkit|listThreads\(" src`

Run: `git status --short && git diff --check`
