# Claude Code RTL (Hebrew / Arabic)

Right-to-left support for the **Claude Code** chat sidebar in VS Code (and
compatible editors), with a small **floating, draggable control panel** to switch
between **AUTO / RTL / LTR**.

Hebrew and Arabic conversations render properly: prose flips to the correct
direction per paragraph, the message gutter and timeline rail mirror to the right,
and **code blocks / editors always stay left-to-right**.

> **Heads-up — read [What it does to your machine](#-what-it-does-to-your-machine-transparency) before installing.**
> To work around a hard VS Code limitation, this tool **modifies files inside the
> installed Claude Code extension**. It backs them up first and can fully restore
> them, does **no networking and collects no data**, but it is **not affiliated
> with or endorsed by Anthropic or Microsoft**, and it edits another extension's
> files — which is unsupported. Use at your own discretion.

---

## Other Claude surfaces (browser & desktop)

This extension adds RTL to the **Claude Code chat sidebar in VS Code**. If you use
Claude elsewhere too, sibling projects cover those surfaces:

- **Claude.ai in the browser (Chrome / Edge)** — the *Claude.ai RTL Transformer*
  browser extension brings the same Hebrew/Arabic support to claude.ai:
  - [Chrome Web Store](https://chromewebstore.google.com/detail/claude-ai-rtl-transformer/pcnpnpaipomdildpaehlnmlbiiaagdid)
  - [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/claude-ai-rtl-transformer/mcbkppnfkonepcpndghjbdlhipmmhipn)
- **Claude Desktop (Windows)** — RTL for the standalone Claude Desktop app:
  [shaloml/claude-desktop-windows-rtl](https://github.com/shaloml/claude-desktop-windows-rtl)

---

## Modes

A compact panel is pinned at the top of the chat (drag it anywhere; it remembers
its place):

| Mode | Behaviour |
|------|-----------|
| **AUTO** (default) | Each paragraph's direction is detected from its first strong character and **locked** (so it never flickers mid-stream). English and code stay LTR. |
| **RTL** | Forces right-to-left across the **whole** chat webview (messages, composer, tool rows, diffs). Code blocks / Monaco stay LTR. |
| **LTR** | Forces left-to-right everywhere. |

AUTO is great most of the time, but it can guess wrong — e.g. a mostly-Hebrew
paragraph that *starts* with an English word or inline code locks to LTR. The
**RTL** button is the one-click fix for exactly those cases.

Your chosen mode and the panel position are remembered in the webview's
`localStorage`.

---

## Why a patch is needed

The Claude Code chat is a **sandboxed webview** (an isolated `iframe` with its own
CSP) owned by the Claude Code extension. **VS Code has no API that lets one
extension inject CSS/JS into another extension's webview**, and the popular
"Custom CSS/JS" tricks (which patch VS Code's own `workbench.html`) don't reach
into the sandboxed iframe either.

So the only way to add RTL to that chat is to **append a small CSS/JS payload to
the Claude Code extension's webview files on disk**. That's what this project
does — either automatically via the extension, or manually via the scripts.

---

## 🔒 What it does to your machine (transparency)

In plain terms, so you can decide with full information:

**What it changes**
- It appends two payloads to **two files inside the installed Claude Code
  extension**:
  - `<claude-code-extension>/webview/index.js`
  - `<claude-code-extension>/webview/index.css`
- The payloads are wrapped between sentinel comments
  (`/* >>> claude-code-rtl (auto) >>> */ … <<< */`) so they are easy to find and
  remove. The exact code lives in [`payloads/`](payloads) in this repo — nothing
  is hidden or minified.

**What the injected code does**
- It only sets **text direction**: it reads each text block, decides `rtl`/`ltr`,
  and sets `dir`/CSS accordingly, and draws the floating panel.
- It **does not read, store, or transmit your conversations**, prompts, files, or
  any other content. It performs **no network requests** and contains **no
  telemetry or analytics**. Everything runs locally in the webview.

**Safety / reversibility**
- Before the first change, the originals are copied to `index.js.bak` /
  `index.css.bak`. Re-applying always restores from those backups first, so it's
  idempotent.
- You can fully revert at any time (see [Uninstall / restore](#uninstall--restore)).
- There is **no code-signing or integrity hash** on this webview, so no binaries
  are re-signed and nothing about VS Code itself is modified.

**Caveats**
- Editing another extension's files is **unsupported** by Anthropic and Microsoft.
- A Claude Code **update** installs a fresh copy and removes the patch — the
  extension re-applies automatically; the scripts ship an auto-re-apply watcher.
- If Claude Code changes its webview structure, RTL may need an update here.

---

## Install

### Option A — the VS Code extension (recommended)

This extension is **not published to any marketplace** — it's distributed as a
`.vsix` you install yourself. (An extension that edits another publisher's files
can conflict with Marketplace policy, so it is intentionally release-only.)

1. Download the latest `vscode-claude-rtl-X.Y.Z.vsix` from
   [**Releases**](https://github.com/shaloml/vscode-claude-rtl/releases).
2. Install it — either:
   - VS Code Command Palette → **Extensions: Install from VSIX…** → pick the file, or
   - terminal: `code --install-extension vscode-claude-rtl-X.Y.Z.vsix`
     (Cursor: `cursor --install-extension …`, etc.).

On startup the extension finds Claude Code, applies the patch, and offers a
one-click **Reload Window**. It also **re-applies automatically after Claude Code
updates** — see [Staying patched](#staying-patched-after-a-claude-code-update).

### Option B — standalone scripts (no extension)

If you'd rather not install an extension, clone this repo and run the patcher
directly. Same payloads, same result.

**Linux / macOS:**
```bash
./install/patch-claude-code-vscode.sh            # apply
./install/patch-claude-code-vscode.sh --restore  # revert
```

**Windows (PowerShell, no admin needed):**
```powershell
powershell -ExecutionPolicy Bypass -File .\install\patch-claude-code-vscode.ps1
powershell -ExecutionPolicy Bypass -File .\install\patch-claude-code-vscode.ps1 -Action Restore
```

Both back up the originals, re-apply cleanly, and install a lightweight
auto-re-apply watcher (systemd `--user` timer on Linux, launchd LaunchAgent on
macOS, a Scheduled Task on Windows). Pass `--no-auto-update` / `-NoAutoUpdate` to
skip the watcher. After any (re)patch, reload the webview:
**Developer: Reload Window**.

---

## Commands & settings (extension)

**Commands** (Command Palette):
- `Claude Code RTL: Enable / Re-apply`
- `Claude Code RTL: Restore original (un-patch)`
- `Claude Code RTL: Show status`

**Settings:**
- `claudeCodeRtl.autoApply` (default `true`) — (re)apply automatically on startup
  and after Claude Code updates.
- `claudeCodeRtl.defaultMode` (`auto` | `rtl` | `ltr`, default `auto`) — the
  initial panel mode until you change it in the panel.

---

## Staying patched (after a Claude Code update)

Because the patch lives **inside** the Claude Code extension, every time Claude
Code updates it installs a fresh copy and the patch is gone. This happens fairly
often, so re-applying is expected — but you normally don't have to do it by hand:

- **Extension:** with `claudeCodeRtl.autoApply` on (the default), it detects the
  new Claude Code version — on the next VS Code start, and immediately when the
  update lands mid-session — re-applies the patch, and shows a **Reload Window**
  prompt. Just click it. (If you turned auto-apply off, run the **Claude Code RTL:
  Enable** command.)
- **Standalone scripts:** the installed watcher (systemd `--user` timer on Linux /
  launchd on macOS / Scheduled Task on Windows) re-applies automatically; or just
  re-run the patcher. If you installed with `--no-auto-update` / `-NoAutoUpdate`,
  there is no watcher — re-run the patcher yourself after each Claude Code update.

Either way, the change only takes effect once the webview reloads
(**Developer: Reload Window**).

## Uninstall / restore

- **Extension:** run `Claude Code RTL: Restore original (un-patch)`, then uninstall
  the extension. (Uninstalling alone leaves the Claude Code files patched until the
  next Claude Code update or a Restore.)
- **Scripts:** run the patcher with `--restore` / `-Action Restore`.
- **Manual:** restore `index.js.bak` / `index.css.bak` over `index.js` /
  `index.css` in the Claude Code `webview` folder, or delete the block between the
  `claude-code-rtl` sentinel comments.

Then **Developer: Reload Window**.

---

## How it works (technical)

- The extension locates Claude Code via the official API
  (`vscode.extensions.getExtension('anthropic.claude-code')`) — no filesystem
  globbing — and patches its `webview/index.{js,css}`.
- AUTO uses a **first-strong-character** decision that is **locked once** per
  block, which is what prevents the left/right oscillation you'd get from
  `dir="auto"` while a reply streams in.
- Forced RTL/LTR tag `<html data-claude-rtl-mode="…">`; the CSS drives direction
  from the root so it covers the whole webview, while a direct `direction: ltr`
  rule on `pre`/`code`/`.monaco-editor` keeps code LTR.
- See [`src/patcher.ts`](src/patcher.ts) and [`payloads/`](payloads).

---

## Build from source

```bash
npm install
npm run compile          # tsc -> dist/
npm run package          # vsce package -> vscode-claude-rtl-X.Y.Z.vsix
```

Press **F5** in VS Code to launch an Extension Development Host.

## Versioning & releases

Semantic versioning. Distribution is **GitHub Releases only** (no marketplace).
Tagging `vX.Y.Z` triggers CI
([`.github/workflows/release.yml`](.github/workflows/release.yml)) which builds the
`.vsix` and creates a GitHub Release with it attached. Keep `CHANGELOG.md` and
`package.json` `version` in sync with the tag.

## Related projects — Hebrew RTL for Claude everywhere

The same Hebrew/Arabic RTL treatment is available on every Claude surface:

- **Claude Code in VS Code** — *this repo*.
- **Claude Desktop** (Windows / macOS / Linux) —
  [`claude-desktop-windows-rtl`](https://github.com/shaloml/claude-desktop-windows-rtl).
- **Browser (Chrome / Edge)** — *Claude.ai RTL Transformer*, for claude.ai in the browser:
  - Source: [`shaloml/rtl-chatgpt`](https://github.com/shaloml/rtl-chatgpt)
  - [Chrome Web Store](https://chromewebstore.google.com/detail/claude-ai-rtl-transformer/pcnpnpaipomdildpaehlnmlbiiaagdid)
  - [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/claude-ai-rtl-transformer/mcbkppnfkonepcpndghjbdlhipmmhipn)

## License

[MIT](LICENSE) © Shalom Levi. Not affiliated with Anthropic or Microsoft.
"Claude" and "Claude Code" are trademarks of their respective owners.
