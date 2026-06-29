# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses
[Semantic Versioning](https://semver.org/).

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
