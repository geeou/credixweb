(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Waveform: barre generate in modo deterministico (stesso disegno a ogni visita).
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function seeded(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function buildWave(el) {
    const bars = Number(el.dataset.bars) || 96;
    const rand = seeded(Number(el.dataset.seed) || 1);
    const gap = 2;
    const w = 4;
    const width = bars * (w + gap) - gap;
    const height = 100;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'none');

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

    for (let i = 0; i < bars; i++) {
      const t = i / (bars - 1);
      // Inviluppo: più alto al centro, come nel brand book.
      const env = 0.22 + 0.78 * Math.pow(Math.sin(Math.PI * t), 0.9);
      const h = Math.max(8, height * env * (0.45 + 0.55 * rand()));
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', i * (w + gap));
      rect.setAttribute('y', (height - h) / 2);
      rect.setAttribute('width', w);
      rect.setAttribute('height', h);
      rect.setAttribute('fill', `url(#${gid})`);
      rect.style.setProperty('--d', `${(1.1 + rand() * 1.4).toFixed(2)}s`);
      rect.style.setProperty('--delay', `${(-rand() * 2).toFixed(2)}s`);
      rect.style.setProperty('--s', (0.35 + rand() * 0.5).toFixed(2));
      svg.appendChild(rect);
    }
    el.appendChild(svg);
  }

  document.querySelectorAll('.wave').forEach(buildWave);

  // La waveform del hero si muove solo quando è visibile.
  const liveWave = document.querySelector('.wave--live');
  if (liveWave && !reduceMotion && 'IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      liveWave.classList.toggle('is-playing', entry.isIntersecting);
    }).observe(liveWave);
  }

  // Simbolo ©: si disegna all'apertura, poi ruota leggermente con lo scroll.
  const hero = document.querySelector('.hero');
  const symbol = document.querySelector('.symbol');
  requestAnimationFrame(() => requestAnimationFrame(() => hero && hero.classList.add('is-ready')));
  // A disegno finito tolgo il tratteggio, così l'anello resta pulito e senza giunture.
  const ring = document.querySelector('.symbol__ring');
  if (ring) ring.addEventListener('transitionend', () => hero.classList.add('is-drawn'), { once: true });

  if (symbol && !reduceMotion) {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = Math.min(window.scrollY, window.innerHeight * 1.2);
        symbol.style.transform = `translate3d(0, ${y * 0.12}px, 0) rotate(${y * -0.03}deg)`;
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // Entrate: titolo, poi testo, poi immagine, sfalsati.
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

  // Credits: dal margine al centro.
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
