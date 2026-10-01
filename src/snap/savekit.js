/* ------------------------------------------------------------------
   SaveKit — the save UI around Save (save.js), as small DOM overlays
   so it stays crisp and works with copy / paste / file pickers:
   · a "Saving… / Saved ✓" chip with a spinning disk in the top-right
     corner (tap it to open the save menu)
   · a first-launch notice (autosave is on; tip: export a backup)
   · "Your progress can't be saved automatically" when storage is
     blocked or full (itch.io iframes on Safari/iOS, private mode):
     open in its own tab / fullscreen, or Export Save
   · the save menu: Export (copy a code / download .json) and Import
     (paste a code / pick a file). Also opened by the "Save & backup"
     button on the Rotom Dex settings page and the K key.
------------------------------------------------------------------- */
const SaveKit = (() => {
  const K = { root: null, chip: null, modal: null, shown: {}, hideT: 0, dexBtn: null };
  const CSS = `
#sk-chip{position:fixed;top:max(6px,env(safe-area-inset-top));left:50%;margin-left:-40px;z-index:40;display:flex;align-items:center;gap:5px;padding:3px 8px 3px 5px;border-radius:10px;background:rgba(10,14,32,.72);color:#e8f4ff;font:600 11px/1.1 ui-monospace,Menlo,Consolas,monospace;opacity:0;transform:translateY(-4px);transition:opacity .35s,transform .35s;pointer-events:none;cursor:pointer;user-select:none;-webkit-user-select:none}
#sk-chip.on{opacity:1;transform:none;pointer-events:auto}
#sk-chip.bad{background:rgba(160,30,40,.86)}
#sk-chip svg{width:13px;height:13px;flex:none}
#sk-chip.spin svg{animation:sk-spin .8s linear infinite}
@keyframes sk-spin{to{transform:rotate(360deg)}}
#sk-dex{position:fixed;z-index:39;padding:4px 10px;border-radius:7px;border:2px solid #1b2240;background:#3a78e8;color:#fff;font:700 12px/1.2 ui-monospace,Menlo,Consolas,monospace;cursor:pointer;display:none;box-shadow:0 2px 0 #1b2240}
#sk-modal{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;background:rgba(6,9,22,.62);padding:12px;box-sizing:border-box}
#sk-modal .sk-box{width:min(460px,100%);max-height:100%;overflow:auto;box-sizing:border-box;background:#f4f6fb;color:#1b2240;border:3px solid #1b2240;border-radius:12px;box-shadow:0 4px 0 #0a0e1a;padding:12px 14px;font:14px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif}
#sk-modal h2{margin:0 0 6px;font:800 17px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;display:flex;align-items:center;gap:8px}
#sk-modal h2 svg{width:20px;height:20px;flex:none}
#sk-modal p{margin:4px 0}
#sk-modal ul{margin:4px 0 4px 18px;padding:0}
#sk-modal .sk-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}
#sk-modal button{font:700 13px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;padding:7px 11px;border-radius:8px;border:2px solid #1b2240;background:#fff;color:#1b2240;cursor:pointer;box-shadow:0 2px 0 #1b2240}
#sk-modal button.pri{background:#3a78e8;color:#fff}
#sk-modal button.ok{background:#2a9a5a;color:#fff}
#sk-modal button:active{transform:translateY(1px);box-shadow:0 1px 0 #1b2240}
#sk-modal textarea{width:100%;box-sizing:border-box;height:62px;margin-top:6px;font:11px/1.3 ui-monospace,Menlo,Consolas,monospace;border:2px solid #1b2240;border-radius:6px;padding:5px;resize:vertical;word-break:break-all}
#sk-modal .sk-msg{min-height:1.2em;margin-top:6px;font-weight:700}
#sk-modal .sk-msg.err{color:#c03030}#sk-modal .sk-msg.good{color:#2a8a4a}
#sk-modal .sk-dim{color:#5a6080;font-size:12px}
#sk-modal .sk-sec{border-top:2px dashed #c8cee0;margin-top:10px;padding-top:8px}
@media (max-height:430px){#sk-modal .sk-box{padding:9px 12px;font-size:13px}#sk-modal h2{font-size:15px}#sk-modal textarea{height:44px}}
`;
  const DISK = '<svg viewBox="0 0 16 16"><rect x="1" y="1" width="14" height="14" rx="2" fill="#3a78e8" stroke="#0a0e20"/><rect x="4" y="1.5" width="8" height="5" fill="#e8f4ff"/><rect x="9" y="2.3" width="2" height="3.4" fill="#1b2240"/><rect x="3.5" y="9" width="9" height="5.5" rx="1" fill="#ffffff"/></svg>';
  const WARN = '<svg viewBox="0 0 16 16"><path d="M8 1 L15.5 14.5 H.5 Z" fill="#ffd23a" stroke="#1b2240"/><rect x="7.2" y="5" width="1.6" height="5" fill="#1b2240"/><rect x="7.2" y="11.3" width="1.6" height="1.6" fill="#1b2240"/></svg>';
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, attrs, html) => { const e = document.createElement(tag); if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]); if (html != null) e.innerHTML = html; return e; };
  const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 5 ? 'just now' : s < 60 ? s + ' s ago' : Math.round(s / 60) + ' min ago'; };

  function init() {
    if (K.root) return;
    try {
      const st = el('style', null, CSS); document.head.appendChild(st);
      K.chip = el('div', { id: 'sk-chip', role: 'status', 'aria-live': 'polite', title: 'Save menu' });
      K.chip.addEventListener('click', (e) => { e.stopPropagation(); openMenu(); });
      K.chip.addEventListener('pointerdown', (e) => e.stopPropagation());
      document.body.appendChild(K.chip);
      K.dexBtn = el('button', { id: 'sk-dex', type: 'button' }, '\u{1F4BE} Save & backup');
      K.dexBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
      K.dexBtn.addEventListener('click', (e) => { e.stopPropagation(); openMenu(); });
      document.body.appendChild(K.dexBtn);
      K.root = true;
    } catch (e) { console.error(e); return; }
    U.on('saving', () => chip('saving'));
    U.on('save', (s, was) => { chip(s.ok ? 'saved' : 'bad'); if (!s.ok && was !== false && Game.started) blocked(); });
    window.addEventListener('keydown', (e) => {
      if (K.modal) { e.stopPropagation(); if (e.key === 'Escape' && !K.modal.sticky) close(); return; }
      if ((e.key === 'k' || e.key === 'K') && Game.started && Game.mode === 'explore' && !(typeof Talk !== 'undefined' && Talk.busy && Talk.busy())) { e.stopPropagation(); openMenu(); }
    }, true);
    window.addEventListener('keyup', (e) => { if (K.modal) e.stopPropagation(); }, true);
    setInterval(tick, 400);
  }
  // the corner chip: spinning disk while saving, "Saved ✓" for a moment after
  function chip(state) {
    const c = K.chip; if (!c) return;
    clearTimeout(K.hideT);
    if (state === 'saving') { c.className = 'on spin'; c.innerHTML = DISK + '<span>Saving…</span>'; return; }
    if (state === 'bad') { c.className = 'on bad'; c.innerHTML = WARN + '<span>Not saved · tap</span>'; return; }
    c.className = 'on'; c.innerHTML = DISK + '<span>Saved ✓</span>';
    K.hideT = setTimeout(() => { if (Save.status.ok) c.className = ''; }, 1800);
  }
  function tick() {
    if (!Game.started) return;
    // first launch / blocked storage, once the game is running (and nothing else is on screen)
    const calm = Game.mode === 'explore' && !(typeof Talk !== 'undefined' && Talk.dlg) && !(typeof Cards !== 'undefined' && Cards.live);
    if (!K.modal && calm && !K.shown.check && Game.rt > 1.5) {
      K.shown.check = 1;
      if (!Save.status.ok) blocked();
      else if (!Save.data.meta.notice && (!navigator.webdriver || /[?&]savenotice/.test(location.search))) notice(); // (automated test runs skip the notice)
    }
    // the Rotom Dex settings page gets a "Save & backup" button
    const onSet = Game.mode === 'dex' && typeof Dex !== 'undefined' && Dex.page === 'settings' && !K.modal;
    if (K.dexBtn) {
      K.dexBtn.style.display = onSet ? 'block' : 'none';
      if (onSet) { const cv = $('#ui'), r = cv ? cv.getBoundingClientRect() : { left: 0, bottom: innerHeight, width: innerWidth }; K.dexBtn.style.left = Math.round(r.left + r.width / 2 - 60) + 'px'; K.dexBtn.style.top = 'auto'; K.dexBtn.style.bottom = Math.max(6, Math.round(innerHeight - r.bottom + r.height * 0.14)) + 'px'; }
    }
    if (!Save.status.ok && K.chip && !/bad/.test(K.chip.className)) chip('bad');
  }

  /* ---------- modals ---------- */
  function modal(html, o = {}) {
    close(true);
    const m = el('div', { id: 'sk-modal', role: 'dialog', 'aria-modal': 'true' }, '<div class="sk-box">' + html + '</div>');
    m.sticky = !!o.sticky;
    for (const ev of ['pointerdown', 'pointerup', 'mousedown', 'touchstart', 'touchend', 'wheel', 'click']) m.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    m.addEventListener('click', (e) => { if (e.target === m && !m.sticky) close(); });
    document.body.appendChild(m); K.modal = m;
    try { if (Game.mudkip) { Game.mudkip.stop && Game.mudkip.stop(); Game.mudkip.keyDir = 0; } if (Game.keysDown) Game.keysDown.clear(); if (typeof Pad !== 'undefined' && Pad.setKeys) Pad.setKeys({ dx: 0, dy: 0, run: false, jump: false }); } catch (e) { /* ignore */ }
    const b = $('button', m); if (b) try { b.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    return m;
  }
  function close(quiet) {
    if (!K.modal) return;
    K.modal.remove(); K.modal = null;
    if (!quiet) { const g = $('#game'); if (g) try { g.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }
  const on = (m, sel, fn) => { const b = $(sel, m); if (b) b.addEventListener('click', (e) => { e.stopPropagation(); fn(e); }); };
  function notice() {
    const m = modal(`<h2>${DISK}Your journal saves itself</h2>
<p>Autosave is <b>on</b>: photos, Pokédex, quests and levels are saved on this device as you play (look for <b>Saved ✓</b> in the corner).</p>
<p class="sk-dim">Tip: browsers can clear site data. Use <b>Export Save</b> now and then to keep a backup (tap the save chip, press K, or Rotom Dex → Settings).</p>
<div class="sk-row"><button class="ok" id="sk-ok">Got it!</button><button id="sk-exp">Export Save</button></div>`);
    const done = () => { Save.data.meta.notice = 1; Save.save(); };
    on(m, '#sk-ok', () => { done(); close(); });
    on(m, '#sk-exp', () => { done(); openMenu(); });
  }
  function blocked() {
    if (K.shown.blocked && K.modal) return;
    K.shown.blocked = 1;
    const s = Save.status;
    const m = modal(`<h2>${WARN}Your progress can't be saved automatically</h2>
<p>${s.why || 'This browser does not let the game store data here.'}${s.iframe ? ' This often happens when the game runs inside a web page (like itch.io) on Safari / iPhone, or in a private window.' : ''}</p>
<p><b>To keep your progress:</b></p>
<ul><li>Open the game <b>in its own tab</b> or <b>fullscreen</b>, or allow site data / leave private mode, then reload.</li>
<li>Or use <b>Export Save</b> before you leave, and <b>Import Save</b> next time.</li></ul>
<div class="sk-row"><button class="pri" id="sk-tab">Open in own tab</button><button id="sk-fs">Fullscreen</button><button id="sk-exp">Export Save</button><button id="sk-retry">Try again</button><button id="sk-go">Play anyway</button></div>
<div class="sk-msg" id="sk-m"></div>`, { sticky: true });
    const msg = (t, c) => { const e = $('#sk-m', m); if (e) { e.textContent = t; e.className = 'sk-msg ' + (c || ''); } };
    on(m, '#sk-tab', () => {
      Save.flush();
      let w = null; try { w = window.open(location.href, '_blank', 'noopener'); } catch (e) { /* blocked */ }
      if (!w) msg('Your browser blocked the new tab. On itch.io use the fullscreen button under the game, or open the page in Safari/Chrome directly.', 'err');
    });
    on(m, '#sk-fs', () => { const d = document.documentElement, f = d.requestFullscreen || d.webkitRequestFullscreen; if (f) { try { const p = f.call(d); if (p && p.catch) p.catch(() => msg('Fullscreen was blocked here. Try the fullscreen button under the game on itch.io.', 'err')); close(); } catch (e) { msg('Fullscreen is not available here.', 'err'); } } else msg('Fullscreen is not available here: use Export Save.', 'err'); });
    on(m, '#sk-exp', () => openMenu());
    on(m, '#sk-retry', () => { if (Save.probe() && Save.flush(true)) { chip('saved'); msg('Saving works now!', 'good'); setTimeout(close, 900); } else msg('Still blocked. Use Export Save to keep a backup.', 'err'); });
    on(m, '#sk-go', () => close());
  }
  function openMenu() {
    if (!Save.status.ok) Save.probe();
    Save.flush();
    const s = Save.status, code = Save.exportCode();
    const st = s.ok ? 'Autosave is on · last saved ' + (s.savedAt ? ago(s.savedAt) : 'not yet') : '⚠ Autosave is not working here: ' + (s.why || 'storage blocked') + ' Export your save to keep it.';
    const m = modal(`<h2>${DISK}Save &amp; backup</h2>
<p class="sk-dim" style="${s.ok ? '' : 'color:#c03030;font-weight:700'}">${st}</p>
<div class="sk-sec"><b>Export Save</b> <span class="sk-dim">(a backup code, or a file with your photos)</span>
<textarea id="sk-code" readonly aria-label="Save code">${code}</textarea>
<div class="sk-row"><button class="pri" id="sk-copy">Copy code</button><button id="sk-dl">Download .json</button>${s.ok ? '<button id="sk-now">Save now</button>' : ''}</div></div>
<div class="sk-sec"><b>Import Save</b> <span class="sk-dim">(replaces this journal)</span>
<textarea id="sk-in" placeholder="Paste a save code here (MKSNAP...)" aria-label="Paste save code"></textarea>
<div class="sk-row"><button class="ok" id="sk-load">Load code</button><button id="sk-file">Pick a file…</button><button id="sk-close">Close</button></div>
<input type="file" id="sk-pick" accept=".json,.txt,application/json,text/plain" hidden></div>
<div class="sk-msg" id="sk-m"></div>`);
    const msg = (t, c) => { const e = $('#sk-m', m); if (e) { e.textContent = t; e.className = 'sk-msg ' + (c || ''); } };
    on(m, '#sk-copy', async () => {
      const ta = $('#sk-code', m); let ok = false;
      try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(code); ok = true; } } catch (e) { /* fall back */ }
      if (!ok) try { ta.focus(); ta.select(); ok = document.execCommand('copy'); } catch (e) { /* ignore */ }
      if (ok) msg('Copied! Keep it somewhere safe (a note or a message to yourself).', 'good'); else { ta.focus(); ta.select(); msg('Select the code above and copy it.', ''); }
    });
    on(m, '#sk-dl', () => {
      try {
        const blob = new Blob([Save.exportFile()], { type: 'application/json' }), a = document.createElement('a'), d = new Date();
        a.href = URL.createObjectURL(blob); a.download = 'mudkip-snap-save-' + d.toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        msg('Downloading your save file… (if nothing happens, use Copy code)', 'good');
      } catch (e) { msg('Download is blocked here: use Copy code instead.', 'err'); }
    });
    on(m, '#sk-now', () => { if (Save.flush(true)) msg('Saved ✓', 'good'); else msg('Could not save: ' + Save.status.why, 'err'); });
    const load = (txt) => {
      let d; try { d = Save.decode(txt); } catch (e) { msg(e.message, 'err'); return; }
      const n = Object.keys(d.seen || {}).length, lv = d.lv ? 'with ' + (d.lv.xp || 0) + ' XP' : '';
      if (!confirmLoad(m, 'Load this save (' + n + ' Pokémon seen ' + lv + ')? It replaces the current journal.')) return;
      try { Save.importText(txt); } catch (e) { msg(e.message, 'err'); return; }
      msg(Save.status.ok ? 'Save loaded! Restarting…' : 'Save loaded for this session (storage is blocked: export again before leaving). Restarting…', 'good');
      if (!Save.status.ok) { try { sessionStorage.setItem('mudkip-snap-import', txt); } catch (e) { /* ignore */ } K.pending = txt; }
      setTimeout(() => { if (Save.status.ok) location.reload(); else { close(); applyLive(); } }, 900);
    };
    on(m, '#sk-load', () => load($('#sk-in', m).value));
    on(m, '#sk-file', () => $('#sk-pick', m).click());
    const pick = $('#sk-pick', m);
    pick.addEventListener('change', () => { const f = pick.files && pick.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => load(String(r.result || '')); r.onerror = () => msg('Could not read that file.', 'err'); r.readAsText(f); });
    on(m, '#sk-close', () => close());
  }
  // a second tap confirms (window.confirm is blocked in some sandboxed iframes)
  function confirmLoad(m, text) {
    if (m.armed && Date.now() - m.armed < 6000) return true;
    m.armed = Date.now();
    const e = $('#sk-m', m); if (e) { e.textContent = text + ' Tap again to confirm.'; e.className = 'sk-msg'; }
    return false;
  }
  // storage blocked: the imported journal goes live without a reload
  function applyLive() {
    try { if (typeof Progress !== 'undefined') { Progress.bar = null; } if (Game.enterArea) Game.enterArea(Save.data.lastArea && Save.unlocked(Save.data.lastArea) ? Save.data.lastArea : 'beach'); HUD.toast('Save imported!', { life: 2 }); } catch (e) { console.error(e); }
  }
  return { init, openMenu, notice, blocked, close, chip, get open() { return !!K.modal; } };
})();
SaveKit.init();
