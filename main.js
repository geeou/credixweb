(() => {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  // Stato condiviso: puntatore e scroll.
  const pointer = { x: 0.5, y: 0.5, cx: 0, cy: 0, last: -1e9 };
  window.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX / window.innerWidth;
    pointer.y = e.clientY / window.innerHeight;
    pointer.cx = e.clientX;
    pointer.cy = e.clientY;
    pointer.last = performance.now();
  }, { passive: true });

  let scrollY = window.scrollY;
  let lastScrollY = scrollY;
  let scrollVel = 0;
  window.addEventListener('scroll', () => { scrollY = window.scrollY; }, { passive: true });

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
      bars.push({ el: g, h, boost: 1 });
    }
    el.appendChild(svg);

    const wave = { el, bars, ripples: [], visible: false, active: false };
    // Un clic o un tocco fa partire un'onda dal punto toccato.
    el.addEventListener('pointerdown', (e) => {
      if (reduceMotion) return;
      const r = el.getBoundingClientRect();
      wave.ripples.push({ x: ((e.clientX - r.left) / r.width) * (count - 1), t: performance.now() });
    });
    waves.push(wave);
  }

  document.querySelectorAll('.wave').forEach(buildWave);

  function updateWave(wave, now) {
    const r = wave.el.getBoundingClientRect();
    const n = wave.bars.length;
    const near = finePointer && now - pointer.last < 1500 &&
      pointer.cy > r.top - 60 && pointer.cy < r.bottom + 60 &&
      pointer.cx > r.left - 40 && pointer.cx < r.right + 40;
    wave.ripples = wave.ripples.filter((rp) => now - rp.t < 1400);
    if (!near && !wave.ripples.length && !wave.active) return;

    const px = ((pointer.cx - r.left) / r.width) * (n - 1);
    let moving = false;
    for (let i = 0; i < n; i++) {
      let target = 1;
      if (near) target += 1.1 * Math.exp(-((i - px) ** 2) / 40);
      for (const rp of wave.ripples) {
        const age = now - rp.t;
        const front = age * 0.07;
        target += 1.2 * (1 - age / 1400) * Math.exp(-((Math.abs(i - rp.x) - front) ** 2) / 10);
      }
      const bar = wave.bars[i];
      const next = lerp(bar.boost, target, 0.22);
      if (Math.abs(next - bar.boost) > 0.002) {
        bar.boost = next;
        bar.el.style.transform = `scaleY(${next.toFixed(3)})`;
        moving = true;
      }
    }
    wave.active = moving;
  }

  // La waveform del hero pulsa solo quando è visibile.
  if ('IntersectionObserver' in window) {
    const waveIO = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const wave = waves.find((w) => w.el === entry.target);
        if (wave) wave.visible = entry.isIntersecting;
        if (!reduceMotion && entry.target.classList.contains('wave--live')) {
          entry.target.classList.toggle('is-playing', entry.isIntersecting);
        }
      });
    });
    waves.forEach((w) => waveIO.observe(w.el));
  }

  /* ---------- Simbolo © ---------- */

  const hero = document.querySelector('.hero');
  const symbol = document.querySelector('.symbol');
  const symbolTilt = document.querySelector('.symbol-tilt');
  const tilt = { x: 0, y: 0 };
  requestAnimationFrame(() => requestAnimationFrame(() => hero && hero.classList.add('is-ready')));
  // A disegno finito tolgo il tratteggio, così l'anello resta pulito e senza giunture.
  const ring = document.querySelector('.symbol__ring');
  if (ring) ring.addEventListener('transitionend', () => hero.classList.add('is-drawn'), { once: true });

  function updateSymbol() {
    if (!symbol || !symbolTilt) return;
    const y = Math.min(scrollY, window.innerHeight * 1.2);
    let tx = 0;
    let ty = 0;
    if (finePointer && y < window.innerHeight) {
      const r = symbol.getBoundingClientRect();
      tx = clamp((pointer.cx - (r.left + r.width / 2)) / r.width, -1, 1);
      ty = clamp((pointer.cy - (r.top + r.height / 2)) / r.height, -1, 1);
    }
    tilt.x = lerp(tilt.x, tx, 0.08);
    tilt.y = lerp(tilt.y, ty, 0.08);
    symbol.style.transform = `translateY(${(y * 0.12).toFixed(1)}px) rotate(${(y * -0.03).toFixed(2)}deg)`;
    symbolTilt.style.transform = `rotateY(${(tilt.x * 18).toFixed(2)}deg) rotateX(${(-tilt.y * 18).toFixed(2)}deg)`;
  }

  /* ---------- Luce cromata ---------- */

  // Una sola "luce" muove il riflesso di tutte le scritte e dei loghi cromati:
  // segue il mouse, oppure lo scroll sui telefoni, e respira lentamente da sola.
  const chromeGrad = document.getElementById('chrome');
  let light = 40;

  function updateLight(now) {
    const max = Math.max(1, root.scrollHeight - window.innerHeight);
    const source = finePointer && now - pointer.last < 4000 ? pointer.x : scrollY / max;
    const breathe = Math.sin(now / 2600) * 0.5 + 0.5;
    const target = 8 + 84 * (0.7 * source + 0.3 * breathe);
    const next = lerp(light, target, 0.06);
    if (Math.abs(next - light) < 0.02) return;
    light = next;
    root.style.setProperty('--lx', light.toFixed(2));
    if (chromeGrad) {
      const angle = -55 + light * 1.1;
      chromeGrad.setAttribute('gradientTransform', `rotate(${angle.toFixed(1)} .5 .5)`);
    }
  }

  /* ---------- Slogan ---------- */

  const marquees = [...document.querySelectorAll('.marquee')].map((el) => {
    const track = el.querySelector('.marquee__track');
    // Copie della traccia finché il nastro è lungo il doppio dello schermo.
    let guard = 0;
    while ((guard === 0 || el.scrollWidth < track.offsetWidth + window.innerWidth * 1.3) && guard++ < 8) {
      el.appendChild(track.cloneNode(true));
    }
    return { el, track, speed: Number(el.dataset.speed) || 1, x: 0, visible: true };
  });
  let direction = 1;

  if ('IntersectionObserver' in window) {
    const mIO = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const m = marquees.find((mm) => mm.el === entry.target);
        if (m) m.visible = entry.isIntersecting;
      });
    });
    marquees.forEach((m) => mIO.observe(m.el));
  }

  function updateMarquees(dt) {
    const boost = 1 + Math.min(scrollVel * 0.12, 7);
    marquees.forEach((m) => {
      if (!m.visible) return;
      const w = m.track.offsetWidth;
      if (!w) return;
      m.x -= m.speed * direction * boost * dt * 0.06;
      if (m.x <= -w) m.x += w;
      if (m.x > 0) m.x -= w;
      m.el.style.transform = `translate3d(${m.x.toFixed(1)}px, 0, 0)`;
    });
  }

  /* ---------- Manifesto, parola per parola ---------- */

  const wordBlocks = [...document.querySelectorAll('[data-words]')].map((block) => {
    const words = [];
    block.querySelectorAll('p').forEach((p) => {
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
    return { block, words, lit: -1 };
  });

  function updateWords() {
    wordBlocks.forEach((wb) => {
      const r = wb.block.getBoundingClientRect();
      const vh = window.innerHeight;
      const progress = clamp((vh * 0.88 - r.top) / (r.height + vh * 0.3), 0, 1);
      const lit = Math.round(progress * wb.words.length);
      if (lit === wb.lit) return;
      wb.words.forEach((w, i) => w.classList.toggle('is-lit', i < lit));
      wb.lit = lit;
    });
  }

  /* ---------- Loop ---------- */

  let prev = performance.now();
  function frame(now) {
    const dt = Math.min(64, now - prev);
    prev = now;

    const dy = scrollY - lastScrollY;
    lastScrollY = scrollY;
    if (Math.abs(dy) > 0.5) direction = dy > 0 ? 1 : -1;
    scrollVel = lerp(scrollVel, Math.abs(dy), 0.12);

    updateLight(now);
    updateSymbol();
    updateMarquees(dt);
    updateWords();
    waves.forEach((w) => { if (w.visible) updateWave(w, now); });
    requestAnimationFrame(frame);
  }

  if (reduceMotion) {
    root.style.setProperty('--lx', '40');
    wordBlocks.forEach((wb) => wb.words.forEach((w) => w.classList.add('is-lit')));
  } else {
    requestAnimationFrame(frame);
  }

  /* ---------- Luce sui riquadri ---------- */

  if (finePointer) {
    document.querySelectorAll('[data-spot]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--px', `${e.clientX - r.left}px`);
        el.style.setProperty('--py', `${e.clientY - r.top}px`);
      });
    });
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

  /* ---------- Credits: dal margine al centro ---------- */

  const credits = document.querySelector('.credits');
  if (credits) {
    const buttons = [...credits.querySelectorAll('.switch__btn')];
    let touched = false;

    const setState = (state) => {
      credits.dataset.state = state;
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.set === state)));
    };

    buttons.forEach((b) => b.addEventListener('click', () => {
      touched = true;
      setState(b.dataset.set);
    }));

    // La prima volta che il riquadro entra in vista, il nome sale al centro da solo.
    if ('IntersectionObserver' in window) {
      const once = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) {
          once.disconnect();
          setTimeout(() => { if (!touched) setState('after'); }, reduceMotion ? 300 : 1400);
        }
      }, { threshold: 0.6 });
      once.observe(credits);
    }
  }
})();
