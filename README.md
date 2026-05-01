# Polaris ✦

**An AI-native, full-stack cloud IDE — write a prompt, ship an app.**

Polaris is a browser-based development environment where an AI coding agent reads, creates, and edits your project files in real time, while a live WebContainer preview runs your code directly in the tab. No local setup. No context switching.

---

## Table of Contents

- [Overview](#overview)
- [Live Demo & Screenshots](#live-demo--screenshots)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [How It Works](#how-it-works)
  - [AI Coding Agent](#ai-coding-agent)
  - [Real-Time File Sync](#real-time-file-sync)
  - [In-Browser Execution](#in-browser-execution)
  - [GitHub Integration](#github-integration)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Design Decisions](#design-decisions)

---

## Overview

Polaris bridges the gap between AI chat and a real development environment. Instead of copying code snippets from a chatbot into your editor, Polaris gives an AI agent **direct, structured access** to your project's file system. You describe what you want to build; the agent plans, scaffolds, and implements — then the result runs immediately in a live preview powered by WebContainers.

The core interaction loop:

```
User prompt → AI agent plans → Agent reads/writes files → WebContainer hot-reloads → User sees result
```

Everything is persisted in [Convex](https://convex.dev) (a reactive, real-time database), so your project and conversation history survive page refreshes and are always in sync across tabs.

---

## Key Features

### 🤖 AI Coding Agent
- Powered by **Google Gemini 2.5 Pro** via the [Inngest AgentKit](https://agentkit.inngest.com/) framework
- Equipped with a full suite of file-system tools: `listFiles`, `readFiles`, `createFiles`, `createFolder`, `updateFile`, `renameFile`, `deleteFiles`, `scrapeUrls`
- Multi-turn conversation with persistent context — the agent remembers previous exchanges within a conversation
- Automatic conversation title generation using a fast secondary model (Gemini Flash)
- Graceful failure recovery: if a run errors, the assistant message is updated with a friendly error explanation rather than silently failing

### 🖥️ In-Browser IDE
- Full **CodeMirror 6** editor with syntax highlighting for JS/TS/JSX/TSX, HTML, CSS, JSON, Markdown, and Python
- **AI autocomplete** — ghost-text inline suggestions fetched on a debounced keystroke, accepted with `Tab`
- **Quick Edit** (⌘K) — select any code block, press ⌘K, type a natural-language instruction, and the selection is replaced with the AI's edit
- **Selection tooltip** — a contextual action menu appears on any text selection, offering quick access to Quick Edit
- Minimap, indentation markers, fold gutters, bracket matching, and multi-cursor support via CodeMirror extensions
- Tab management with pinned vs. preview tabs (double-click to pin, VS Code-style)

### ⚡ Live Preview (WebContainers)
- Runs a full Node.js environment **inside the browser** using `@webcontainer/api`
- Installs npm dependencies, starts a dev server, and renders the output in an embedded iframe
- File changes from the AI agent or manual edits are hot-synced into the container automatically
- Built-in xterm.js terminal panel showing real-time install/build output
- Configurable install command and dev command per project (e.g., swap `npm install` for `pnpm install`)
- One-click container restart

### 🗂️ File Explorer
- Hierarchical tree view mirroring the actual project structure
- Context-menu actions: new file, new folder, rename, delete (recursive for folders)
- Inline rename/create inputs that appear directly in the tree without a modal
- Collapse-all shortcut

### 🔗 GitHub Integration
- **Import any public or private repo** — Polaris clones the full tree, detects binary vs. text files, and streams everything into Convex storage
- **Export to GitHub** — creates a new repository under the authenticated user's account and pushes all project files as a single commit
- Supports configurable visibility (public/private) and description
- Real-time export status tracking (exporting → completed/failed) with a cancel option
- Powered by [Inngest](https://inngest.com) durable functions — import/export survive server restarts and can be cancelled mid-flight

### 💬 Conversation Management
- Multiple conversations per project, switchable from the sidebar
- Full message history with markdown rendering via `streamdown`
- Cancel in-flight AI requests at any time
- Past conversations browseable via a command-palette dialog

---

## Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                          Browser (Next.js)                        │
│                                                                   │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ Conversation│  │  CodeMirror  │  │    WebContainer          │ │
│  │  Sidebar    │  │  Editor      │  │  (Node.js in-browser)    │ │
│  │             │  │  + AI Ghost  │  │  iframe preview          │ │
│  │  (Convex    │  │    Text      │  │  xterm.js terminal       │ │
│  │  real-time) │  │  + Quick Edit│  │                          │ │
│  └──────┬──────┘  └──────┬───────┘  └──────────────────────────┘ │
│         │                │                                        │
└─────────┼────────────────┼────────────────────────────────────────┘
          │ Convex WS      │ REST API
          ▼                ▼
┌─────────────────┐  ┌──────────────────────────────────────────────┐
│   Convex DB     │  │              Next.js API Routes               │
│                 │  │                                               │
│  projects       │  │  /api/messages      → triggers Inngest event  │
│  files          │  │  /api/quick-edit    → Gemini Flash (streaming)│
│  conversations  │  │  /api/suggestion    → Gemini Flash (ghost txt)│
│  messages       │  │  /api/github/import → triggers Inngest event  │
│                 │  │  /api/github/export → triggers Inngest event  │
└─────────────────┘  └──────────────────┬───────────────────────────┘
                                         │
                                         ▼
                              ┌──────────────────────┐
                              │   Inngest (durable   │
                              │   background jobs)   │
                              │                      │
                              │  processMessage      │
                              │   └─ AgentKit        │
                              │       └─ Gemini 2.5 Pro│
                              │       └─ File tools  │
                              │                      │
                              │  importGithubRepo    │
                              │  exportToGithub      │
                              └──────────────────────┘
```

**Data flow for a user message:**
1. User types a message and submits
2. Next.js API route creates a `user` message and a placeholder `assistant` message (status: `processing`) in Convex
3. Convex's real-time subscription instantly renders the loading state in the UI
4. The API route fires an Inngest event (`message/sent`)
5. Inngest runs the `processMessage` function durably: fetches conversation history, runs the AgentKit network (Gemini 2.5 Pro + file tools, up to 20 iterations)
6. After each tool call the file changes land in Convex → the editor and WebContainer sync automatically
7. When the agent produces a final text response, Inngest updates the assistant message in Convex (status: `completed`)
8. The Convex subscription pushes the completed message to the browser

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router) |
| **Language** | TypeScript 5 |
| **Database / Realtime** | Convex |
| **Background Jobs** | Inngest + AgentKit |
| **AI Models** | Google Gemini 2.5 Pro, Gemini 2.5 Flash |
| **Auth** | Clerk |
| **In-Browser Runtime** | WebContainers (`@webcontainer/api`) |
| **Code Editor** | CodeMirror 6 |
| **Terminal** | xterm.js |
| **UI Components** | shadcn/ui + Radix UI |
| **Styling** | Tailwind CSS v4 |
| **Animations** | Motion (Framer Motion) |
| **Markdown Rendering** | streamdown |
| **Web Scraping** | Firecrawl |
| **GitHub API** | Octokit |
| **Error Monitoring** | Sentry |
| **Schema Validation** | Zod |
| **State Management** | Zustand |

---

## How It Works

### AI Coding Agent

The agent is built with **Inngest AgentKit**, which provides a `createAgent` / `createNetwork` abstraction over LLM calls with durable execution (retries, cancellation, observability).

```typescript
// src/features/conversations/inngest/process-message.ts

const codingAgent = createAgent({
  name: 'polaris',
  model: gemini({ model: 'gemini-2.5-pro' }),
  system: CODING_AGENT_SYSTEM_PROMPT,
  tools: [
    createListFilesTool({ internalKey, projectId }),
    createReadFilesTool({ internalKey }),
    createUpdateFileTool({ internalKey }),
    createCreateFilesTool({ projectId, internalKey }),
    createCreateFolderTool({ projectId, internalKey }),
    createRenameFileTool({ internalKey }),
    createDeleteFilesTool({ internalKey }),
    createScrapeUrlsTool(),
  ],
});

const network = createNetwork({
  agents: [codingAgent],
  maxIter: 20,
  router: ({ network }) => {
    // Keep running if the last output contained tool calls.
    // Stop only when the model produces pure text (final answer).
    const lastResult = network.state.results.at(-1);
    const hasText    = lastResult?.output.some(m => m.type === 'text' && m.role === 'assistant');
    const hasTools   = lastResult?.output.some(m => m.type === 'tool_call');
    return (hasText && !hasTools) ? undefined : codingAgent;
  },
});
```

Each tool validates its inputs with Zod, resolves parent IDs by querying Convex, and wraps its mutation in an Inngest `step.run` so that individual tool calls are individually retried on failure.

The function is registered with a `cancelOn` clause, meaning any in-flight generation is cleanly aborted when the user clicks Cancel — no orphaned background work.

### Real-Time File Sync

Convex's reactive query model means every file write by the agent is immediately visible everywhere:

- The **file explorer** re-renders when any file is added, renamed, or deleted
- The **active CodeMirror instance** re-initialises with the new content (keyed by `file._id`)
- The **WebContainer** receives an `fs.writeFile` call for every changed text file while the preview is running

### In-Browser Execution

WebContainers are booted as a singleton (one instance per browser session) to avoid the overhead of re-booting on every navigation. The hook detects whether the container has already started and skips re-initialisation:

```typescript
// src/features/preview/hooks/use-webcontainer.ts

let webcontainerInstance: WebContainer | null = null;

const getWebContainer = async (): Promise<WebContainer> => {
  if (webcontainerInstance) return webcontainerInstance;
  webcontainerInstance = await WebContainer.boot({ coep: 'credentialless' });
  return webcontainerInstance;
};
```

The flat list of Convex `files` documents is converted into the nested `FileSystemTree` format that WebContainers expect via a recursive path-builder utility.

### GitHub Integration

Import and export are modelled as Inngest durable functions to handle the inherent latency (rate limits, large repos, GitHub API delays) without blocking the HTTP response or risking timeouts.

**Import** walks the full Git tree, detects binary files using `isbinaryfile`, uploads them to Convex storage, and stores text files as plain strings. Folders are created depth-first so parent IDs are always available for child inserts.

**Export** builds a proper Git commit: fetches all files from Convex, creates individual blobs via the GitHub API, assembles a tree, creates a commit on top of the auto-initialised main branch, and force-updates the ref. This preserves a clean commit history.

---

## Project Structure

```
polaris/
├── convex/                    # Convex backend
│   ├── schema.ts              # Database schema (projects, files, conversations, messages)
│   ├── files.ts               # Client-facing file mutations & queries
│   ├── conversations.ts       # Client-facing conversation queries
│   ├── projects.ts            # Client-facing project mutations
│   └── system.ts              # Internal-key-gated mutations (used by Inngest)
│
└── src/
    ├── app/
    │   ├── api/
    │   │   ├── messages/      # Send/cancel messages → triggers Inngest
    │   │   ├── quick-edit/    # Inline AI code edits (Gemini Flash)
    │   │   ├── suggestion/    # Ghost-text autocomplete (Gemini Flash)
    │   │   ├── github/        # Import/export GitHub repos
    │   │   └── inngest/       # Inngest serve endpoint
    │   └── projects/[projectId]/
    │
    ├── components/
    │   ├── ai-elements/       # Reusable AI-first UI primitives
    │   │   ├── prompt-input   # Composable chat input with file attachments
    │   │   ├── message        # Message bubbles with branch navigation
    │   │   ├── reasoning      # Collapsible chain-of-thought display
    │   │   └── conversation   # Scroll-to-bottom conversation container
    │   └── ui/                # shadcn/ui component library
    │
    ├── features/
    │   ├── conversations/
    │   │   ├── components/    # Sidebar, past-conversations dialog
    │   │   ├── hooks/         # Convex query/mutation hooks
    │   │   └── inngest/       # processMessage function + all file tools
    │   ├── editor/
    │   │   ├── components/    # CodeMirror wrapper, tab bar, breadcrumbs
    │   │   ├── extensions/    # suggestion, quick-edit, minimap, theme, etc.
    │   │   └── store/         # Zustand tab state
    │   ├── preview/
    │   │   ├── hooks/         # useWebContainer
    │   │   └── components/    # Terminal, settings popover
    │   └── projects/
    │       ├── components/    # File explorer tree, project views, navbar
    │       ├── hooks/         # Convex file/project hooks
    │       └── inngest/       # importGithubRepo, exportToGithub
    │
    ├── inngest/
    │   ├── client.ts          # Inngest client with Sentry middleware
    │   └── functions.ts       # Demo generate function
    │
    └── lib/
        ├── convex-client.ts   # Server-side Convex HTTP client
        ├── firecrawl.ts       # Firecrawl scraping client
        └── utils.ts           # cn() and other utilities
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- A [Convex](https://convex.dev) account
- A [Clerk](https://clerk.com) account
- A [Inngest](https://inngest.com) account (free tier works)
- A Google AI API key (for Gemini models)
- A Firecrawl API key (for the `scrapeUrls` tool)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/polaris.git
cd polaris

# Install dependencies
npm install

# Start the Convex development server (separate terminal)
npx convex dev

# Start the Next.js development server
npm run dev
```

### Setting Up Inngest Locally

```bash
# Install the Inngest Dev Server
npx inngest-cli@latest dev

# The dev server will auto-discover your functions at http://localhost:3000/api/inngest
```

---

## Environment Variables

Create a `.env.local` file in the project root:

```env
# Convex
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
POLARIS_CONVEX_INTERNAL_KEY=your-secret-internal-key   # any random string, shared between Next.js and Inngest

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
CLERK_JWT_ISSUER_DOMAIN=https://your-clerk-instance.clerk.accounts.dev

# Google AI (Gemini)
GOOGLE_GENERATIVE_AI_API_KEY=...

# Firecrawl
FIRECRAWL_API_KEY=fc-...

# Optional: Sentry
SENTRY_DSN=...
SENTRY_ORG=...
SENTRY_PROJECT=...
```

> **Note:** `POLARIS_CONVEX_INTERNAL_KEY` is a shared secret used to authenticate calls from Inngest (a server environment) to Convex mutations that should not be exposed to the browser client. Set it to any long random string and use the same value in both environments.

---

## Design Decisions

**Why Convex?**
Convex's reactive query model eliminates the need for polling or WebSocket management. When the AI agent writes a file, every subscribed client (file explorer, editor, WebContainer sync loop) is notified and re-renders automatically. The server-side `ConvexHttpClient` lets Inngest functions write directly to the database without going through the browser.

**Why Inngest?**
LLM agents can run for tens of seconds (or minutes for large repos). Inngest provides durable execution with step-level retries, making the agent resilient to transient network errors or model timeouts. The `cancelOn` primitive cleanly handles user-initiated cancellation without leaving zombie processes.

**Why WebContainers instead of a remote sandbox?**
Running Node.js in the browser means zero cold-start latency for the preview, no server infrastructure costs per project, and no network round-trips for file writes. The trade-off is that the `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` headers are required, which Polaris sets globally in `next.config.ts`.

**Why a custom `POLARIS_CONVEX_INTERNAL_KEY` pattern?**
Convex's standard auth model is user-session-based. Inngest functions run on the server with no user session, so a separate internal-key mechanism gates mutations that the AI agent needs to perform. This keeps those endpoints out of the public Convex API surface while still using the same database.

**Why separate `suggestion` and `quick-edit` editor extensions?**
These are intentionally decoupled. Ghost-text autocomplete is always active and fires on a 300ms debounce. Quick Edit is explicitly invoked and replaces a selection, so it has a different UX contract (visible input field, explicit submit). Keeping them as separate `StateField` + `ViewPlugin` pairs avoids entangling their abort controller lifecycles.
