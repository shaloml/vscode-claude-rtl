// Claude Code RTL — VS Code extension entry point.
//
// On startup (and when the installed extension set changes, e.g. Claude Code
// updates into a fresh folder) it (re)applies the RTL payloads to the Claude Code
// webview, then offers a one-click window reload. All file work is delegated to
// patcher.ts. The extension never touches anything except the Claude Code webview
// files and its own *.bak backups, and does no network / telemetry.

import * as path from 'path';
import * as vscode from 'vscode';
import { findClaudeCode, isPatched, apply, restore } from './patcher';

const STATE_LAST_EXT = 'claudeCodeRtl.lastPatchedExtPath';

interface Cfg {
	autoApply: boolean;
	defaultMode: string;
	stripEscapedBidi: boolean;
}

function getConfig(): Cfg {
	const c = vscode.workspace.getConfiguration('claudeCodeRtl');
	return {
		autoApply: c.get<boolean>('autoApply', true),
		defaultMode: c.get<string>('defaultMode', 'auto'),
		stripEscapedBidi: c.get<boolean>('stripEscapedBidi', true),
	};
}

export function activate(context: vscode.ExtensionContext): void {
	const payloadsDir = path.join(context.extensionPath, 'payloads');

	context.subscriptions.push(
		vscode.commands.registerCommand('claudeCodeRtl.enable', () =>
			runApply(context, payloadsDir, true)
		),
		vscode.commands.registerCommand('claudeCodeRtl.restore', () =>
			runRestore(context)
		),
		vscode.commands.registerCommand('claudeCodeRtl.status', () => showStatus()),
		// Re-check when extensions change (Claude Code install/update wipes the patch).
		vscode.extensions.onDidChange(() => {
			if (getConfig().autoApply) {
				void runApply(context, payloadsDir, false);
			}
		})
	);

	if (getConfig().autoApply) {
		void runApply(context, payloadsDir, false);
	}
}

export function deactivate(): void {
	/* nothing to clean up — the patch persists by design */
}

async function runApply(
	context: vscode.ExtensionContext,
	payloadsDir: string,
	interactive: boolean
): Promise<void> {
	const target = findClaudeCode();
	if (!target) {
		if (interactive) {
			vscode.window.showWarningMessage(
				'Claude Code RTL: the Claude Code extension was not found. Install it, then run "Claude Code RTL: Enable".'
			);
		}
		return;
	}

	const alreadyPatched = isPatched(target.jsPath) && isPatched(target.cssPath);
	const lastExt = context.globalState.get<string>(STATE_LAST_EXT);
	// On a silent (startup / onDidChange) pass, do nothing if nothing changed.
	if (!interactive && alreadyPatched && lastExt === target.extPath) {
		return;
	}

	try {
		const cfg = getConfig();
		apply(target, payloadsDir, cfg.defaultMode, cfg.stripEscapedBidi);
		await context.globalState.update(STATE_LAST_EXT, target.extPath);
	} catch (e) {
		vscode.window.showErrorMessage(`Claude Code RTL: ${errMsg(e)}`);
		return;
	}

	await promptReload(
		`Claude Code RTL applied to Claude Code ${target.version}. Reload the window for it to take effect.`
	);
}

async function runRestore(context: vscode.ExtensionContext): Promise<void> {
	const target = findClaudeCode();
	if (!target) {
		vscode.window.showWarningMessage('Claude Code RTL: Claude Code extension not found.');
		return;
	}
	try {
		restore(target);
		await context.globalState.update(STATE_LAST_EXT, undefined);
	} catch (e) {
		vscode.window.showErrorMessage(`Claude Code RTL: ${errMsg(e)}`);
		return;
	}
	await promptReload('Claude Code RTL: restored the original Claude Code files. Reload the window.');
}

function showStatus(): void {
	const target = findClaudeCode();
	if (!target) {
		vscode.window.showInformationMessage('Claude Code RTL: Claude Code extension not found.');
		return;
	}
	const patched = isPatched(target.jsPath) && isPatched(target.cssPath);
	vscode.window.showInformationMessage(
		`Claude Code RTL: Claude Code ${target.version} — ${patched ? 'PATCHED' : 'not patched'}.`
	);
}

async function promptReload(message: string): Promise<void> {
	const reload = 'Reload Window';
	const pick = await vscode.window.showInformationMessage(message, reload);
	if (pick === reload) {
		void vscode.commands.executeCommand('workbench.action.reloadWindow');
	}
}

function errMsg(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}
