# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.2.1] — 2026-08-10

### Fixed
- **Forced RTL/LTR modes now actually apply to every block.** Claude Code
  (observed in 2.1.220) started setting `unicode-bidi: plaintext` on all
  markdown blocks and `dir="auto"` on user-message text, which resolve each
  block's direction from its own first strong character and ignore the
  root-driven forced direction — so under force-RTL a Hebrew paragraph that
  merely *started* with an English word rendered LTR. The CSS payload now
  re-asserts the forced direction on those blocks (`unicode-bidi: isolate`)
  while code blocks, Monaco and file paths stay LTR.
- **AUTO mode's direction lock works again.** The same `plaintext` rule
  overrode the `dir` attribute AUTO pins per block (author CSS beats the
  attribute's UA styles), silently bringing back the left/right streaming
  oscillation the lock was built to prevent. The locked direction is now also
  asserted at author level via `[data-ccr][dir]` rules.

### Added
- Strip literal bidi-escape text (the six ASCII characters `\u200F`, `\u200E`,
  `\u200B`) that the model sometimes emits into chat prose, where it renders as
  garbage and drags direction detection to LTR. Display-only — the transcript
  is untouched; code blocks, inline code and the composer are never altered.
  Controlled by the new `claudeCodeRtl.stripEscapedBidi` setting (default on;
  standalone script installs: always on).

## [0.2.0] — 2026-06-29

### Added
- Extension icon (`media/icon128.png`), shown in the Extensions view.
- README section pointing to the sibling RTL projects for other Claude surfaces:
  the *Claude.ai RTL Transformer* browser extension (Chrome Web Store / Edge
  Add-ons) and Claude Desktop for Windows (`shaloml/claude-desktop-windows-rtl`).

## [0.1.0] — 2026-06-29

Initial release. Distributed as a `.vsix` attached to the GitHub Release (not
published to any marketplace).

### Added
- Floating, draggable **AUTO / RTL / LTR** control panel pinned at the top of the
  Claude Code chat webview; mode and position persist in `localStorage`.
- **AUTO** mode: per-paragraph first-strong-character direction detection, locked
  once per block to avoid streaming flicker. Code and editors stay LTR.
- **RTL / LTR** forced modes: drive direction across the whole webview from the
  document root while keeping `pre`/`code`/Monaco LTR.
- VS Code extension that locates Claude Code via the official API, applies the
  patch on startup, re-applies after Claude Code updates, and offers a one-click
  window reload. Commands: Enable / Restore / Show status. Settings:
  `claudeCodeRtl.autoApply`, `claudeCodeRtl.defaultMode`.
- Standalone installers (`install/patch-claude-code-vscode.sh` and `.ps1`) for
  using the patch without the extension, including an auto-re-apply watcher.
- GitHub Actions release workflow: build the `.vsix` and attach it to a GitHub
  Release on each `vX.Y.Z` tag.
