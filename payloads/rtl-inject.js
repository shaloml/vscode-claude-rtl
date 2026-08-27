// Claude Code RTL — webview direction payload.
//
// This file is injected (verbatim, between sentinel comments) into the Claude
// Code VS Code extension's webview bundle:
//   <claude-code-ext>/webview/index.js
// either by this project's VS Code extension (src/patcher.ts) or by the
// standalone installers (install/patch-claude-code-vscode.{sh,ps1}). The webview
// links that file with the page's CSP nonce, so this code inherits the nonce for
// free — no host-side edit needed.
//
// Three modes, chosen from a small floating, draggable panel pinned at the top of
// the webview (AUTO / RTL / LTR), persisted in localStorage:
//
//   AUTO (default) — decide each text block's direction from its first strong
//     character and pin it explicitly (dir="rtl" / dir="ltr"). We do NOT use
//     dir="auto": that is re-evaluated live by the browser, so while a response
//     streams the first strong char keeps changing and the paragraph oscillates
//     left/right (eye-searing flicker). Instead we compute the direction once and
//     LOCK it — once a block is decided it never flips again — so a Hebrew
//     paragraph settles RTL on its first Hebrew glyph and stays there. English
//     and code stay LTR. No hashed class names needed, so it survives updates.
//   RTL / LTR — force one direction across the WHOLE webview (chat, composer,
//     tool rows, diffs) by tagging the document root; the CSS payload drives the
//     direction from there. Code blocks and Monaco editors still stay LTR. This
//     is the escape hatch for the cases AUTO gets wrong — e.g. a mostly-Hebrew
//     paragraph that happens to start with an English word or inline code, which
//     AUTO would otherwise lock to LTR.
//
// The initial mode is the persisted localStorage value if present, otherwise the
// install-time default `window.__claudeCodeRtlDefaultMode` (set by the extension's
// claudeCodeRtl.defaultMode setting; standalone installs omit it), otherwise AUTO.
(function () {
	'use strict';

	if (window.__claudeCodeRtlInit) return;
	window.__claudeCodeRtlInit = true;

	// Block elements whose direction follows their own first strong character.
	var BLOCK_SEL = 'p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,dd,dt,summary,figcaption';
	// The user-message bubble is plain pre-wrap text (no inner <p>), so we pin dir
	// on its container too — it is single-direction user text, safe to flip whole.
	var USERMSG_SEL = '[class*="userMessageContainer"]';
	// Assistant turns: we deliberately DON'T set dir here (that would flip the
	// turn's tool rows, code headers and buttons). We only tag the turn so the CSS
	// can mirror its physical left gutter + timeline rail to the right. Substring
	// class match survives the extension's per-build hashed class suffixes.
	var GUTTER_SEL = '[class*="timelineMessage"]';
	// Never touch code or editors — they must stay LTR regardless of first glyph.
	// Our own control panel is skipped too so AUTO never stamps it.
	var SKIP_SEL = 'pre,code,textarea,input,[class*="codeBlock"],[class*="CodeBlock"],.monaco-editor,#claude-rtl-panel';

	// The model sometimes emits a bidi mark as LITERAL escape text — the six
	// ASCII characters backslash-u-2-0-0-F (or 200E / 200B) — which renders as
	// garbage and, starting with Latin "u", drags a Hebrew block's first-strong
	// detection to LTR. Strip that literal text (never real invisible marks —
	// those are invisible and sometimes intentional) from rendered prose only.
	// Display-only: the underlying transcript is untouched. Disabled when the
	// extension's claudeCodeRtl.stripEscapedBidi setting is off (the patcher
	// then sets window.__claudeCodeRtlStripEscapes = false).
	var RE_ESC = /\\u200[BbEeFf]/g;
	// On top of SKIP_SEL, never rewrite the composer / any editable surface —
	// the user may be typing an escape sequence deliberately.
	var STRIP_SKIP_SEL = SKIP_SEL + ',[class*="messageInput"],[contenteditable="true"]';

	function stripEscapes(root) {
		if (window.__claudeCodeRtlStripEscapes === false) return;
		try {
			if (root.closest && root.closest(STRIP_SKIP_SEL)) return;
			var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
			var node;
			while ((node = walker.nextNode())) {
				var t = node.data;
				if (t.indexOf('\\u200') === -1) continue; // cheap prefilter
				var host = node.parentElement;
				if (host && host.closest && host.closest(STRIP_SKIP_SEL)) continue;
				var s = t.replace(RE_ESC, '');
				// Write only on an actual change: our own write re-fires the
				// observer, and an unconditional write would loop forever.
				if (s !== t) node.data = s;
			}
		} catch (e) { /* cosmetic only — never block the UI */ }
	}

	// Strong RTL scripts: Hebrew, Arabic, Syriac, Thaana, NKo, Samaritan, Mandaic,
	// Arabic Extended-A/B and the Arabic presentation forms. Everything between
	// U+0591 and U+08FF is right-to-left script territory, so the range is the
	// whole of it rather than a list that has to be extended per script.
	//
	// Written in \u escapes, and it has to stay that way. Spelled with literal
	// characters, this class was NFC-normalised somewhere on its way between
	// repositories: U+FB1D (HEBREW LETTER YOD WITH HIRIQ) decomposed into
	// U+05D9 U+05B4, so the intended \uFB1D-\uFDFD range began at U+05B4 and
	// swallowed most of the Basic Multilingual Plane - General Punctuation,
	// dingbats, arrows, CJK, Hangul. Every paragraph opening with a curly
	// quote, an em dash, a bullet or a check-mark was locked RTL for good.
	var RE_RTL = /[\u0591-\u08FF\u200F\uFB1D-\uFDFD\uFE70-\uFEFC]/;
	// Strong LTR is "any letter that is not one of those scripts", which is what
	// the Unicode bidi algorithm means by class L - not "a Basic-Latin letter",
	// which is what this used to say. Cyrillic, Greek and an accented first
	// letter were strong in neither class, so the paragraph stayed undecided and
	// the first Hebrew glyph to stream in later locked it right-aligned
	// (LOW-U2 of the 2026-08-27 re-review, measured: dir went null -> rtl).
	//
	// \p{L} deliberately overlaps RE_RTL - a Hebrew letter is a letter too - so
	// firstStrongDir() breaks a tie at the same index in favour of RTL. Keeping
	// the two classes disjoint would mean subtracting one from the other, which
	// a plain character class cannot do without the v flag.
	// U+200E is escaped because a literal LRM in a source file is invisible to
	// every reader of it.
	var RE_LTR = /[\p{L}\u200E]/u;

	// ---- Mode + persistence --------------------------------------------------
	// 'auto' | 'rtl' | 'ltr'. AUTO = per-block detection; rtl/ltr = forced.
	var PANEL_ID = 'claude-rtl-panel';
	var LS_MODE = 'claudeCodeRtlMode';
	var LS_LEFT = 'claudeCodeRtlPanelLeft';
	var LS_TOP = 'claudeCodeRtlPanelTop';

	function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
	function lsSet(k, v) { try { window.localStorage.setItem(k, String(v)); } catch (e) { /* ignore */ } }

	var mode = (function () {
		var m = lsGet(LS_MODE);
		if (m === 'rtl' || m === 'ltr' || m === 'auto') return m;
		// Fallback to an install-time default (extension setting); may be undefined.
		var d = window.__claudeCodeRtlDefaultMode;
		return (d === 'rtl' || d === 'ltr') ? d : 'auto';
	})();

	// Mirror the active mode onto <html> — the CSS payload keys its force rules
	// (and the force-RTL gutter mirroring) off this attribute. Set it as early as
	// possible so a forced direction applies before the first paint.
	function applyRootMode() {
		try { document.documentElement.setAttribute('data-claude-rtl-mode', mode); } catch (e) { /* ignore */ }
	}
	applyRootMode();

	// 'rtl' | 'ltr' | null (no strong char yet — stay undecided and re-check later).
	function firstStrongDir(text) {
		var r = text.search(RE_RTL);
		var l = text.search(RE_LTR);
		if (r === -1 && l === -1) return null;
		if (r === -1) return 'ltr';
		if (l === -1) return 'rtl';
		// Same index means one character matched both classes, which only an
		// RTL letter can do: RE_LTR is every letter, RE_RTL is the RTL scripts.
		return r <= l ? 'rtl' : 'ltr';
	}

	// Decide + lock a single block element. Once locked we never revisit it, which
	// is what kills the streaming oscillation. No-op outside AUTO mode — there the
	// document root drives direction, so per-element dir must not be set. Every dir
	// we set is tagged data-ccr so clearOurMarks() can undo it on a mode switch.
	function decide(el) {
		if (mode !== 'auto') return;
		if (el.__rtlLocked) return;
		if (el.closest && el.closest(SKIP_SEL)) { el.__rtlLocked = true; return; }
		var dir = firstStrongDir(el.textContent || '');
		if (!dir) return; // still neutral; leave undecided for a later tick
		if (!el.getAttribute('dir')) { el.setAttribute('dir', dir); el.setAttribute('data-ccr', ''); }
		el.__rtlLocked = true;
	}

	// Tag (do NOT set dir on) an assistant turn whose prose reads RTL, so the CSS
	// flips its left gutter + timeline rail to the right. A plain data-attribute
	// marker, so RTL never cascades onto the turn's tool rows / code / buttons.
	// Locked once decided, like decide(). AUTO-mode only (force-RTL mirrors every
	// turn via a root-attribute CSS rule instead).
	function markGutter(el) {
		if (mode !== 'auto') return;
		if (el.__gutterLocked) return;
		var dir = firstStrongDir(el.textContent || '');
		if (!dir) return; // still neutral; re-check on a later tick
		if (dir === 'rtl') el.setAttribute('data-claude-rtl-gutter', '1');
		el.__gutterLocked = true;
	}

	// Decide `root` and every block/container descendant it contains. Escape
	// stripping runs FIRST so first-strong detection sees the cleaned text.
	function decideWithin(root) {
		if (!root || root.nodeType !== 1) return;
		stripEscapes(root);
		if (root.matches) {
			if (root.matches(GUTTER_SEL)) markGutter(root);
			if (root.matches(USERMSG_SEL) || root.matches(BLOCK_SEL)) decide(root);
		}
		if (root.querySelectorAll) {
			var turns = root.querySelectorAll(GUTTER_SEL);
			for (var i = 0; i < turns.length; i++) markGutter(turns[i]);
			var blocks = root.querySelectorAll(USERMSG_SEL + ',' + BLOCK_SEL);
			for (var j = 0; j < blocks.length; j++) decide(blocks[j]);
		}
	}

	// The composer is a contenteditable; dir="auto" is fine there — a single field
	// the user types into doesn't suffer the streaming-oscillation problem. AUTO
	// only; in a forced mode the composer inherits the root direction instead.
	function stampInput() {
		if (mode !== 'auto') return;
		var inputs = document.querySelectorAll('[class*="messageInput"]');
		for (var i = 0; i < inputs.length; i++) {
			if (!inputs[i].getAttribute('dir')) { inputs[i].setAttribute('dir', 'auto'); inputs[i].setAttribute('data-ccr', ''); }
		}
	}

	function sweep() {
		try { decideWithin(document.body); stampInput(); }
		catch (e) { /* never block the UI on an injection failure */ }
	}

	// Undo every per-element direction AUTO set, so a switch to a forced mode lets
	// the document root + CSS alone control direction (a leftover element dir would
	// otherwise win over the inherited root direction).
	function clearOurMarks() {
		try {
			var marked = document.querySelectorAll('[data-ccr]');
			for (var i = 0; i < marked.length; i++) {
				marked[i].removeAttribute('dir');
				marked[i].removeAttribute('data-ccr');
				marked[i].__rtlLocked = false;
			}
			var g = document.querySelectorAll('[data-claude-rtl-gutter]');
			for (var j = 0; j < g.length; j++) {
				g[j].removeAttribute('data-claude-rtl-gutter');
				g[j].__gutterLocked = false;
			}
		} catch (e) { /* ignore */ }
	}

	function setMode(m) {
		mode = m;
		lsSet(LS_MODE, m);
		applyRootMode();
		if (m === 'auto') sweep();        // re-decide every block from scratch
		else clearOurMarks();             // let the root + CSS drive direction
		updatePanelButtons();
	}

	// ---- Floating control panel ----------------------------------------------
	var btnAuto = null, btnRtl = null, btnLtr = null;

	function setActive(btn, on) {
		if (!btn) return;
		if (on) btn.setAttribute('data-active', '1');
		else btn.removeAttribute('data-active');
	}
	function updatePanelButtons() {
		try {
			setActive(btnAuto, mode === 'auto');
			setActive(btnRtl, mode === 'rtl');
			setActive(btnLtr, mode === 'ltr');
		} catch (e) { /* ignore */ }
	}

	function makeBtn(m, label, title) {
		var b = document.createElement('button');
		b.type = 'button';
		b.className = 'ccr-btn';
		b.textContent = label;
		b.title = title;
		b.setAttribute('data-mode', m);
		b.addEventListener('click', function (ev) {
			ev.preventDefault();
			ev.stopPropagation();
			setMode(m);
		});
		return b;
	}

	// Make `panel` draggable by `grip`; clamp to the viewport and persist the
	// resting position. Pointer capture keeps the move stream on the grip even when
	// the cursor leaves it.
	function enableDrag(panel, grip) {
		var dragging = false, startX = 0, startY = 0, baseLeft = 0, baseTop = 0;
		grip.addEventListener('pointerdown', function (ev) {
			dragging = true;
			var rect = panel.getBoundingClientRect();
			baseLeft = rect.left;
			baseTop = rect.top;
			startX = ev.clientX;
			startY = ev.clientY;
			// Pin to explicit left/top so the drag is absolute (drop the centering transform).
			panel.style.left = baseLeft + 'px';
			panel.style.top = baseTop + 'px';
			panel.style.right = 'auto';
			panel.style.transform = 'none';
			try { grip.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
			ev.preventDefault();
		});
		grip.addEventListener('pointermove', function (ev) {
			if (!dragging) return;
			var nx = baseLeft + (ev.clientX - startX);
			var ny = baseTop + (ev.clientY - startY);
			nx = Math.max(0, Math.min(nx, window.innerWidth - panel.offsetWidth));
			ny = Math.max(0, Math.min(ny, window.innerHeight - panel.offsetHeight));
			panel.style.left = nx + 'px';
			panel.style.top = ny + 'px';
		});
		function endDrag() {
			if (!dragging) return;
			dragging = false;
			lsSet(LS_LEFT, parseInt(panel.style.left, 10) || 0);
			lsSet(LS_TOP, parseInt(panel.style.top, 10) || 0);
		}
		grip.addEventListener('pointerup', endDrag);
		grip.addEventListener('pointercancel', endDrag);
	}

	function buildPanel() {
		try {
			if (!document.body) return;
			if (document.getElementById(PANEL_ID)) return;

			var panel = document.createElement('div');
			panel.id = PANEL_ID;
			panel.setAttribute('dir', 'ltr'); // never let a forced mode flip the panel

			var grip = document.createElement('span');
			grip.className = 'ccr-grip';
			grip.textContent = '⠿'; // braille dots — a compact drag handle
			grip.title = 'Drag';
			panel.appendChild(grip);

			btnAuto = makeBtn('auto', 'AUTO', 'Automatic direction per paragraph');
			btnRtl = makeBtn('rtl', 'RTL', 'Force right-to-left everywhere');
			btnLtr = makeBtn('ltr', 'LTR', 'Force left-to-right everywhere');
			panel.appendChild(btnAuto);
			panel.appendChild(btnRtl);
			panel.appendChild(btnLtr);

			// Restore a saved position; otherwise the CSS pins it top-centre.
			var left = lsGet(LS_LEFT), top = lsGet(LS_TOP);
			if (left !== null && top !== null) {
				panel.style.left = left + 'px';
				panel.style.top = top + 'px';
				panel.style.right = 'auto';
				panel.style.transform = 'none';
			}

			document.body.appendChild(panel);
			enableDrag(panel, grip);
			updatePanelButtons();
		} catch (e) { /* never block the UI on a panel failure */ }
	}

	function start() {
		applyRootMode();
		sweep();
		buildPanel();

		// Coalesce a burst of streaming mutations into one pass per frame, run in the
		// render step (before paint) so a freshly-created paragraph is decided in the
		// same frame it appeared — no wrong-direction frame. We also re-check on
		// characterData changes so a block that streamed in neutral-first (e.g. a
		// bullet or number) gets decided the moment its first strong glyph arrives.
		var scheduled = false;
		// One entry per element per frame. A streaming reply fires a characterData
		// mutation per token on the same text node, and an array kept every one of
		// them: 1,000 mutations cost 1,000 stripEscapes tree walks and 2,001
		// querySelectorAll calls in a single frame (LOW-P7 of the 2026-08-27
		// re-review; measured here at 401 calls for 200 mutations).
		var pending = new Set();
		// stampInput() is a document-wide query, and the composer can only appear
		// or lose its dir through an inserted element - so a frame that saw none
		// has nothing for it to find.
		var inserted = false;
		function flush() {
			scheduled = false;
			var batch = pending;
			pending = new Set();
			var hadInsert = inserted;
			inserted = false;
			try {
				batch.forEach(function (el) {
					decideWithin(el);
					// A turn often streams in neutral-first (a spinner or tool row
					// before any Hebrew). Re-check its enclosing turn so the gutter
					// locks the moment the first strong glyph arrives.
					var turn = el.closest && el.closest(GUTTER_SEL);
					if (turn) markGutter(turn);
				});
				if (hadInsert) stampInput();
				// Re-create the panel if the app re-rendered <body> out from under it.
				if (!document.getElementById(PANEL_ID)) buildPanel();
			} catch (e) { /* ignore */ }
		}
		var schedule = window.requestAnimationFrame
			? function () { window.requestAnimationFrame(flush); }
			: function () { setTimeout(flush, 0); };
		var observer = new MutationObserver(function (mutations) {
			for (var i = 0; i < mutations.length; i++) {
				var m = mutations[i];
				if (m.type === 'characterData') {
					var host = m.target.parentElement;
					if (host) pending.add(host);
					continue;
				}
				var added = m.addedNodes;
				for (var k = 0; k < added.length; k++) {
					if (added[k].nodeType === 1) { pending.add(added[k]); inserted = true; }
				}
			}
			if (!pending.size) return;
			if (!scheduled) { scheduled = true; schedule(); }
		});
		observer.observe(document.body, { childList: true, subtree: true, characterData: true });
	}

	if (document.body) start();
	else document.addEventListener('DOMContentLoaded', start);
})();
