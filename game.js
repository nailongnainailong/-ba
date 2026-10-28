/* ============================================================
   合成大 ba
   11 级：kei → alice → koharu → miyako → kazusa → reisa →
          natsu → kotori → kokona → midori → last
   - 合成到第 X 级：播放第 X 级的语音（X >= alice）
   - 只有第一级 kei 在“放下”时播放语音
   - 合成瞬间给新球一个较大的向上弹跳
   ============================================================ */
(function () {
  'use strict';

  if (typeof Matter === 'undefined') {
    if (window.__fatal) window.__fatal('物理引擎 matter.min.js 没有加载成功', 'Matter undefined');
    throw new Error('Matter.js not loaded');
  }

  const { Engine, Bodies, Composite, Events, Body } = Matter;

  /* ---------------- 场地 ---------------- */
  const W = 380, H = 560, SCALE = 2, WALL = 9;
  const DANGER_Y = 140;   // 死亡线抬高 = 可堆高度变少 = 一局变短
  const SPAWN_Y = 56;

  /* ---------------- 11 个等级（小 → 大） ---------------- */
  const TIERS = [
    { key: 'kei',    name: 'kei',    img: 'assets/kei.png',    r: 12, color: '#7ec8e3' },
    { key: 'alice',  name: 'alice',  img: 'assets/alice.jpg',  r: 15, color: '#f7a1c4' },
    { key: 'koharu', name: 'koharu', img: 'assets/koharu.jpg', r: 18, color: '#ffc46b' },
    { key: 'miyako', name: 'miyako', img: 'assets/miyako.jpg', r: 22, color: '#b39ddb' },
    { key: 'kazusa', name: 'kazusa', img: 'assets/kazusa.jpg', r: 26, color: '#7fc98a' },
    { key: 'reisa',  name: 'reisa',  img: 'assets/reisa.jpg',  r: 32, color: '#ef9a9a' },
    { key: 'natsu',  name: 'natsu',  img: 'assets/natsu.jpg',  r: 39, color: '#ffd54f' },
    { key: 'kotori', name: 'kotori', img: 'assets/kotori.jpg', r: 47, color: '#81d4fa' },
    { key: 'kokona', name: 'kokona', img: 'assets/kokona.jpg', r: 57, color: '#ce93d8' },
    { key: 'midori', name: 'midori', img: 'assets/midori.jpg', r: 69, color: '#a5d6a7' },
    { key: 'last',   name: 'last',   img: 'assets/last.jpg',   r: 84, color: '#f6d365' },
  ];
  const MAX_LV = TIERS.length - 1;

  // 语音文件：kei/midori 是 m4a（原 mp4 纯音频），其余 ogg
  const VOICE = {
    kei: 'voices/kei.m4a', alice: 'voices/alice.ogg', koharu: 'voices/koharu.ogg',
    miyako: 'voices/miyako.ogg', kazusa: 'voices/kazusa.ogg', reisa: 'voices/reisa.ogg',
    natsu: 'voices/natsu.ogg', kotori: 'voices/kotori.ogg', kokona: 'voices/kokona.ogg',
    midori: 'voices/midori.m4a', last: 'voices/last.ogg',
  };

  const BGM = ['bgm/bgm1.m4a', 'bgm/bgm2.m4a'];

  /* 出场：只放最小的 5 级（和原版大西瓜一样），越往上越难凑。
     放得越小 → 棋盘填得慢、一局拖得长；放得越大 → 填得快、last 更容易摸到。 */
  const SPAWN_LEVELS = [0, 1, 2, 3, 4];
  const SPAWN_WEIGHTS = [0.30, 0.24, 0.18, 0.16, 0.12];

  /* 合成时的向上弹跳速度（像素/步） */
  const BOUNCE_BASE = 2.9;
  const BOUNCE_PER_LV = 0.5;

  const POINTS = [0, 4, 9, 16, 25, 36, 49, 64, 81, 100, 121]; // = 等级²

  /* ---------------- DOM ---------------- */
  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');
  cv.width = W * SCALE; cv.height = H * SCALE;

  const elScore = document.getElementById('score');
  const elBest = document.getElementById('best');
  const elNextName = document.getElementById('nextName');
  const elNextDesc = document.getElementById('nextDesc');
  const elCombo = document.getElementById('comboTag');
  const elMeta = document.getElementById('meta');
  const elChain = document.getElementById('chain');
  const nextCv = document.getElementById('nextCv');
  const nctx = nextCv.getContext('2d');
  const banner = document.getElementById('banner');
  const bTitle = document.getElementById('bTitle');
  const bText = document.getElementById('bText');
  const bBtn = document.getElementById('bBtn');

  /* ============================================================
     音频：背景音乐（两首轮播）+ 语音 + 合成音效
     ============================================================ */
  const AudioSys = (() => {
    let bgmIdx = 0, bgmStarted = false, bgmTimer = null;
    let ac = null, masterGain = null;
    const voiceEls = [];
    const lastPlayed = [];

    let bgmVol = +(localStorage.getItem('ba_bgm_vol') ?? 45) / 100;
    let sfxVol = +(localStorage.getItem('ba_sfx_vol') ?? 80) / 100;
    let bgmOn = (localStorage.getItem('ba_bgm_on') ?? '1') === '1';
    let sfxOn = (localStorage.getItem('ba_sfx_on') ?? '1') === '1';

    // ---- BGM ----
    const bgmEls = BGM.map((src, i) => {
      const a = new Audio();
      a.src = src;
      a.preload = i === 0 ? 'auto' : 'auto';
      a.loop = false;
      a.volume = 0;
      a.addEventListener('ended', () => playNextBgm());
      a.addEventListener('error', () => {
        // 一首挂了就跳下一首，别卡死
        if (bgmStarted) setTimeout(() => playNextBgm(), 800);
      });
      return a;
    });

    function fade(el, to, ms) {
      const from = el.volume;
      const t0 = performance.now();
      const id = setInterval(() => {
        const k = Math.min(1, (performance.now() - t0) / ms);
        el.volume = Math.max(0, Math.min(1, from + (to - from) * k));
        if (k >= 1) clearInterval(id);
      }, 30);
    }

    function targetBgmVol() { return bgmOn ? bgmVol : 0; }

    function playNextBgm() {
      const cur = bgmEls[bgmIdx];
      if (cur) { try { cur.pause(); } catch (e) {} }
      bgmIdx = (bgmIdx + 1) % bgmEls.length;
      const nx = bgmEls[bgmIdx];
      if (!nx) return;
      nx.currentTime = 0;
      nx.volume = 0;
      const p = nx.play();
      if (p && p.catch) p.catch(() => {});
      fade(nx, targetBgmVol(), 700);
    }

    // ---- 合成音效（现场合成，音量跟随音效滑杆）----
    function ensureAC() {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ac = new AC();
        masterGain = ac.createGain();
        masterGain.gain.value = 0.9;
        masterGain.connect(ac.destination);
      }
      if (ac.state === 'suspended') ac.resume();
      return ac;
    }

    function blip(freq, dur, type, gain, bendTo) {
      if (!ensureAC() || !sfxOn || sfxVol <= 0) return;
      const t = ac.currentTime;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (bendTo) o.frequency.exponentialRampToValueAtTime(bendTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain * sfxVol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(masterGain);
      o.start(t); o.stop(t + dur + 0.02);
    }

    function prepVoices() {
      TIERS.forEach((t, i) => {
        const a = new Audio();
        a.src = VOICE[t.key];
        a.preload = 'auto';
        a.volume = 1;
        voiceEls[i] = a;
        lastPlayed[i] = 0;
      });
    }

    return {
      prepVoices,
      get bgmOn() { return bgmOn; },
      get sfxOn() { return sfxOn; },
      get bgmVol() { return Math.round(bgmVol * 100); },
      get sfxVol() { return Math.round(sfxVol * 100); },

      startBgm() {
        if (bgmStarted) return;
        bgmStarted = true;
        const el = bgmEls[bgmIdx];
        if (!el) return;
        el.currentTime = 0;
        el.volume = 0;
        const p = el.play();
        if (p && p.catch) p.catch(() => {});
        fade(el, targetBgmVol(), 900);
      },

      pauseBgm() { const el = bgmEls[bgmIdx]; if (el) try { el.pause(); } catch (e) {} },
      resumeBgm() {
        if (!bgmStarted) return;
        const el = bgmEls[bgmIdx];
        if (el && el.paused) { const p = el.play(); if (p && p.catch) p.catch(() => {}); fade(el, targetBgmVol(), 400); }
      },

      setBgmVol(v) {
        bgmVol = Math.max(0, Math.min(1, v));
        localStorage.setItem('ba_bgm_vol', String(Math.round(bgmVol * 100)));
        const el = bgmEls[bgmIdx];
        if (el) el.volume = targetBgmVol();
      },
      setSfxVol(v) {
        sfxVol = Math.max(0, Math.min(1, v));
        localStorage.setItem('ba_sfx_vol', String(Math.round(sfxVol * 100)));
      },
      setBgmOn(on) {
        bgmOn = on;
        localStorage.setItem('ba_bgm_on', on ? '1' : '0');
        const el = bgmEls[bgmIdx];
        if (el) {
          if (on) { if (el.paused && bgmStarted) { const p = el.play(); if (p && p.catch) p.catch(() => {}); } fade(el, targetBgmVol(), 300); }
          else fade(el, 0, 250);
        }
      },
      setSfxOn(on) {
        sfxOn = on;
        localStorage.setItem('ba_sfx_on', on ? '1' : '0');
      },

      // 合成到第 level 级时的语音
      playVoice(level) {
        if (!sfxOn || sfxVol <= 0.001) return;
        const a = voiceEls[level];
        if (!a) return;
        const now = performance.now();
        if (now - lastPlayed[level] < 220) return;   // 同一级连击别叠成噪音
        lastPlayed[level] = now;
        try {
          a.pause();
          a.currentTime = 0;
          a.volume = Math.min(1, sfxVol);
          const p = a.play();
          if (p && p.catch) p.catch(() => {});
        } catch (e) {}
      },

      // 合成时的“啵”，音量压得很低，只做质感
      pop(level) {
        if (!sfxOn || sfxVol <= 0) return;
        const base = 320 + level * 55;
        blip(base, 0.16, 'sine', 0.20, base * 1.7);
        if (level >= 7) blip(base * 2, 0.13, 'triangle', 0.09, base * 2.8);
      },
      drop() {
        if (!sfxOn || sfxVol <= 0) return;
        blip(150, 0.09, 'sine', 0.10, 80);
      },
      over() {
        if (!sfxOn || sfxVol <= 0) return;
        [440, 370, 294, 220].forEach((f, i) => setTimeout(() => blip(f, 0.3, 'triangle', 0.14), i * 130));
      },
      ui() { blip(700, 0.06, 'sine', 0.08); },

      // 调试用：报告音频就绪情况
      status() {
        const ready = voiceEls.filter(a => a && a.readyState >= 2).length;
        const b = bgmEls[bgmIdx];
        return 'v' + ready + '/11 bgm' + (b ? b.readyState : '-') +
          (b && !b.paused ? '▶' : '■') +
          ' dur' + (b && isFinite(b.duration) ? Math.round(b.duration) : '?');
      },
    };
  })();

  /* ---------------- 图片 ---------------- */
  /* 同一个名字允许 jpg / png / webp / jpeg / gif，先试 TIERS 里写的那个，再按顺序兜底。
     这样替换图片时不用改代码，也不用管格式。 */
  const imgs = {};
  const EXT_ORDER = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

  function candidates(t) {
    const base = t.img.replace(/\.[^.]+$/, '');
    const list = [t.img];
    EXT_ORDER.forEach(e => { const p = base + '.' + e; if (list.indexOf(p) < 0) list.push(p); });
    return list;
  }

  function loadImages() {
    return Promise.all(TIERS.map(t => new Promise(res => {
      const list = candidates(t);
      let i = 0;
      const next = () => {
        if (i >= list.length) { imgs[t.key] = null; res(); return; }   // 全都没有就画色块
        const im = new Image();
        im.onload = () => { imgs[t.key] = im; res(); };
        im.onerror = () => { i++; next(); };
        im.src = list[i];
      };
      next();
    })));
  }

  /* ============================================================
     物理与状态
     ============================================================ */
  const engine = Engine.create({ enableSleeping: false });
  engine.gravity.y = 1.15;
  engine.positionIterations = 8;
  engine.velocityIterations = 6;
  engine.constraintIterations = 3;
  const world = engine.world;

  let balls = [], particles = [], rings = [], toasts = [], sparks = [];
  let shake = 0, flash = 0, timeScale = 1, slowTimer = 0;

  let score = 0;
  let best = +(localStorage.getItem('ba_best') || 0);
  let combo = 0, lastMergeAt = 0, maxSeen = 0;

  let currentLevel = 0, nextLevel = 0, ghostX = W / 2;
  let canDrop = true, running = false, over = false;
  let startedAt = 0, dropCount = 0, elapsedStr = '0:00';

  function fmtClock(ms) {
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  elBest.textContent = best;

  function buildWalls() {
    const o = { isStatic: true, restitution: 0.02, friction: 0.6 };
    Composite.add(world, [
      Bodies.rectangle(-WALL / 2, H / 2, WALL, H * 2, o),
      Bodies.rectangle(W + WALL / 2, H / 2, WALL, H * 2, o),
      Bodies.rectangle(W / 2, H + WALL / 2, W * 2, WALL, o),
    ]);
  }

  function makeBall(x, y, level, vx, vy, bounce) {
    const t = TIERS[level];
    const b = Bodies.circle(x, y, t.r, {
      label: 'ball',
      restitution: bounce ? 0.42 : 0.08,   // 刚合成的球更弹
      friction: 0.32,
      frictionStatic: 0.55,
      frictionAir: bounce ? 0.001 : 0.002,
      density: 0.0012,
      slop: 0.02,
    });
    b.level = level;
    b.merged = false;
    b.bornAt = performance.now();
    b.justMerged = !!bounce;
    if (vx || vy) Body.setVelocity(b, { x: vx || 0, y: vy || 0 });
    Composite.add(world, b);
    balls.push(b);
    return b;
  }

  function removeBall(b) {
    const i = balls.indexOf(b);
    if (i >= 0) balls.splice(i, 1);
    Composite.remove(world, b);
  }

  function pickLevel() {
    let r = Math.random(), acc = 0;
    for (let i = 0; i < SPAWN_LEVELS.length; i++) {
      acc += SPAWN_WEIGHTS[i];
      if (r <= acc) return SPAWN_LEVELS[i];
    }
    return SPAWN_LEVELS[SPAWN_LEVELS.length - 1];
  }

  /* ---------------- 特效 ---------------- */
  function burst(x, y, level, n) {
    const t = TIERS[level];
    const count = n || (10 + level * 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.2 + Math.random() * 3.6 + level * 0.28;
      particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1,
        life: 1, decay: 0.013 + Math.random() * 0.02,
        size: 1.4 + Math.random() * (2 + level * 0.4),
        color: Math.random() < 0.75 ? t.color : '#ffffff',
        rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 0.35,
        square: Math.random() < 0.3,
      });
    }
  }

  function ring(x, y, level) {
    rings.push({ x, y, r: TIERS[level].r * 0.5, max: TIERS[level].r * (2.4 + level * 0.16), life: 1, color: TIERS[level].color });
  }

  function toast(x, y, text, level) {
    toasts.push({
      x, y, text, life: 1, vy: -0.55,
      rot: (Math.random() - 0.5) * 0.2,
      size: 14 + Math.min(level, 10) * 1.3,
      color: TIERS[Math.min(level, MAX_LV)].color,
    });
  }

  /* ---------------- 合成 ---------------- */
  function doMerge(a, b) {
    if (a.merged || b.merged || a.level !== b.level) return;
    a.merged = b.merged = true;

    const level = a.level;
    const mx = (a.position.x + b.position.x) / 2;
    const my = (a.position.y + b.position.y) / 2;

    const now = performance.now();
    combo = (now - lastMergeAt < 1250) ? combo + 1 : 1;
    lastMergeAt = now;

    removeBall(a); removeBall(b);

    /* 顶级两两相撞：直接清场表演 */
    if (level >= MAX_LV) {
      score += Math.round(800 * (1 + (combo - 1) * 0.5));
      burst(mx, my, MAX_LV, 60);
      ring(mx, my, MAX_LV); ring(mx, my, MAX_LV);
      shake = Math.max(shake, 16); flash = 0.8;
      timeScale = 0.35; slowTimer = 420;
      toast(mx, my - 30, 'LAST × LAST', MAX_LV);
      AudioSys.playVoice(MAX_LV);
      AudioSys.pop(MAX_LV);
      setScore(); setCombo();
      return;
    }

    const nl = level + 1;

    /* —— 弹跳：新球向上弹起，等级越高弹得越高 —— */
    const up = BOUNCE_BASE + nl * BOUNCE_PER_LV;
    const side = (Math.random() - 0.5) * 2.6;
    const nb = makeBall(mx, my, nl, side, -up, true);

    /* 把周围的球也轻轻震开，制造“炸开”的手感 */
    const reach = TIERS[nl].r + 56;
    for (const o of balls) {
      if (o === nb) continue;
      const dx = o.position.x - mx, dy = o.position.y - my;
      const d = Math.hypot(dx, dy) || 1;
      if (d < reach) {
        const k = (1 - d / reach) * (2.2 + nl * 0.35);
        Body.setVelocity(o, { x: o.velocity.x + (dx / d) * k, y: o.velocity.y + (dy / d) * k - k * 0.35 });
      }
    }

    score += POINTS[nl] * (1 + Math.max(0, combo - 1) * 0.5);
    score = Math.round(score);

    burst(mx, my, level, 12 + level * 3);
    burst(nb.position.x, nb.position.y, nl, 8);
    ring(mx, my, nl);
    toast(mx, my - TIERS[nl].r - 6, TIERS[nl].name, nl);

    shake = Math.max(shake, 2.5 + nl * 1.4);
    if (nl >= 8) { timeScale = 0.5; slowTimer = 200; }

    /* —— 语音：合成到第 nl 级就播 nl 级的语音 —— */
    AudioSys.playVoice(nl);
    AudioSys.pop(nl);

    if (nl > maxSeen) { maxSeen = nl; paintChain(); }
    setScore(); setCombo();
  }

  function setScore() {
    elScore.textContent = score;
    elScore.classList.remove('bump');
    void elScore.offsetWidth;
    elScore.classList.add('bump');
    if (score > best) {
      best = score;
      elBest.textContent = best;
      localStorage.setItem('ba_best', String(best));
    }
  }

  function setCombo() {
    elCombo.textContent = combo > 1 ? 'COMBO ×' + combo : '';
  }

  /* ---------------- 输入 ---------------- */
  function pointerX(clientX) {
    const rect = cv.getBoundingClientRect();
    return (clientX - rect.left) / rect.width * W;
  }
  function clampX(x, level) {
    const r = TIERS[level].r;
    return Math.min(W - WALL - r, Math.max(WALL + r, x));
  }

  function drop() {
    if (!running || over || !canDrop) return;
    const lv = currentLevel;
    const x = clampX(ghostX, lv);
    makeBall(x, SPAWN_Y, lv, 0, 1.2, false);
    dropCount++;
    AudioSys.drop();

    /* —— 只有第一级 kei 在放下时说话 —— */
    if (lv === 0) AudioSys.playVoice(0);

    burst(x, SPAWN_Y, lv, 4);

    currentLevel = nextLevel;
    nextLevel = pickLevel();
    paintNext();
    canDrop = false;
    setTimeout(() => { canDrop = true; }, 240);
  }

  let lastTouchAt = 0;
  cv.addEventListener('mousemove', e => { ghostX = pointerX(e.clientX); });
  cv.addEventListener('mousedown', e => {
    if (performance.now() - lastTouchAt < 700) return;
    AudioSys.startBgm();
    ghostX = pointerX(e.clientX);
    drop();
  });
  cv.addEventListener('touchstart', e => {
    lastTouchAt = performance.now();
    AudioSys.startBgm();
    ghostX = pointerX(e.touches[0].clientX);
    e.preventDefault();
  }, { passive: false });
  cv.addEventListener('touchmove', e => {
    lastTouchAt = performance.now();
    ghostX = pointerX(e.touches[0].clientX);
    e.preventDefault();
  }, { passive: false });
  cv.addEventListener('touchend', e => {
    lastTouchAt = performance.now();
    e.preventDefault();
    drop();
  }, { passive: false });

  window.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') { ghostX = clampX(ghostX - 18, currentLevel); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { ghostX = clampX(ghostX + 18, currentLevel); e.preventDefault(); }
    else if (e.code === 'Space') { AudioSys.startBgm(); drop(); e.preventDefault(); }
    else if (e.key === 'r' || e.key === 'R') reset();
    else if (e.key === 'm' || e.key === 'M') toggleAll();
  });

  /* ---------------- 侧栏 ---------------- */
  function paintNext() {
    const t = TIERS[nextLevel];
    elNextName.textContent = t.name;
    elNextDesc.textContent = '直径 ' + (t.r * 2) + ' px';
    nctx.clearRect(0, 0, nextCv.width, nextCv.height);
    nctx.save();
    nctx.translate(nextCv.width / 2, nextCv.height / 2);
    const r = nextCv.width * 0.40;
    const img = imgs[t.key];
    if (img) {
      nctx.save();
      nctx.beginPath(); nctx.arc(0, 0, r, 0, Math.PI * 2); nctx.clip();
      const s = Math.max((r * 2) / img.width, (r * 2) / img.height);
      nctx.drawImage(img, -img.width * s / 2, -img.height * s / 2, img.width * s, img.height * s);
      nctx.restore();
    } else {
      nctx.beginPath(); nctx.arc(0, 0, r, 0, Math.PI * 2); nctx.fillStyle = t.color; nctx.fill();
    }
    nctx.beginPath(); nctx.arc(0, 0, r, 0, Math.PI * 2);
    nctx.lineWidth = 2.5; nctx.strokeStyle = '#fff'; nctx.stroke();
    nctx.restore();
  }

  function paintChain() {
    elChain.innerHTML = '';
    TIERS.forEach((t, i) => {
      const row = document.createElement('div');
      row.className = 'link' + (i > maxSeen ? ' locked' : '');
      const media = imgs[t.key]
        ? '<img src="' + imgs[t.key].src + '" alt="">'
        : '<span class="dot" style="background:' + t.color + '"></span>';
      row.innerHTML = media + '<span>' + t.name + '</span><span class="sz">' + (t.r * 2) + '</span>';
      elChain.appendChild(row);
    });
  }

  /* ---------------- 音量 / 开关 ---------------- */
  const bgmVolEl = document.getElementById('bgmVol');
  const sfxVolEl = document.getElementById('sfxVol');
  const bgmSwEl = document.getElementById('bgmSw');
  const sfxSwEl = document.getElementById('sfxSw');
  const btnMute = document.getElementById('btnMute');

  function syncAudioUI() {
    bgmVolEl.value = AudioSys.bgmVol;
    sfxVolEl.value = AudioSys.sfxVol;
    bgmSwEl.setAttribute('aria-pressed', String(AudioSys.bgmOn));
    sfxSwEl.setAttribute('aria-pressed', String(AudioSys.sfxOn));
    const both = AudioSys.bgmOn || AudioSys.sfxOn;
    btnMute.textContent = both ? '🔊 全部静音' : '🔇 恢复声音';
  }

  bgmVolEl.addEventListener('input', () => { AudioSys.startBgm(); AudioSys.setBgmVol(bgmVolEl.value / 100); });
  sfxVolEl.addEventListener('input', () => { AudioSys.setSfxVol(sfxVolEl.value / 100); });
  bgmSwEl.addEventListener('click', () => {
    AudioSys.setBgmOn(!AudioSys.bgmOn);
    if (AudioSys.bgmOn) AudioSys.startBgm();
    AudioSys.ui(); syncAudioUI();
  });
  sfxSwEl.addEventListener('click', () => {
    AudioSys.setSfxOn(!AudioSys.sfxOn);
    AudioSys.ui(); syncAudioUI();
  });

  function toggleAll() {
    const anyOn = AudioSys.bgmOn || AudioSys.sfxOn;
    AudioSys.setBgmOn(!anyOn);
    AudioSys.setSfxOn(!anyOn);
    syncAudioUI();
  }
  btnMute.addEventListener('click', () => { AudioSys.startBgm(); toggleAll(); });

  /* ---------------- 重置 / 结束 ---------------- */
  function reset() {
    balls.slice().forEach(removeBall);
    balls = []; particles = []; rings = []; toasts = []; sparks = [];
    score = 0; combo = 0; lastMergeAt = 0; maxSeen = 0;
    shake = 0; flash = 0; timeScale = 1; slowTimer = 0;
    over = false; running = true;
    startedAt = performance.now(); dropCount = 0;
    banner.classList.remove('show');
    elCombo.textContent = '';
    elScore.textContent = '0';
    currentLevel = pickLevel();
    nextLevel = pickLevel();
    ghostX = W / 2;
    paintNext(); paintChain();
    AudioSys.startBgm();
  }

  function gameOver() {
    over = true; running = false;
    AudioSys.over();
    const dur = fmtClock(performance.now() - startedAt);
    bTitle.textContent = '装不下了';
    bText.innerHTML = '得分 <b>' + score + '</b> · 最高 <b>' + best + '</b><br>' +
      '用时 <b>' + dur + '</b> · 落下 <b>' + dropCount + '</b> 球';
    bBtn.textContent = '再来一局';
    banner.classList.add('show');
  }

  document.getElementById('btnReset').addEventListener('click', () => { AudioSys.startBgm(); reset(); });
  bBtn.addEventListener('click', () => { AudioSys.startBgm(); reset(); });

  /* ---------------- 碰撞 ---------------- */
  Events.on(engine, 'collisionStart', ev => {
    for (const p of ev.pairs) {
      const a = p.bodyA, b = p.bodyB;
      if (a.label !== 'ball' || b.label !== 'ball') continue;
      if (a.merged || b.merged || a.level !== b.level) continue;
      doMerge(a, b);
    }
  });

  /* ---------------- 主循环 ---------------- */
  let last = performance.now();
  let overflowSince = 0;
  let metaTick = 0;

  function updateMeta(now) {
    if (!running) return;
    if (now - metaTick < 250) return;
    metaTick = now;
    elapsedStr = fmtClock(now - startedAt);
    elMeta.textContent = '⏱ ' + elapsedStr + ' · ' + dropCount + ' 球';
  }

  function checkOverflow(now) {
    let danger = false;
    for (const b of balls) {
      if (b.merged) continue;
      if (now - b.bornAt < (b.justMerged ? 1500 : 900)) continue;
      const top = b.position.y - TIERS[b.level].r;
      if (top < DANGER_Y && b.speed < 1.4) { danger = true; break; }
    }
    if (danger) {
      if (!overflowSince) overflowSince = now;
      else if (now - overflowSince > 1500) gameOver();
    } else overflowSince = 0;
  }

  function step(now) {
    const raw = Math.min(32, now - last);
    last = now;

    if (slowTimer > 0) { slowTimer -= raw; if (slowTimer <= 0) timeScale = 1; }
    else timeScale += (1 - timeScale) * 0.16;

    if (running && !over) {
      Engine.update(engine, raw * timeScale);
      for (const b of balls.slice()) if (b.position.y > H + 140) removeBall(b);
      checkOverflow(now);
      updateMeta(now);
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.vx *= 0.985; p.rot += p.spin;
      p.life -= p.decay;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.r += (r.max - r.r) * 0.17; r.life -= 0.036;
      if (r.life <= 0) rings.splice(i, 1);
    }
    for (let i = toasts.length - 1; i >= 0; i--) {
      const t = toasts[i];
      t.y += t.vy; t.vy *= 0.985; t.life -= 0.0125;
      if (t.life <= 0) toasts.splice(i, 1);
    }

    shake *= 0.88; if (shake < 0.05) shake = 0;
    flash *= 0.9; if (flash < 0.01) flash = 0;
  }

  /* ---------------- 绘制 ---------------- */
  function drawBall(c, x, y, r, ti) {
    const img = imgs[ti.key];

    // 影子，把球从浅色背景上"托"起来（用径向渐变，比 blur 快）
    const sh = c.createRadialGradient(x, y + r * 0.16, r * 0.55, x, y + r * 0.16, r * 1.16);
    sh.addColorStop(0, 'rgba(28,62,92,.26)');
    sh.addColorStop(1, 'rgba(28,62,92,0)');
    c.beginPath(); c.arc(x, y + r * 0.16, r * 1.16, 0, Math.PI * 2);
    c.fillStyle = sh; c.fill();

    c.save();
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.clip();
    if (img) {
      const s = Math.max((r * 2) / img.width, (r * 2) / img.height);
      c.drawImage(img, x - img.width * s / 2, y - img.height * s / 2, img.width * s, img.height * s);
    } else {
      c.fillStyle = ti.color;
      c.fillRect(x - r, y - r, r * 2, r * 2);
      c.fillStyle = 'rgba(255,255,255,.9)';
      c.font = '700 ' + Math.max(9, r * 0.42) + 'px "Segoe UI",sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(ti.name, x, y);
    }
    // 轻微的体积感（比之前淡，别把图洗白）
    const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r * 1.02);
    g.addColorStop(0, 'rgba(255,255,255,.14)');
    g.addColorStop(0.55, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(10,30,50,.26)');
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
    c.restore();

    // 外圈：先用等级色描一圈，再加一道细白边，浅色图上也能分辨
    c.beginPath(); c.arc(x, y, r + 0.5, 0, Math.PI * 2);
    c.lineWidth = 3; c.strokeStyle = ti.color; c.stroke();
    c.beginPath(); c.arc(x, y, r + 2, 0, Math.PI * 2);
    c.lineWidth = 1.2; c.strokeStyle = 'rgba(255,255,255,.9)'; c.stroke();
    c.beginPath(); c.arc(x, y, r - 0.6, 0, Math.PI * 2);
    c.lineWidth = 1; c.strokeStyle = 'rgba(255,255,255,.65)'; c.stroke();
  }

  function draw() {
    const c = ctx;
    c.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    c.clearRect(0, 0, W, H);

    const bg = c.createLinearGradient(0, 0, W * 0.45, H);
    bg.addColorStop(0, '#f2f9ff');
    bg.addColorStop(0.45, '#e2f0fa');
    bg.addColorStop(1, '#cfe3f2');
    c.fillStyle = bg; c.fillRect(0, 0, W, H);

    // 底部压暗一点，球不至于糊在背景里
    const vg = c.createLinearGradient(0, H * 0.55, 0, H);
    vg.addColorStop(0, 'rgba(90,140,180,0)');
    vg.addColorStop(1, 'rgba(90,140,180,.16)');
    c.fillStyle = vg; c.fillRect(0, 0, W, H);

    const spot = c.createRadialGradient(W * 0.24, H * 0.16, 8, W * 0.24, H * 0.16, W * 0.8);
    spot.addColorStop(0, 'rgba(180,225,255,.4)');
    spot.addColorStop(1, 'rgba(180,225,255,0)');
    c.fillStyle = spot; c.fillRect(0, 0, W, H);

    c.fillStyle = 'rgba(140,175,200,.10)';
    c.fillRect(0, 0, WALL, H);
    c.fillRect(W - WALL, 0, WALL, H);

    c.save();
    c.setLineDash([7, 7]); c.lineWidth = 1.5;
    c.strokeStyle = overflowSince ? 'rgba(230,80,90,.85)' : 'rgba(120,175,215,.45)';
    c.beginPath(); c.moveTo(WALL + 4, DANGER_Y); c.lineTo(W - WALL - 4, DANGER_Y); c.stroke();
    c.restore();

    const ox = (Math.random() - 0.5) * shake;
    const oy = (Math.random() - 0.5) * shake;
    c.save();
    c.translate(ox, oy);

    if (running && !over) {
      const gx = clampX(ghostX, currentLevel);
      const gi = TIERS[currentLevel];
      c.save();
      c.setLineDash([4, 9]); c.lineWidth = 1.3;
      c.strokeStyle = 'rgba(90,140,170,.3)';
      c.beginPath(); c.moveTo(gx, SPAWN_Y + gi.r); c.lineTo(gx, H - 6); c.stroke();
      c.restore();
      c.globalAlpha = 0.6;
      drawBall(c, gx, SPAWN_Y, gi.r, gi);
      c.globalAlpha = 1;
    }

    for (const b of balls) drawBall(c, b.position.x, b.position.y, TIERS[b.level].r, TIERS[b.level]);

    for (const r of rings) {
      c.beginPath(); c.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      c.lineWidth = 3.2 * r.life;
      c.strokeStyle = hexA(r.color, 0.55 * r.life);
      c.stroke();
    }

    for (const p of particles) {
      c.save();
      c.globalAlpha = Math.max(0, p.life);
      c.translate(p.x, p.y); c.rotate(p.rot);
      c.fillStyle = p.color;
      if (p.square) c.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.8);
      else { c.beginPath(); c.arc(0, 0, p.size / 2, 0, Math.PI * 2); c.fill(); }
      c.restore();
    }

    for (const t of toasts) {
      c.save();
      c.globalAlpha = Math.min(1, t.life * 1.7);
      c.translate(t.x, t.y); c.rotate(t.rot);
      const sc = 1 + (1 - t.life) * 0.15;
      c.scale(sc, sc);
      c.font = '800 ' + t.size + 'px "Segoe UI","Microsoft YaHei",sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 4; c.strokeStyle = 'rgba(255,255,255,.95)';
      c.strokeText(t.text, 0, 0);
      c.fillStyle = t.color;
      c.fillText(t.text, 0, 0);
      c.restore();
    }

    c.restore();

    if (flash > 0.01) {
      c.fillStyle = 'rgba(255,255,255,' + flash * 0.5 + ')';
      c.fillRect(0, 0, W, H);
    }

    const fade = c.createLinearGradient(0, 0, 0, 78);
    fade.addColorStop(0, 'rgba(248,253,255,.96)');
    fade.addColorStop(1, 'rgba(248,253,255,0)');
    c.fillStyle = fade; c.fillRect(0, 0, W, 78);

    c.save();
    c.globalAlpha = 0.06;
    c.font = '900 88px "Segoe UI",sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#2f6f96';
    c.fillText(String(score), W / 2, H * 0.63);
    c.restore();
  }

  function hexA(hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* ---------------- 启动 ---------------- */
  function loop(now) { step(now); draw(); requestAnimationFrame(loop); }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) AudioSys.pauseBgm();
    else AudioSys.resumeBgm();
  });

  AudioSys.prepVoices();

  loadImages().then(() => {
    buildWalls();
    currentLevel = pickLevel();
    nextLevel = pickLevel();
    paintNext();
    paintChain();
    syncAudioUI();
    banner.classList.add('show');
    requestAnimationFrame(loop);
  });

  // 预览/调试：地址带 ?demo 或 #demo 自动开局并随机投球
  if (/[?&]demo/.test(location.search) || /demo/.test(location.hash)) {
    setInterval(() => {
      const missing = TIERS.filter(t => !imgs[t.key]).map(t => t.key);
      const st = document.getElementById('stage').getBoundingClientRect();
      document.title = (missing.length ? '缺图:' + missing.join(',') : '素材齐') +
        ' vp' + innerWidth + 'x' + innerHeight +
        ' stage' + Math.round(st.width) + 'x' + Math.round(st.height) +
        '@' + Math.round(st.left) + ',' + Math.round(st.top) +
        ' 球' + balls.length + ' 分' + score +
        ' 音频' + AudioSys.status();
    }, 1000);
    setTimeout(() => {
      banner.classList.remove('show');
      running = true; over = false;
      AudioSys.startBgm();
      setInterval(() => {
        if (!running || over) return;
        const r = TIERS[currentLevel].r;
        ghostX = WALL + r + Math.random() * (W - 2 * WALL - 2 * r);
        drop();
      }, 620);
    }, 700);
  }

  window.__ba = { get score() { return score; }, get balls() { return balls; }, reset, drop };
})();
