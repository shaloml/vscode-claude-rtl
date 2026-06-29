# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A VS Code extension (and equivalent standalone scripts) that adds **right-to-left (Hebrew/Arabic) support to the Claude Code chat sidebar**. Because the Claude Code chat is a sandboxed webview owned by another extension and VS Code has **no API to inject into another extension's webview**, the only way to add RTL is to **append CSS/JS payloads to the installed Claude Code extension's webview files on disk** (`<claude-code-ext>/webview/index.{js,css}`). Everything here exists to do that injection safely, idempotently, and reversibly.

Not affiliated with Anthropic/Microsoft; distributed via **GitHub Releases only** (never a marketplace — an extension that edits another publisher's files conflicts with marketplace policy).

## Build / package commands

```bash
npm install
npm run compile     # tsc -p ./  → dist/ (the extension's runtime)
npm run watch       # tsc -watch, for iterating on the extension host
npm run package     # vsce package → vscode-claude-rtl-X.Y.Z.vsix
```

- Press **F5** in VS Code to launch an Extension Development Host with the extension loaded.
- There is **no test suite, linter, or formatter** configured. Don't invent `npm test`/`npm run lint`.
- Release: pushing a `vX.Y.Z` tag triggers `.github/workflows/release.yml`, which compiles, packages the `.vsix`, and creates a GitHub Release. Keep `package.json` `version` and `CHANGELOG.md` in sync with the tag.

## Architecture — the key thing to understand

There are **two independent delivery channels that inject the exact same payloads**:

1. **The VS Code extension** — `src/extension.ts` (commands, lifecycle, notifications) + `src/patcher.ts` (pure file logic: locate Claude Code, back up, inject/restore). Compiled to `dist/`.
2. **Standalone scripts** — `install/patch-claude-code-vscode.sh` (macOS + Linux) and `install/patch-claude-code-vscode.ps1` (Windows). Same back-up / inject / restore model, no extension needed.

**`payloads/rtl-inject.js` and `payloads/rtl-inject.css` are the single source of truth for all RTL behavior.** Both channels read these same two files and append them verbatim into Claude Code's webview between sentinel comments. **To change how RTL actually works, edit `payloads/` — not the patchers.** The patchers only move bytes around; they contain no direction logic.

### Injection contract (must stay identical across all three patchers)

- **Sentinel comments** wrap the injected block so it can be found and stripped:
  `/* >>> claude-code-rtl (auto) >>> */` … `/* <<< claude-code-rtl (auto) <<< */`.
  These exact strings are duplicated in `src/patcher.ts`, the `.sh`, and the `.ps1` — keep them byte-identical.
- **Idempotency model:** on first run, copy the pristine `index.{js,css}` to `*.bak`. Before *every* re-inject, restore from `*.bak` first, then append. So re-applying always patches a clean original.
- **Safety guard:** if a file already contains the sentinel but has **no `.bak`**, refuse — patching would bake the injection into the backup and lose the pristine original.
- The JS payload is appended after a **bare `;`** so it never glues onto a trailing call expression in Claude Code's minified bundle. It runs under the page's existing CSP nonce for free (the webview links the file).

### Locating the target Claude Code extension (differs by channel — intentionally)

- **Extension:** uses the official API `vscode.extensions.getExtension('anthropic.claude-code')` — no filesystem globbing. Re-applies on `vscode.extensions.onDidChange` (fires when Claude Code updates into a fresh folder) and on startup, gated by `claudeCodeRtl.autoApply`.
- **Scripts:** glob `anthropic.claude-code-*` under `~/.vscode/extensions`, `~/.vscode-insiders`, `~/.cursor`, `~/.windsurf`, picking the most recently modified install that actually has a webview.

### Staying patched after a Claude Code update

A Claude Code update installs a fresh (unpatched) folder. Re-application is automatic: the extension reacts to `onDidChange`; the scripts install a per-platform watcher (**systemd `--user` timer** on Linux, **launchd LaunchAgent** on macOS, **Scheduled Task** on Windows) that re-runs the patcher when the recorded extension path changes or the sentinel is gone. Either way the change only takes effect after a **webview reload** (`Developer: Reload Window`).

## How the payload behaves (when editing `payloads/`)

- **AUTO mode** decides each block's direction from its **first strong character** and **locks it once** (sets explicit `dir="rtl"/"ltr"`, tagged `data-ccr`). It deliberately does **not** use `dir="auto"`, which the browser re-evaluates live and causes left/right oscillation while a reply streams.
- **RTL/LTR forced modes** tag `<html data-claude-rtl-mode="rtl|ltr">`; the CSS drives direction from the root so it covers the whole webview. A direct `direction: ltr` rule on `pre`/`code`/`.monaco-editor` keeps code LTR regardless.
- **Class matching uses substring selectors** (`[class*="timelineMessage"]`, `[class*="userMessageContainer"]`, etc.) because Claude Code uses **per-build hashed class suffixes**. Never match exact hashed class names — they change every build and the patch must survive updates without code changes here.
- A MutationObserver coalesces streaming mutations into one `requestAnimationFrame` pass (decide-before-paint), and re-checks `characterData` so a block that streams in neutral-first gets decided the moment its first strong glyph arrives.
- The floating AUTO/RTL/LTR panel is built in JS, styled by the CSS (`#claude-rtl-panel`), draggable, and persists mode + position in the webview's `localStorage`. The extension's `claudeCodeRtl.defaultMode` setting is passed in as `window.__claudeCodeRtlDefaultMode` and used only when `localStorage` has no saved choice.

When changing payload behavior, after re-applying you must **reload the webview** to see it — reloading just the extension is not enough, since the change lives inside Claude Code's webview files.
