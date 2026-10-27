(() => {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const smooth = (x) => x * x * (3 - 2 * x);

  // Regola per non bloccare i telefoni: nel loop si legge solo scrollY e le
  // misure messe in cache da measure(); gli stili si scrivono solo se cambiano.

  /* ---------- Stato condiviso ---------- */

  const pointer = { x: 0.5, cx: 0, cy: 0, last: -1e9 };
  window.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX / window.innerWidth;
    pointer.cx = e.clientX;
    pointer.cy = e.clientY;
    pointer.last = performance.now();
  }, { passive: true });

  let scrollY = window.scrollY;
  let lastScrollY = -1;
  let scrollVel = 0;
  let vh = window.innerHeight;
  window.addEventListener('scroll', () => { scrollY = window.scrollY; }, { passive: true });

  const orientation = { x: 0, y: 0, bx: 0, by: 0, last: -1e9 };
  if (!finePointer) {
    window.addEventListener('deviceorientation', (e) => {
      if (e.gamma == null) return;
      // Riferimento che si adatta piano a come tieni il telefono:
      // conta solo quanto lo inclini rispetto alla tua posizione.
      if (orientation.last < 0) { orientation.bx = e.gamma; orientation.by = e.beta; }
      orientation.bx = lerp(orientation.bx, e.gamma, 0.004);
      orientation.by = lerp(orientation.by, e.beta, 0.004);
      orientation.x = clamp((e.gamma - orientation.bx) / 22, -1, 1);
      orientation.y = clamp((e.beta - orientation.by) / 22, -1, 1);
      orientation.last = performance.now();
    }, { passive: true });
  }

  // Posizione di un elemento nella pagina (non nello schermo).
  const docRect = (el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top + window.scrollY, left: r.left, width: r.width, height: r.height };
  };

  /* ---------- Waveform ---------- */

  function seeded(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  const waves = [];

  function buildWave(el) {
    const count = Number(el.dataset.bars) || 96;
    const rand = seeded(Number(el.dataset.seed) || 1);
    const gap = 2;
    const w = 4;
    const width = count * (w + gap) - gap;
    const height = 100;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.overflow = 'visible';

    const grad = document.createElementNS(SVG_NS, 'linearGradient');
    const gid = `wg-${Math.random().toString(36).slice(2, 8)}`;
    grad.setAttribute('id', gid);
    [['0', '#3C3C3C'], ['.35', '#BDBDBD'], ['.5', '#F6F6F4'], ['.7', '#7E7E7C'], ['1', '#3C3C3C']].forEach(([o, c]) => {
      const stop = document.createElementNS(SVG_NS, 'stop');
      stop.setAttribute('offset', o);
      stop.setAttribute('stop-color', c);
      grad.appendChild(stop);
    });
    svg.appendChild(grad);

    const bars = [];
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      // Inviluppo: più alto al centro, come nel brand book.
      const env = 0.22 + 0.78 * Math.pow(Math.sin(Math.PI * t), 0.9);
      const h = Math.max(8, height * env * (0.45 + 0.55 * rand()));
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'bar');
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', i * (w + gap));
      rect.setAttribute('y', (height - h) / 2);
      rect.setAttribute('width', w);
      rect.setAttribute('height', h);
      rect.setAttribute('fill', `url(#${gid})`);
      rect.style.setProperty('--d', `${(1.1 + rand() * 1.4).toFixed(2)}s`);
      rect.style.setProperty('--delay', `${(-rand() * 2).toFixed(2)}s`);
      rect.style.setProperty('--s', (0.35 + rand() * 0.5).toFixed(2));
      g.appendChild(rect);
      svg.appendChild(g);
      bars.push({ el: g, boost: 1 });
    }
    el.appendChild(svg);

    const wave = { el, bars, ripples: [], visible: false, active: false, tx: 0, tLast: -1e9, box: null };
    const localX = (clientX) => {
      const r = el.getBoundingClientRect();
      return ((clientX - r.left) / r.width) * (count - 1);
    };
    // Col dito: le barre seguono il dito mentre lo trascini sull'onda.
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') return;
      wave.tx = localX(e.clientX);
      wave.tLast = performance.now();
    }, { passive: true });
    // Un clic o un tocco fa partire un'onda dal punto toccato.
    el.addEventListener('pointerdown', (e) => {
      if (reduceMotion) return;
      wave.ripples.push({ x: localX(e.clientX), t: performance.now() });
    });
    waves.push(wave);
  }

  document.querySelectorAll('.wave').forEach(buildWave);

  function updateWave(wave, now, scrolled) {
    const b = wave.box;
    if (!b) return;
    const n = wave.bars.length;
    const top = b.top - scrollY;
    const near = finePointer && now - pointer.last < 1500 &&
      pointer.cy > top - 60 && pointer.cy < top + b.height + 60 &&
      pointer.cx > b.left - 40 && pointer.cx < b.left + b.width + 40;
    if (wave.ripples.length) wave.ripples = wave.ripples.filter((rp) => now - rp.t < 1400);
    const touching = now - wave.tLast < 900;
    // Telefono: senza dito, una "testina" attraversa l'onda mentre scorri.
    const auto = !finePointer && !touching;
    if (!near && !touching && !wave.ripples.length && !wave.active && !(auto && scrolled)) return;

    let px = ((pointer.cx - b.left) / b.width) * (n - 1);
    if (touching) px = wave.tx;
    if (auto) px = clamp(1 - (top + b.height / 2) / vh, 0, 1) * 1.2 * (n - 1) - 0.1 * (n - 1);
    const focus = near || touching || auto;
    let moving = false;
    for (let i = 0; i < n; i++) {
      let target = 1;
      if (focus) target += 1.1 * Math.exp(-((i - px) ** 2) / 40);
      for (const rp of wave.ripples) {
        const age = now - rp.t;
        target += 1.2 * (1 - age / 1400) * Math.exp(-((Math.abs(i - rp.x) - age * 0.07) ** 2) / 10);
      }
      const bar = wave.bars[i];
      const next = lerp(bar.boost, target, 0.22);
      if (Math.abs(next - bar.boost) > 0.004) {
        bar.boost = next;
        bar.el.style.transform = `scaleY(${next.toFixed(3)})`;
        moving = true;
      }
    }
    wave.active = moving;
  }

  /* ---------- Simbolo © ---------- */

  const hero = document.querySelector('.hero');
  const symbol = document.querySelector('.symbol');
  const symbolTilt = document.querySelector('.symbol-tilt');
  const symbolWrap = document.querySelector('.hero__symbol');
  const ideaTitle = document.querySelector('.idea__title');
  const narrow = window.matchMedia('(max-width: 640px)');
  const tilt = { x: 0, y: 0 };
  let symbolBox = null;
  let symbolTravel = 0;
  let lastSymbol = '';
  let lastTilt = '';

  requestAnimationFrame(() => requestAnimationFrame(() => hero && hero.classList.add('is-ready')));
  // A disegno finito tolgo il tratteggio, così l'anello resta pulito e senza giunture.
  const ring = document.querySelector('.symbol__ring');
  if (ring) ring.addEventListener('transitionend', () => hero.classList.add('is-drawn'), { once: true });

  function updateSymbol(now) {
    if (!symbol || !symbolTilt) return;
    // Telefono: il simbolo di sfondo scende con la pagina finché si ferma
    // dietro al titolo della sezione Idea.
    const y = symbolTravel ? scrollY : Math.min(scrollY, vh * 1.2);
    const shift = symbolTravel ? Math.min(y * 0.62, symbolTravel) : y * 0.12;
    const s = `translateY(${shift.toFixed(1)}px) rotate(${(Math.min(y, 1200) * -0.03).toFixed(1)}deg)`;
    if (s !== lastSymbol) { symbol.style.transform = s; lastSymbol = s; }

    let t;
    if (finePointer) {
      let tx = 0;
      let ty = 0;
      if (symbolBox && scrollY < vh) {
        const cy = symbolBox.top - scrollY + symbolBox.height / 2;
        tx = clamp((pointer.cx - (symbolBox.left + symbolBox.width / 2)) / symbolBox.width, -1, 1);
        ty = clamp((pointer.cy - cy) / symbolBox.height, -1, 1);
      }
      tilt.x = lerp(tilt.x, tx, 0.08);
      tilt.y = lerp(tilt.y, ty, 0.08);
      t = `rotateY(${(tilt.x * 18).toFixed(1)}deg) rotateX(${(-tilt.y * 18).toFixed(1)}deg)`;
    } else {
      // Telefono: niente 3D, che pesa troppo. Una leggera rotazione che segue
      // l'inclinazione del telefono, oppure oscilla piano da sola.
      const gyro = now - orientation.last < 1500;
      const tx = gyro ? orientation.x : Math.sin(now / 1900) * 0.5;
      tilt.x = lerp(tilt.x, tx, 0.08);
      t = `rotate(${(tilt.x * 6).toFixed(1)}deg)`;
    }
    if (t !== lastTilt) { symbolTilt.style.transform = t; lastTilt = t; }
  }

  /* ---------- Luce cromata ---------- */

  // Una sola "luce" muove il riflesso delle scritte e dei loghi cromati:
  // segue il mouse, oppure lo scroll (e il giroscopio) sui telefoni, e respira
  // piano da sola. Si aggiorna solo sugli elementi visibili, al massimo
  // 30 volte al secondo sul computer e 20 sul telefono.
  const chromeGrad = document.getElementById('chrome');
  const chromeEls = new Set();
  const visibleChrome = new Set();
  document.querySelectorAll('.chrome').forEach((el) => chromeEls.add(el));
  let light = 40;
  let lastLightWrite = 0;
  let writtenLight = -1;
  let docMax = 1;

  function updateLight(now) {
    let source = finePointer && now - pointer.last < 4000 ? pointer.x : scrollY / docMax;
    // Telefono: il giroscopio sposta il riflesso, in aggiunta allo scroll.
    if (!finePointer && now - orientation.last < 1500) {
      source = clamp(source + orientation.x * 0.45 + orientation.y * 0.25, 0, 1);
    }
    const breathe = Math.sin(now / 2600) * 0.5 + 0.5;
    const target = 8 + 84 * (0.7 * source + 0.3 * breathe);
    light = lerp(light, target, 0.06);

    if (now - lastLightWrite < (finePointer ? 33 : 50)) return;
    if (Math.abs(light - writtenLight) < 0.25) return;
    lastLightWrite = now;
    writtenLight = light;
    const v = light.toFixed(1);
    visibleChrome.forEach((el) => el.style.setProperty('--lx', v));
    if (chromeGrad) chromeGrad.setAttribute('gradientTransform', `rotate(${(-55 + light * 1.1).toFixed(0)} .5 .5)`);
  }

  /* ---------- Slogan ---------- */

  const marquees = [...document.querySelectorAll('.marquee')].map((el) => {
    const track = el.querySelector('.marquee__track');
    // Copie della traccia finché il nastro copre lo schermo anche mentre scorre.
    let guard = 0;
    while ((guard === 0 || el.scrollWidth < track.offsetWidth + window.innerWidth * 1.3) && guard++ < 8) {
      el.appendChild(track.cloneNode(true));
    }
    return { el, track, speed: Number(el.dataset.speed) || 1, x: 0, w: 0, visible: false };
  });
  let direction = 1;

  function updateMarquees(dt) {
    const boost = 1 + Math.min(scrollVel * 0.12, 7);
    marquees.forEach((m) => {
      if (!m.visible || !m.w) return;
      m.x -= m.speed * direction * boost * dt * 0.06;
      if (m.x <= -m.w) m.x += m.w;
      if (m.x > 0) m.x -= m.w;
      m.el.style.transform = `translate3d(${m.x.toFixed(1)}px, 0, 0)`;
    });
  }

  /* ---------- Testi che si accendono parola per parola ---------- */

  const wordBlocks = [...document.querySelectorAll('[data-words]')].map((block) => {
    const words = [];
    const paras = block.matches('p') ? [block] : [...block.querySelectorAll('p:not(.tag)')];
    paras.forEach((p) => {
      const parts = p.textContent.split(/(\s+)/);
      p.textContent = '';
      parts.forEach((part) => {
        if (!part.trim()) {
          p.appendChild(document.createTextNode(part));
          return;
        }
        const span = document.createElement('span');
        span.className = 'w';
        span.textContent = part;
        p.appendChild(span);
        words.push(span);
      });
    });
    return { block, words, lit: -1, box: null };
  });

  function updateWords() {
    wordBlocks.forEach((wb) => {
      if (!wb.box) return;
      const top = wb.box.top - scrollY;
      const progress = clamp((vh * 0.88 - top) / (wb.box.height + vh * 0.3), 0, 1);
      const lit = Math.round(progress * wb.words.length);
      if (lit === wb.lit) return;
      const from = Math.max(0, Math.min(lit, wb.lit));
      const to = Math.max(lit, wb.lit);
      for (let i = from; i < to; i++) wb.words[i].classList.toggle('is-lit', i < lit);
      if (wb.lit < 0) wb.words.forEach((w, i) => w.classList.toggle('is-lit', i < lit));
      wb.lit = lit;
    });
  }

  /* ---------- Credits: dal margine al centro, con lo scroll ---------- */

  const scene = document.querySelector('.idea');
  const sceneGrid = document.querySelector('.idea__grid');
  const sceneCopy = document.querySelector('.idea__copy');
  const credits = document.querySelector('.credits');
  const sceneM = { start: 0, travel: 1, stick: 0 };
  let sceneT = 0;
  let writtenT = -1;
  let writtenP = -1;

  function updateCredits() {
    if (!scene || !credits) return;
    // p: 0 quando il riquadro si ferma, 1 quando riparte.
    const p = clamp((scrollY + sceneM.stick - sceneM.start) / sceneM.travel, 0, 1);
    const target = smooth(clamp((p - 0.12) / 0.6, 0, 1));
    sceneT = lerp(sceneT, target, 0.14);
    if (Math.abs(target - sceneT) < 0.001) sceneT = target;
    if (Math.abs(sceneT - writtenT) > 0.0015) {
      scene.style.setProperty('--t', sceneT.toFixed(4));
      credits.classList.toggle('is-after', sceneT > 0.5);
      writtenT = sceneT;
    }
    if (Math.abs(p - writtenP) > 0.002) {
      credits.style.setProperty('--p', p.toFixed(3));
      writtenP = p;
    }
  }

  /* ---------- Pilastri: entrano uno alla volta con lo scroll ---------- */

  const pScene = document.querySelector('.pillars__scene');
  const pSticky = document.querySelector('.pillars__sticky');
  const pillars = [...document.querySelectorAll('.pillar')];
  const pTimeline = document.querySelector('.pillars__timeline');
  const pillarQ = pillars.map(() => 0);
  const pillarW = pillars.map(() => -1);
  const pillarM = { start: 0, travel: 1, stick: 0 };
  let pActive = -2;
  let pWrittenP = -1;

  function updatePillars() {
    if (!pScene || !pillars.length) return;
    const p = clamp((scrollY + pillarM.stick - pillarM.start) / pillarM.travel, 0, 1);
    const n = pillars.length;
    let active = -1;
    for (let i = 0; i < n; i++) {
      // Ogni pilastro ha la sua fetta di scroll, con un po' di sovrapposizione.
      const target = smooth(clamp(p * (n + 1.2) - i * 1.05 - 0.15, 0, 1));
      pillarQ[i] = lerp(pillarQ[i], target, 0.16);
      if (Math.abs(target - pillarQ[i]) < 0.001) pillarQ[i] = target;
      if (pillarQ[i] > 0.6) active = i;
    }
    for (let i = 0; i < n; i++) {
      if (Math.abs(pillarQ[i] - pillarW[i]) > 0.0015 || (i + 1 < n && Math.abs(pillarQ[i + 1] - pillarW[i + 1]) > 0.0015)) {
        pillars[i].style.setProperty('--q', pillarQ[i].toFixed(4));
        pillars[i].style.setProperty('--c', (i + 1 < n ? pillarQ[i + 1] : 0).toFixed(4));
      }
    }
    for (let i = 0; i < n; i++) pillarW[i] = pillarQ[i];
    if (active !== pActive) {
      pillars.forEach((el, i) => el.classList.toggle('is-active', i === active));
      pActive = active;
    }
    if (pTimeline && Math.abs(p - pWrittenP) > 0.002) {
      pTimeline.style.setProperty('--p', p.toFixed(3));
      pWrittenP = p;
    }
  }

  /* ---------- Luce sui riquadri ---------- */

  const spots = [...document.querySelectorAll('[data-spot]')].map((el) => ({ el, box: null, y: null }));

  function updateSpotsTouch() {
    // Telefono: la luce sta al centro dello schermo, scorrendo attraversa il riquadro.
    spots.forEach((s) => {
      if (!s.box) return;
      const top = s.box.top - scrollY;
      if (top > vh || top + s.box.height < 0) return;
      const y = Math.round(vh * 0.5 - top);
      if (y === s.y) return;
      s.y = y;
      const inside = clamp(1 - Math.abs(y - s.box.height / 2) / (s.box.height / 2 + vh * 0.25), 0, 1);
      s.el.style.setProperty('--py', `${y}px`);
      s.el.style.setProperty('--spot-o', inside.toFixed(2));
    });
  }

  if (finePointer) {
    spots.forEach(({ el }) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--px', `${e.clientX - r.left}px`);
        el.style.setProperty('--py', `${e.clientY - r.top}px`);
      });
    });
  }

  /* ---------- Misure (solo quando cambia il layout) ---------- */

  function measure() {
    vh = window.innerHeight;
    docMax = Math.max(1, root.scrollHeight - vh);
    waves.forEach((w) => { w.box = docRect(w.el); });
    marquees.forEach((m) => { m.w = m.track.offsetWidth; });
    wordBlocks.forEach((wb) => { wb.box = docRect(wb.block); });
    spots.forEach((s) => {
      s.box = docRect(s.el);
      s.y = null;
      if (!finePointer) s.el.style.setProperty('--px', `${Math.round(s.box.width / 2)}px`);
    });

    if (symbolWrap) symbolBox = docRect(symbolWrap);
    symbolTravel = 0;
    if (narrow.matches && symbolBox && ideaTitle) {
      const t = docRect(ideaTitle);
      symbolTravel = Math.max(0, (t.top + t.height / 2) - (symbolBox.top + symbolBox.height / 2));
    }

    if (sceneGrid && credits) {
      const g = docRect(sceneGrid);
      const cs = getComputedStyle(credits);
      sceneM.stick = parseFloat(cs.top) || 0;
      let start = 0;
      if (sceneCopy && getComputedStyle(sceneCopy).position === 'static') {
        start = docRect(sceneCopy).top + sceneCopy.offsetHeight - g.top + (parseFloat(getComputedStyle(sceneGrid).rowGap) || 0);
      }
      sceneM.start = g.top + start;
      sceneM.travel = Math.max(1, g.height - start - credits.offsetHeight);
    }

    if (pScene && pSticky) {
      const r = docRect(pScene);
      pillarM.stick = parseFloat(getComputedStyle(pSticky).top) || 0;
      pillarM.start = r.top;
      pillarM.travel = Math.max(1, r.height - pSticky.offsetHeight);
    }
    lastScrollY = -1;
  }

  let measureQueued = false;
  const queueMeasure = () => {
    if (measureQueued) return;
    measureQueued = true;
    requestAnimationFrame(() => { measureQueued = false; measure(); });
  };
  measure();
  window.addEventListener('resize', queueMeasure);
  window.addEventListener('load', queueMeasure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueMeasure);
  if ('ResizeObserver' in window) new ResizeObserver(queueMeasure).observe(document.body);

  /* ---------- Visibilità ---------- */

  if ('IntersectionObserver' in window) {
    const visIO = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const el = entry.target;
        if (chromeEls.has(el)) {
          if (entry.isIntersecting) {
            visibleChrome.add(el);
            el.style.setProperty('--lx', light.toFixed(1));
          } else {
            visibleChrome.delete(el);
          }
        }
        const wave = waves.find((w) => w.el === el);
        if (wave) {
          wave.visible = entry.isIntersecting;
          // La pulsazione continua delle barre solo sul computer: sul telefono pesa troppo.
          if (!reduceMotion && finePointer && el.classList.contains('wave--live')) {
            el.classList.toggle('is-playing', entry.isIntersecting);
          }
        }
        const m = marquees.find((mm) => mm.el === el);
        if (m) m.visible = entry.isIntersecting;
      });
    }, { rootMargin: '80px 0px' });
    chromeEls.forEach((el) => visIO.observe(el));
    waves.forEach((w) => visIO.observe(w.el));
    marquees.forEach((m) => visIO.observe(m.el));
  } else {
    chromeEls.forEach((el) => visibleChrome.add(el));
    waves.forEach((w) => { w.visible = true; });
    marquees.forEach((m) => { m.visible = true; });
  }

  /* ---------- Loop ---------- */

  let prev = performance.now();
  function frame(now) {
    const dt = Math.min(64, now - prev);
    prev = now;

    const dy = lastScrollY < 0 ? 0 : scrollY - lastScrollY;
    const scrolled = scrollY !== lastScrollY;
    lastScrollY = scrollY;
    if (Math.abs(dy) > 0.5) direction = dy > 0 ? 1 : -1;
    scrollVel = lerp(scrollVel, Math.abs(dy), 0.12);

    updateLight(now);
    updateSymbol(now);
    updateMarquees(dt);
    if (scrolled) updateWords();
    updateCredits();
    updatePillars();
    if (!finePointer && scrolled) updateSpotsTouch();
    waves.forEach((w) => { if (w.visible) updateWave(w, now, scrolled); });
    requestAnimationFrame(frame);
  }

  if (reduceMotion) {
    chromeEls.forEach((el) => el.style.setProperty('--lx', '40'));
    wordBlocks.forEach((wb) => wb.words.forEach((w) => w.classList.add('is-lit')));
    if (scene) scene.style.setProperty('--t', '1');
    pillars.forEach((el) => el.style.setProperty('--q', '1'));
    if (credits) credits.classList.add('is-after');
  } else {
    requestAnimationFrame(frame);
  }

  /* ---------- Entrate ---------- */

  const revealEls = [...document.querySelectorAll('[data-reveal]')];
  const groups = new Map();
  revealEls.forEach((el) => {
    const parent = el.closest('section, footer') || document.body;
    const list = groups.get(parent) || [];
    el.style.setProperty('--stagger', `${Math.min(list.length, 6) * 0.08}s`);
    list.push(el);
    groups.set(parent, list);
  });

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-in'));
  }
})();
