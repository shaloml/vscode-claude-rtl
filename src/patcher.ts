// Core patch logic: locate the installed Claude Code extension and inject /
// restore the RTL payloads in its webview bundle. Kept free of UI so it can be
// unit-reasoned and reused; extension.ts wires it to commands + notifications.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/** Publisher.name of the official Claude Code extension. */
export const CLAUDE_CODE_ID = 'anthropic.claude-code';

const SENTINEL_BEGIN = '/* >>> claude-code-rtl (auto) >>> */';
const SENTINEL_END = '/* <<< claude-code-rtl (auto) <<< */';

export interface Target {
	extPath: string;
	version: string;
	jsPath: string;
	cssPath: string;
}

/**
 * Find the installed Claude Code extension via the official API (no filesystem
 * globbing) and the two webview files we patch. Returns undefined if Claude Code
 * isn't installed or its layout is unexpected.
 */
export function findClaudeCode(): Target | undefined {
	const ext = vscode.extensions.getExtension(CLAUDE_CODE_ID);
	if (!ext) {
		return undefined;
	}
	const extPath = ext.extensionPath;
	const jsPath = path.join(extPath, 'webview', 'index.js');
	const cssPath = path.join(extPath, 'webview', 'index.css');
	if (!fs.existsSync(jsPath) || !fs.existsSync(cssPath)) {
		return undefined;
	}
	const version: string = (ext.packageJSON && ext.packageJSON.version) || '';
	return { extPath, version, jsPath, cssPath };
}

/** True if `file` already carries our injection. */
export function isPatched(file: string): boolean {
	try {
		return fs.readFileSync(file, 'utf8').includes(SENTINEL_BEGIN);
	} catch {
		return false;
	}
}

function backupOnce(file: string): void {
	const bak = file + '.bak';
	if (!fs.existsSync(bak)) {
		fs.copyFileSync(file, bak);
	}
}

function restoreFromBakOrStrip(file: string): void {
	const bak = file + '.bak';
	if (fs.existsSync(bak)) {
		fs.copyFileSync(bak, file);
		return;
	}
	// No .bak (shouldn't normally happen): strip our sentinel block in place.
	const txt = fs.readFileSync(file, 'utf8');
	const start = txt.indexOf(SENTINEL_BEGIN);
	const end = txt.indexOf(SENTINEL_END);
	if (start !== -1 && end !== -1 && end > start) {
		fs.writeFileSync(file, txt.slice(0, start) + txt.slice(end + SENTINEL_END.length));
	}
}

/**
 * Apply the RTL payloads to `target`. Idempotent: backs up the pristine files to
 * *.bak on first run and restores from them before every re-inject, so calling
 * this repeatedly always patches a clean original.
 */
export function apply(
	target: Target,
	payloadsDir: string,
	defaultMode: string,
	stripEscapedBidi = true
): void {
	const { cssPath: css, jsPath: js } = target;

	// Safety: an injection present but no .bak means we'd bake the patch into the
	// backup — refuse rather than lose the pristine original.
	for (const f of [css, js]) {
		if (!fs.existsSync(f + '.bak') && isPatched(f)) {
			throw new Error(
				`${path.basename(f)} already contains an injection but has no .bak. ` +
				`Reinstall the Claude Code extension, then re-apply.`
			);
		}
	}

	backupOnce(css);
	backupOnce(js);
	fs.copyFileSync(css + '.bak', css);
	fs.copyFileSync(js + '.bak', js);

	const cssPayload = fs.readFileSync(path.join(payloadsDir, 'rtl-inject.css'), 'utf8');
	const jsPayload = fs.readFileSync(path.join(payloadsDir, 'rtl-inject.js'), 'utf8');

	fs.appendFileSync(css, `\n${SENTINEL_BEGIN}\n${cssPayload}\n${SENTINEL_END}\n`);

	// An install-time default mode (the extension's claudeCodeRtl.defaultMode
	// setting); the payload reads it only when localStorage has no saved choice.
	let pre = '';
	if (defaultMode === 'rtl' || defaultMode === 'ltr') {
		pre = `try{window.__claudeCodeRtlDefaultMode=${JSON.stringify(defaultMode)};}catch(e){}\n`;
	}
	// Escape stripping is on by default in the payload; only an explicit opt-out
	// (claudeCodeRtl.stripEscapedBidi = false) needs to be passed in.
	if (!stripEscapedBidi) {
		pre += `try{window.__claudeCodeRtlStripEscapes=false;}catch(e){}\n`;
	}
	// Lead with a bare ';' so we never glue onto a trailing call expression in the
	// minified bundle; the payload runs under the page's existing CSP nonce.
	fs.appendFileSync(js, `\n;\n${SENTINEL_BEGIN}\n${pre}${jsPayload}\n${SENTINEL_END}\n`);
}

/** Revert both webview files to their pristine originals. */
export function restore(target: Target): void {
	restoreFromBakOrStrip(target.cssPath);
	restoreFromBakOrStrip(target.jsPath);
}
