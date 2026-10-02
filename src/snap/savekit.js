/* ------------------------------------------------------------------
   SaveKit — the save UI around Save (save.js), drawn in-canvas with
   the game's own pixel kit (UI.body / UI.panel / UI.screen + Font), in
   the same style as the quest log:
   · a tiny pixel floppy-disk chip at the top (shutter slides while
     saving, a check pops in when saved, a warning badge when not);
     tap it to open the save menu
   · a first-launch notice (autosave is on; tip: export a backup)
   · "Can't save automatically" when storage is blocked or full
     (itch.io iframes on Safari/iOS, private mode): open in its own
     tab / fullscreen, or Export Save
   · the save menu: Export (copy a code / download .json) and Import
     (paste a code / pick a file). Also opened from the Rotom Dex
     settings page ("Save & backup") and the K key.
   The only DOM left: two invisible <textarea>s laid exactly over the
   drawn code boxes (so paste / long-press copy work) and a hidden
   <input type=file>.
------------------------------------------------------------------- */
const SaveKit = (() => {
  const H_ = (c) => U.hex(c), INK = H_('#1b2240'), WHITE = 0xffffffff, CREAM = H_('#fbfaf4'), DIM = H_('#6a7090'), BLUE = H_('#3a78e8'), RED = H_('#d83040'), GREEN = H_('#2a9a5a'), GOLD = H_('#ffe070');
  const K = { root: false, ch: { st: null, t: 0, vis: 0, hideAt: 0 }, m: null, shown: {}, fb: null, rects: [], hover: null, press: null, ta: {}, pick: null, rt: 0 };
  const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 5 ? 'just now' : s < 60 ? s + ' s ago' : Math.round(s / 60) + ' min ago'; };
  const sfx = (n, v) => { try { Game.sfx && Game.sfx(n, null, v ?? 0.5); } catch (e) { /* ignore */ } };

  /* ---------- the floppy disk (drawn here so it can animate) ---------- */
  const DISK = ['kkkkkkkkk.', 'kbsssdsbkk', 'kbsssdsbbk', 'kbsssssbbk', 'kbbbbbbbbk', 'kbwwwwwwbk', 'kbwllllwbk', 'kbwwwwwwbk', 'kbwllllwbk', 'kkkkkkkkkk'];
  const DC = { k: INK, b: BLUE, s: H_('#d8e0ee'), d: INK, w: H_('#f4f7fb'), l: H_('#9ab4e8') };
  function disk(fb, x, y, slide = 0) {
    UI.pix(fb, DISK, x, y, DC);
    if (slide) { // the shutter (and its slot) slide across while writing
      UI.rect(fb, x + 2, y + 1, 5, 3, DC.s);
      UI.vline(fb, x + 2 + ((slide | 0) % 5), y + 1, y + 2, INK);
    }
  }

  /* ---------- the chip ---------- */
  function chip(state) {
    const c = K.ch;
    if (state !== c.st) c.t = 0;
    c.st = state;
    c.hideAt = state === 'saved' ? K.rt + 1.6 : state === 'saving' ? K.rt + 6 : Infinity;
  }
  function chipRect(fb) { return { x: Math.round(fb.w / 2) - 9, y: 3, w: 18, h: 16 }; }
  function drawChip(fb, dt) {
    const c = K.ch;
    if (c.st && K.rt > c.hideAt && Save.status.ok) c.st = null;
    if (!Save.status.ok && c.st !== 'bad') chip('bad');
    c.vis += ((c.st ? 1 : 0) - c.vis) * Math.min(1, dt * 10);
    if (c.vis < 0.05 || !Game.started) return null;
    c.t += dt;
    const r = chipRect(fb), y = r.y - Math.round((1 - c.vis) * 18), bad = c.st === 'bad';
    const on = K.hover === 'chip';
    UI.rrect(fb, r.x, y + 2, r.w, r.h, 4, 0x8a0a0e1a);
    UI.panel(fb, r.x, y, r.w, r.h, { r: 4, ol: INK, fill: bad ? H_('#a82838') : on ? H_('#3a4660') : H_('#26303e'), hi: null, sh: null });
    const bob = c.st === 'saving' ? (Math.sin(c.t * 9) > 0 ? -1 : 0) : c.st === 'saved' && c.t < 0.25 ? -1 : 0;
    disk(fb, r.x + 4, y + 3 + bob, c.st === 'saving' ? c.t * 10 : 0);
    if (c.st === 'saved' && c.t > 0.08) Font.icon(fb, 'check', r.x + 10, y + 9, 1);
    if (bad) Font.icon(fb, 'warn', r.x + 10, y + 8, 1);
    return r;
  }

  /* ---------- widgets ---------- */
  function button(fb, id, lab, x, y, w, o = {}) {
    const S = UI.skin(), h = o.h || 14, on = K.hover === id, dn = K.press === id;
    const fill = o.col !== undefined ? o.col : S.btn;
    UI.panel(fb, x, y + (dn ? 1 : 0), w, h, { r: 3, ol: on ? GOLD : S.ink, fill: on ? U.tweak(fill, 0, 1, 0.1) : fill });
    Font.draw(fb, lab, x + w / 2, y + Math.round((h - 8) / 2) + (dn ? 1 : 0), WHITE, { font: 'small', align: 'center' });
    K.rects.push({ id, x, y, w, h, fn: o.fn });
    return x + w + 4;
  }
  // a row of buttons, sized to their labels, wrapping onto more rows if they do not fit
  function buttons(fb, list, x, y, w) {
    const ws = list.map((b) => Font.measure(b[1], 'small') + 14);
    let xx = x, yy = y;
    list.forEach((b, i) => { if (xx + ws[i] > x + w && xx > x) { xx = x; yy += 17; } xx = button(fb, b[0], b[1], xx, yy, ws[i], b[2]); });
    return yy + 17;
  }
  // a cream code box; the invisible textarea `ta` sits exactly on top of it
  function field(fb, x, y, w, h, txt, ph, ta) {
    const S = UI.skin(), on = ta && document.activeElement === K.ta[ta];
    UI.screen(fb, x, y, w, h, { fill: on ? WHITE : CREAM, rim: on ? BLUE : S.ink, glare: false });
    let s = txt ? String(txt).replace(/\s+/g, '') : '';
    const cl = { x0: x + 2, y0: y + 1, x1: x + w - 2, y1: y + h - 1 };
    if (s) {
      const n = s.length; let t = s;
      while (t.length > 4 && Font.measure(t + '... (' + n + ')', 'small') > w - 8) t = t.slice(0, -4);
      Font.draw(fb, t.length < n ? t + '... [#6a7090](' + n + ')[]' : t, x + 4, y + Math.round((h - 8) / 2), INK, { font: 'small', clip: cl });
    } else Font.draw(fb, ph, x + 4, y + Math.round((h - 8) / 2), H_('#9aa0b8'), { font: 'small', clip: cl });
    if (on && ((K.rt * 2) | 0) % 2) UI.vline(fb, Math.min(x + w - 4, x + 5 + (s ? Math.min(Font.measure(s, 'small'), w - 10) : 0)), y + 3, y + h - 4, BLUE);
    if (ta) K.rects.push({ id: 'ta-' + ta, x, y, w, h, ta });
  }
  function frame(fb, W, H, title, ic) {
    const S = UI.skin(), x = Math.round((fb.w - W) / 2), y = Math.round((fb.h - H) / 2);
    UI.rectA(fb, 0, 0, fb.w, fb.h, H_('#0a0e20'), 0.5);
    UI.rrect(fb, x, y + 3, W, H, 8, H_('#0a0e1a'));
    UI.body(fb, x, y, W, H, S, { r: 8 });
    if (ic === 'disk') disk(fb, x + 10, y + 7); else Font.icon(fb, 'warn', x + 8, y + 6, 2);
    Font.draw(fb, title, x + 24, y + 7, WHITE, { font: 'title', outline: INK });
    if (!K.m.sticky) {
      UI.panel(fb, x + W - 22, y + 5, 16, 14, { r: 3, ol: K.hover === 'x' ? GOLD : S.ink, fill: S.btn }); Font.icon(fb, 'cross', x + W - 17, y + 9, 1);
      K.rects.push({ id: 'x', x: x + W - 24, y: y + 3, w: 20, h: 18, fn: () => close() });
    }
    return { x, y, W, H, S };
  }
  function msgLine(fb, x, y, w) {
    const m = K.m; if (!m.msg) return y;
    const ls = Font.wrap(m.msg, 'small', w).slice(0, 2);
    ls.forEach((l, i) => Font.draw(fb, l, x, y + i * 9, m.msgC === 'err' ? RED : m.msgC === 'good' ? GREEN : INK, { font: 'small' }));
    return y + ls.length * 9;
  }
  const textH = (s, w) => Font.wrap(s, 'small', w).length * 9;
  function para(fb, s, x, y, w, c = INK) { Font.draw(fb, s, x, y, c, { font: 'small', maxW: w, lh: 9 }); return y + textH(s, w) + 3; }

  /* ---------- screens ---------- */
  function drawNotice(fb) {
    const W = Math.min(fb.w - 12, 330), iw = W - 28;
    const A = 'Autosave is [#2a9a5a]on[]: photos, Pokédex, quests and levels are saved on this device as you play. Watch for the disk at the top of the screen.';
    const B = 'Tip: browsers can clear site data. Export a backup now and then (tap the disk, press K, or Rotom Dex > Settings).';
    const H = 30 + 10 + textH(A, iw) + 3 + textH(B, iw) + 6 + 14 + 12 + (K.m.msg ? 18 : 0);
    const F = frame(fb, W, Math.min(fb.h - 8, H), 'YOUR JOURNAL SAVES ITSELF', 'disk');
    const sx = F.x + 8, sy = F.y + 26, sw = W - 16, sh = F.H - 34;
    UI.screen(fb, sx, sy, sw, sh, { fill: CREAM, rim: F.S.ink, glare: false });
    let y = para(fb, A, sx + 6, sy + 5, iw);
    y = para(fb, B, sx + 6, y, iw, DIM);
    y = buttons(fb, [['ok', 'Got it!', { col: GREEN, fn: () => { seen(); close(); } }], ['exp', 'Export Save', { col: F.S.accent, fn: () => { seen(); openMenu(); } }]], sx + 6, y + 3, iw);
    msgLine(fb, sx + 6, y, iw);
  }
  function seen() { Save.data.meta.notice = 1; Save.save(); }
  function drawBlocked(fb) {
    const s = Save.status, W = Math.min(fb.w - 12, 400), iw = W - 28;
    const A = (s.why || 'This browser does not let the game store data here.') + (s.iframe ? ' This often happens when the game runs inside a web page (like itch.io) on Safari / iPhone, or in a private window.' : '');
    const B = '[#3a78e8]To keep your progress:[] open the game in its own tab or fullscreen (or allow site data / leave private mode), then reload. Or use Export Save before you leave, and Import Save next time.';
    const bl = [['tab', 'Open in own tab', { col: BLUE, fn: ownTab }], ['fs', 'Fullscreen', { fn: fullscreen }], ['exp', 'Export Save', { col: UI.skin().accent, fn: () => openMenu() }], ['retry', 'Try again', { fn: retry }], ['go', 'Play anyway', { col: GREEN, fn: () => close() }]];
    const bw = bl.reduce((a, b) => a + Font.measure(b[1], 'small') + 18, 0), rows = bw > iw ? 2 : 1;
    const H = 30 + 10 + textH(A, iw) + 3 + textH(B, iw) + 6 + rows * 17 + 6 + (K.m.msg ? 18 : 0);
    const F = frame(fb, W, Math.min(fb.h - 8, H), "CAN'T SAVE AUTOMATICALLY", 'warn');
    const sx = F.x + 8, sy = F.y + 26, sw = W - 16, sh = F.H - 34;
    UI.screen(fb, sx, sy, sw, sh, { fill: CREAM, rim: F.S.ink, glare: false });
    let y = para(fb, A, sx + 6, sy + 5, iw);
    y = para(fb, B, sx + 6, y, iw);
    y = buttons(fb, bl, sx + 6, y + 3, iw);
    msgLine(fb, sx + 6, y, iw);
  }
  function drawMenu(fb) {
    const s = Save.status, m = K.m, W = Math.min(fb.w - 10, 440), two = W >= 380;
    const st = s.ok ? '{check} Autosave is on  ·  last saved ' + (s.savedAt ? ago(s.savedAt) : 'not yet') : '{warn} Autosave is not working here: ' + (s.why || 'storage blocked') + ' Export your save to keep it.';
    const cw = two ? Math.floor((W - 22) / 2) : W - 16;
    const stH = textH(st, W - 28);
    const colH = 10 + 9 + 18 + 17 + 2;
    const H = 26 + stH + 8 + (two ? colH : colH * 2 + 6) + (m.msg ? 22 : 8) + 6;
    const F = frame(fb, W, Math.min(fb.h - 6, H), 'SAVE & BACKUP', 'disk');
    let y = F.y + 25;
    Font.draw(fb, st, F.x + 12, y, s.ok ? WHITE : GOLD, { font: 'small', maxW: W - 28, lh: 9, outline: INK });
    y += stH + 4;
    const col = (cx, cy, head, sub, fl, bl) => {
      UI.screen(fb, cx, cy, cw, colH + 4, { fill: CREAM, rim: F.S.ink, glare: false });
      Font.draw(fb, head, cx + 6, cy + 4, BLUE, { font: 'small' });
      Font.draw(fb, sub, cx + 14 + Font.measure(head, 'small'), cy + 4, DIM, { font: 'small' });
      fl(cx + 5, cy + 14, cw - 10);
      buttons(fb, bl, cx + 5, cy + 33, cw - 10);
    };
    const c1x = F.x + 8, c2x = two ? c1x + cw + 6 : c1x, c2y = two ? y : y + colH + 10;
    col(c1x, y, 'EXPORT SAVE', 'a backup code or file', (x, yy, w) => field(fb, x, yy, w, 16, m.code, '', 'out'), [
      ['copy', 'Copy', { col: BLUE, fn: copy }], ['dl', 'Download', { fn: download }], ...(s.ok ? [['now', 'Save now', { col: GREEN, fn: saveNow }]] : [])]);
    col(c2x, c2y, 'IMPORT SAVE', 'replaces this journal', (x, yy, w) => field(fb, x, yy, w, 16, m.inTxt, typeof Pad !== 'undefined' && Pad.touch ? 'Tap here, then paste a code' : 'Click here and paste (Ctrl+V)', 'in'), [
      ['paste', 'Paste', { fn: paste }], ['load', 'Load code', { col: GREEN, fn: () => load(m.inTxt) }], ['file', 'Pick file', { fn: () => K.pick && K.pick.click() }]]);
    const my = c2y + colH + 8;
    if (m.msg) { UI.rrect(fb, F.x + 8, my - 2, W - 16, 21, 3, CREAM); msgLine(fb, F.x + 13, my + 1, W - 26); }
  }

  /* ---------- actions ---------- */
  function msg(t, c) { if (K.m) { K.m.msg = t; K.m.msgC = c || ''; } }
  function ownTab() {
    Save.flush();
    let w = null; try { w = window.open(location.href, '_blank', 'noopener'); } catch (e) { /* blocked */ }
    if (!w) msg('Your browser blocked the new tab. On itch.io use the fullscreen button under the game, or open the page in Safari / Chrome directly.', 'err');
  }
  function fullscreen() {
    const d = document.documentElement, f = d.requestFullscreen || d.webkitRequestFullscreen;
    if (!f) { msg('Fullscreen is not available here: use Export Save.', 'err'); return; }
    try { const p = f.call(d); if (p && p.catch) p.catch(() => msg('Fullscreen was blocked here. Try the fullscreen button under the game on itch.io.', 'err')); close(); } catch (e) { msg('Fullscreen is not available here.', 'err'); }
  }
  function retry() { if (Save.probe() && Save.flush(true)) { chip('saved'); msg('Saving works now!', 'good'); setTimeout(close, 900); } else msg('Still blocked. Use Export Save to keep a backup.', 'err'); }
  function saveNow() { if (Save.flush(true)) { chip('saved'); msg('Saved! {check}', 'good'); } else msg('Could not save: ' + Save.status.why, 'err'); }
  async function copy() {
    const code = K.m.code, ta = K.ta.out; let ok = false;
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(code); ok = true; } } catch (e) { /* fall back */ }
    if (!ok && ta) try { ta.focus({ preventScroll: true }); ta.select(); ok = document.execCommand('copy'); } catch (e) { /* ignore */ }
    if (ok) msg('Copied! Keep it somewhere safe (a note, or a message to yourself).', 'good');
    else msg('Copying is blocked here: long-press the code box and copy, or use Download file.', '');
  }
  function download() {
    try {
      const blob = new Blob([Save.exportFile()], { type: 'application/json' }), a = document.createElement('a'), d = new Date();
      a.href = URL.createObjectURL(blob); a.download = 'mudkip-snap-save-' + d.toISOString().slice(0, 10) + '.json';
      a.style.display = 'none'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      msg('Downloading your save file... (if nothing happens, use Copy code)', 'good');
    } catch (e) { msg('Download is blocked here: use Copy code instead.', 'err'); }
  }
  async function paste() {
    let t = null;
    try { if (navigator.clipboard && navigator.clipboard.readText) t = await navigator.clipboard.readText(); } catch (e) { /* fall back */ }
    if (t) { setIn(t); msg('Pasted. Now tap Load code.', ''); return; }
    const ta = K.ta.in; if (ta) try { ta.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    msg(typeof Pad !== 'undefined' && Pad.touch ? 'Long-press the box and choose Paste.' : 'Press Ctrl+V (Cmd+V) to paste into the box.', '');
  }
  function setIn(t) { if (!K.m) return; K.m.inTxt = String(t || ''); if (K.ta.in) K.ta.in.value = K.m.inTxt; K.m.armed = 0; }
  function load(txt) {
    const m = K.m; if (!m) return;
    if (!txt || !String(txt).trim()) { msg('Paste a save code first (or pick a file).', 'err'); return; }
    let d; try { d = Save.decode(txt); } catch (e) { msg(e.message, 'err'); return; }
    if (!(m.armed && Date.now() - m.armed < 6000)) {
      const n = Object.keys(d.seen || {}).length;
      m.armed = Date.now(); msg('Load this save (' + n + ' Pokémon seen' + (d.lv ? ', ' + (d.lv.xp || 0) + ' XP' : '') + ')? It replaces the current journal. Tap again to confirm.', ''); return;
    }
    try { Save.importText(txt); } catch (e) { msg(e.message, 'err'); return; }
    msg(Save.status.ok ? 'Save loaded! Restarting...' : 'Save loaded for this session (storage is blocked: export again before leaving). Restarting...', 'good');
    if (!Save.status.ok) { try { sessionStorage.setItem('mudkip-snap-import', txt); } catch (e) { /* ignore */ } K.pending = txt; }
    setTimeout(() => { if (Save.status.ok) location.reload(); else { close(); applyLive(); } }, 900);
  }
  // storage blocked: the imported journal goes live without a reload
  function applyLive() {
    try { if (typeof Progress !== 'undefined') { Progress.bar = null; } if (Game.enterArea) Game.enterArea(Save.data.lastArea && Save.unlocked(Save.data.lastArea) ? Save.data.lastArea : 'beach'); HUD.toast('Save imported!', { life: 2 }); } catch (e) { console.error(e); }
  }

  /* ---------- open / close ---------- */
  function open(kind, o = {}) {
    K.m = { kind, sticky: !!o.sticky, msg: '', msgC: '', t: 0, code: o.code || '', inTxt: '', armed: 0 };
    K.hover = null; K.press = null;
    if (K.ta.in) K.ta.in.value = '';
    try { if (Game.mudkip) { Game.mudkip.stop && Game.mudkip.stop(); Game.mudkip.keyDir = 0; } if (Game.keysDown) Game.keysDown.clear(); if (typeof Pad !== 'undefined' && Pad.setKeys) Pad.setKeys({ dx: 0, dy: 0, run: false, jump: false }); } catch (e) { /* ignore */ }
    sfx('page');
  }
  function close(quiet) {
    if (!K.m) return;
    K.m = null; K.rects = [];
    for (const k in K.ta) { K.ta[k].style.display = 'none'; try { K.ta[k].blur(); } catch (e) { /* ignore */ } }
    if (!quiet) { sfx('back'); const g = document.getElementById('game'); if (g) try { g.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }
  function notice() { open('notice'); }
  function blocked() { if (K.shown.blocked && K.m) return; K.shown.blocked = 1; open('blocked', { sticky: true }); }
  function openMenu() {
    if (!Save.status.ok) Save.probe();
    Save.flush();
    open('menu', { code: Save.exportCode() });
    if (K.ta.out) K.ta.out.value = K.m.code;
  }

  /* ---------- draw (after the HUD, on top of everything) ---------- */
  let last = 0;
  function draw(fb, rt) {
    const now = performance.now() / 1000, dt = Math.min(0.1, last ? now - last : 0.016); last = now;
    K.rt += dt; K.fb = fb; K.rects = [];
    const cr = drawChip(fb, dt);
    if (cr && !K.m) K.rects.push(Object.assign({ id: 'chip', fn: () => openMenu() }, cr));
    if (!K.m) { placeTa(); return; }
    K.m.t += dt;
    if (K.m.kind === 'notice') drawNotice(fb); else if (K.m.kind === 'blocked') drawBlocked(fb); else drawMenu(fb);
    placeTa();
  }
  // lay the invisible textareas over their drawn boxes
  function placeTa() {
    const cv = document.getElementById('ui'); if (!cv || !K.fb) return;
    const r = cv.getBoundingClientRect(), sx = r.width / K.fb.w, sy = r.height / K.fb.h;
    for (const k in K.ta) {
      const ta = K.ta[k], b = K.rects.find((q) => q.ta === k);
      if (!b) { if (ta.style.display !== 'none') ta.style.display = 'none'; continue; }
      ta.style.display = 'block';
      ta.style.left = (r.left + b.x * sx) + 'px'; ta.style.top = (r.top + b.y * sy) + 'px';
      ta.style.width = (b.w * sx) + 'px'; ta.style.height = (b.h * sy) + 'px';
    }
  }

  /* ---------- input ---------- */
  function at(e) {
    const cv = document.getElementById('ui'); if (!cv || !K.fb) return null;
    const r = cv.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width * K.fb.w, (e.clientY - r.top) / r.height * K.fb.h];
  }
  function hitAt(p) { if (!p) return null; for (let i = K.rects.length - 1; i >= 0; i--) { const b = K.rects[i]; if (p[0] >= b.x && p[1] >= b.y && p[0] < b.x + b.w && p[1] < b.y + b.h) return b; } return null; }
  function press(id) { const b = K.rects.find((q) => q.id === id); if (b && b.fn) { sfx('select', 0.4); b.fn(); return true; } return false; }
  const onCanvas = (e) => e.target && (e.target.id === 'ui' || e.target.id === 'cv' || e.target.id === 'game');
  function init() {
    if (K.root) return;
    try {
      const mkTa = (id, ro) => {
        const t = document.createElement('textarea');
        t.id = id; t.spellcheck = false; t.setAttribute('autocomplete', 'off'); t.setAttribute('aria-label', ro ? 'Save code' : 'Paste save code'); if (ro) t.readOnly = true;
        t.style.cssText = 'position:fixed;z-index:6;display:none;opacity:0;margin:0;padding:0;border:0;resize:none;overflow:hidden;font-size:16px;color:transparent;background:transparent;caret-color:transparent;outline:none';
        for (const ev of ['pointerdown', 'pointerup', 'mousedown', 'touchstart', 'touchend', 'click', 'keydown', 'keyup']) t.addEventListener(ev, (e) => e.stopPropagation());
        document.body.appendChild(t); return t;
      };
      K.ta.out = mkTa('sk-out', true); K.ta.in = mkTa('sk-in', false);
      K.ta.in.addEventListener('input', () => { if (K.m) { K.m.inTxt = K.ta.in.value; K.m.armed = 0; } });
      K.ta.in.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); load(K.ta.in.value); } else if (e.key === 'Escape') { K.ta.in.blur(); } });
      K.ta.out.addEventListener('focus', () => { try { K.ta.out.select(); } catch (e) { /* ignore */ } });
      K.pick = document.createElement('input'); K.pick.type = 'file'; K.pick.accept = '.json,.txt,application/json,text/plain'; K.pick.hidden = true; K.pick.id = 'sk-pick';
      K.pick.addEventListener('change', () => { const f = K.pick.files && K.pick.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { setIn(String(r.result || '')); load(K.m && K.m.inTxt); }; r.onerror = () => msg('Could not read that file.', 'err'); r.readAsText(f); K.pick.value = ''; });
      document.body.appendChild(K.pick);
      K.root = true;
    } catch (e) { console.error(e); return; }
    // draw on top of the HUD every frame
    const d0 = HUD.draw; HUD.draw = function (fb, rt) { const r = d0.apply(this, arguments); try { draw(fb, rt); } catch (e) { console.error(e); } return r; };
    U.on('saving', () => chip('saving'));
    U.on('save', (s, was) => { chip(s.ok ? 'saved' : 'bad'); if (!s.ok && was !== false && Game.started) blocked(); });
    window.addEventListener('keydown', (e) => {
      if (K.m) {
        e.stopPropagation();
        if (e.key === 'Escape' && !K.m.sticky) { e.preventDefault(); close(); }
        else if (e.key === 'Enter') { e.preventDefault(); press(K.m.kind === 'notice' ? 'ok' : K.m.kind === 'blocked' ? 'go' : 'copy'); }
        return;
      }
      if ((e.key === 'k' || e.key === 'K') && Game.started && Game.mode === 'explore' && !(typeof Talk !== 'undefined' && Talk.busy && Talk.busy())) { e.stopPropagation(); openMenu(); }
    }, true);
    window.addEventListener('keyup', (e) => { if (K.m) e.stopPropagation(); }, true);
    // pointer: the modal (and the chip) come before everything else
    window.addEventListener('pointerdown', (e) => {
      if (!onCanvas(e)) return;
      const b = hitAt(at(e));
      if (!K.m && !b) return;
      e.stopPropagation(); e.preventDefault();
      if (document.activeElement && K.ta.in === document.activeElement && !(b && b.ta === 'in')) K.ta.in.blur();
      K.press = b ? b.id : null; K.downOn = b ? b.id : '__bg';
    }, true);
    window.addEventListener('pointerup', (e) => {
      if (!K.downOn) return;
      e.stopPropagation(); e.preventDefault();
      const b = hitAt(at(e)), was = K.downOn; K.downOn = null; K.press = null;
      if (!b && was === '__bg' && K.m && !K.m.sticky && K.m.kind !== 'blocked') { /* tapping outside keeps the menu: the X closes it */ }
      if (b && b.id === was && b.fn) { sfx('select', 0.4); b.fn(); }
    }, true);
    window.addEventListener('pointermove', (e) => {
      if (!K.m && !K.rects.length) return;
      const b = onCanvas(e) ? hitAt(at(e)) : null; K.hover = b && !b.ta ? b.id : null;
      if (K.m || K.downOn) e.stopPropagation();
    }, true);
    window.addEventListener('wheel', (e) => { if (K.m) e.stopPropagation(); }, true);
    setInterval(tick, 400);
  }
  function tick() {
    if (!Game.started) return;
    // first launch / blocked storage, once the game is running (and nothing else is on screen)
    const calm = Game.mode === 'explore' && !(typeof Talk !== 'undefined' && Talk.dlg) && !(typeof Cards !== 'undefined' && Cards.live);
    if (!K.m && calm && !K.shown.check && Game.rt > 1.5) {
      K.shown.check = 1;
      if (!Save.status.ok) blocked();
      else if (!Save.data.meta.notice && (!navigator.webdriver || /[?&]savenotice/.test(location.search))) notice(); // (automated test runs skip the notice)
    }
  }
  return { init, openMenu, notice, blocked, close, chip, press, get open() { return !!K.m; }, get kind() { return K.m ? K.m.kind : null; }, get msg() { return K.m ? K.m.msg : ''; }, get chipState() { return K.ch.st; } };
})();
SaveKit.init();
