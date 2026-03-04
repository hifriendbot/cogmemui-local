# CogmemUI Local Companion

Run your Ai conversations through your own Claude Code subscription, right from the [CogmemUI](https://hifriendbot.com/cogmemui) web interface. Includes built-in [CogmemAi](https://hifriendbot.com/developer/) persistent memory so your Ai remembers you across every session.

## What it does

- Routes CogmemUI chat through your local Claude Code CLI (uses your $200/mo subscription)
- Gives the Ai access to your local files (read, write, edit, search)
- Automatically connects CogmemAi persistent memory (if you have an API key)
- Runs on `localhost` only — your data never leaves your machine

## Quick Start

### 1. Prerequisites

- [Node.js](https://nodejs.org/) v18 or newer
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed and signed in (`claude login`)

### 2. Install

```bash
npm install -g cogmemui-local
```

### 3. Run

```bash
cogmemui-local
```

The companion will start and display a bearer token. Copy it.

### 4. Connect to CogmemUI

1. Open [CogmemUI](https://hifriendbot.com/cogmemui)
2. Go to **Settings > Local Server**
3. Paste the token and click **Save & Connect**
4. Enable **"Use Local Ai"** to route chat through your Claude subscription

That's it! Your token is saved automatically — you only need to do this once.

## Windows: Auto-Start on Login

Run this command to create a desktop shortcut and auto-start on login:

```bash
cogmemui-local setup
```

This creates:
- A **desktop shortcut** ("CogmemUI Local") for manual start
- A **startup entry** so the companion runs automatically when you log in

## CogmemAi Persistent Memory

If you have a [CogmemAi API key](https://hifriendbot.com/developer/), add it in **CogmemUI Settings > API Keys**. The companion will automatically give your Ai access to CogmemAi memory tools — no extra configuration needed.

## Options

```
cogmemui-local [options]

  --port <number>       Port to listen on (default: 3847)
  --allow-dir <path>    Allowed directory (can specify multiple)
  --origin <url>        Allowed CORS origin (can specify multiple)
  --reset-token         Generate a new bearer token
  --help, -h            Show this help
```

## How It Works

The companion runs a local HTTP server on `127.0.0.1:3847`. When you send a message in CogmemUI with "Use Local Ai" enabled:

1. CogmemUI sends your message + context to the companion
2. The companion spawns `claude -p` with your system prompt and memory context
3. If you have a CogmemAi API key, the companion automatically configures memory tools
4. Claude's response streams back to CogmemUI in real-time

Your Claude subscription handles the Ai costs. CogmemUI handles the interface. CogmemAi handles the memory.

## Security

- Runs on `localhost` only (127.0.0.1) — not accessible from the network
- Bearer token authentication on every request
- File access is sandboxed to your home directory by default
- Shell commands are disabled by default

## License

MIT
