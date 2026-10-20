# Local In-Memory Conversations Design

## Goal

Remove OpenDots' runtime dependency on the CopilotKit Intelligence service while retaining the local CopilotKit React/runtime SDK and AG-UI protocol. Text conversations and existing tool UI must continue to work. Conversation message history is intentionally process-local and is discarded when the server restarts.

## Root Cause

The current runtime is constructed in Intelligence mode. Browser thread requests such as `GET /api/copilotkit/threads` are forwarded by `CopilotKitIntelligence` to the configured Intelligence gateway. An upstream `502 Bad Gateway` therefore breaks thread listing, connection, history recovery, and can consume the agent's 90-second turn limit.

OpenDots already keeps conversation ownership and titles in SQLite, but delegates messages, run events, and agent state to Intelligence. CopilotKit runtime 1.75 includes an SSE mode backed by `InMemoryAgentRunner`, including local list/messages/events/state endpoints, so a separate message-store implementation is unnecessary.

## Architecture

`Platform` will always construct a local `CopilotRuntime` without the `intelligence` option. Its single `InMemoryAgentRunner` will be retained on `Platform` and configured with bounded storage. The existing `/api/copilotkit/*` route remains unchanged from the browser's perspective.

Conversation creation will generate an ID and bind it directly in `WorkspaceStore`; it will no longer create a remote thread. SQLite remains the canonical source for conversation metadata and authorization. The runner is the canonical source for message history until the process exits.

The frontend keeps `CopilotKitProvider`, `useAgent`, tool renderers, and human-in-the-loop components. `ThreadList` will use local workspace metadata for titles rather than remote generated names, avoiding an unnecessary remote-style listing dependency for navigation.

## Data Flow

1. The browser creates a conversation through `POST /api/conversations`.
2. The server validates the Dot and saves the generated conversation binding locally.
3. `useAgent` connects to the existing `/api/copilotkit` endpoint, now in SSE mode.
4. A run is handled by `InMemoryAgentRunner`, which invokes `DotAgent` and retains its message snapshot and events in process memory.
5. Reopening a conversation during the same process lifetime restores messages from the runner's local thread endpoint.
6. Restarting the server leaves conversation metadata visible but yields an empty transcript for those conversations. The next message starts new in-memory history under the same thread ID.

## Background And Voice Turns

The Intelligence WebSocket-based `IntelligenceAgent` headless client will be replaced by the local runtime's HTTP/SSE run path or a direct runner-compatible client. Scheduled tasks must append to the same in-memory thread and voice history must read from the same runner, so foreground, scheduled, and voice interactions share one process-local transcript.

## Configuration And Feature Degradation

Text chat setup will require only `OPENAI_API_KEY` and `OPENAI_MODEL`; an Intelligence key will no longer be required. Setup copy and errors will describe local, non-durable conversations.

Features that inherently require Intelligence will be disabled:

- Managed Slack Channels will report unavailable in local conversation mode.
- Automatic Learning container delivery will not be attached to agents.
- Intelligence API/WS URL settings become unused by normal chat.

Local OpenDots memories stored by `Store` remain available because they are independent of Intelligence.

## Memory Bounds

Use one `InMemoryAgentRunner` per process with explicit conservative limits for thread count, runs per thread, and retained bytes. The precise values will be constants near runtime construction and covered by configuration tests. Eviction affects only message/event history; SQLite conversation metadata remains intact.

## Error Handling

- A missing model configuration produces the existing setup-required response without mentioning Intelligence.
- Reopening a metadata-only conversation after restart is valid and displays an empty transcript.
- Local runtime errors remain visible through the existing chat error UI.
- No request in the text-chat path may call an Intelligence HTTP or WebSocket endpoint.

## Testing

Tests will be written before implementation to prove:

- setup succeeds without an Intelligence key when model configuration exists;
- conversation creation is local and makes no Intelligence request;
- the runtime reports SSE/local mode and exposes local thread endpoints;
- a chat run is retained and recoverable during the process lifetime;
- local history is used by voice and scheduled turns;
- Intelligence-only Slack and Learning behavior is disabled explicitly;
- existing workspace authorization, chat rendering, tool calls, typecheck, and build remain valid.

## Non-Goals

- Durable message storage across server restarts.
- Removing `@copilotkit/react-core` or `@copilotkit/runtime` packages.
- Reimplementing AG-UI streaming or tool rendering.
- Replacing Managed Slack with a custom Slack adapter.
- Migrating existing Intelligence-hosted transcripts into local memory.
