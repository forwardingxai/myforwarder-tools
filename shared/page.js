// 마이포워더 도구 — 도구 페이지 공통 스크립트
// 1) tools.json에서 하단 섹션(기능 목록 · 만든 과정 · 프롬프트 구조 · 관련 도구)을 렌더한다.
//    자리: <div data-tool-sections data-slug="{slug}"></div>, 머리 메타: <p data-tool-meta></p>
// 2) [data-reveal] 요소를 뷰포트에 들어올 때 한 번 드러낸다(prefers-reduced-motion이면 즉시 표시).
//    [data-reveal-words]는 단어 단위로 나눠 40ms 간격으로 드러낸다.
// 3) .site-nav에 스크롤하면 .is-scrolled(그림자)를 붙인다.
(() => {
  const ROOT = new URL('..', document.currentScript.src); // shared/의 상위 = 저장소 루트
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const pad2 = (n) => String(n).padStart(2, '0');
  const AREA_LABEL = { sales: '영업', ops: '운영' };
  const LOCK_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

  // 헤드라인을 단어 단위 span으로 나눈다(텍스트만 있는 요소 전제)
  function splitWords(root = document) {
    root.querySelectorAll('[data-reveal-words]:not([data-split])').forEach((el) => {
      const words = el.textContent.trim().split(/\s+/);
      el.setAttribute('aria-label', el.textContent.trim());
      el.innerHTML = words.map((w, i) => `<span class="w" style="--i:${i}" aria-hidden="true">${esc(w)}</span>`).join(' ');
      el.setAttribute('data-split', '');
    });
  }

  // 스크롤 리빌
  let observer = null;
  function reveal(root = document) {
    splitWords(root);
    const els = root.querySelectorAll('[data-reveal]:not(.is-revealed), [data-reveal-words]:not(.is-revealed)');
    if (reducedMotion || !('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('is-revealed'));
      return;
    }
    observer ||= new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-revealed');
        observer.unobserve(e.target);
      }),
      { rootMargin: '0px 0px -8% 0px' },
    );
    els.forEach((el) => observer.observe(el));
  }
  // 한 번에 크게 스크롤하면 관찰자가 지나친 요소를 놓칠 수 있어, 이미 화면 위로 지나간 요소도 드러낸다.
  let ticking = false;
  const nav = document.querySelector('.site-nav');
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      nav?.classList.toggle('is-scrolled', window.scrollY > 8);
      document.querySelectorAll('[data-reveal]:not(.is-revealed), [data-reveal-words]:not(.is-revealed)').forEach((el) => {
        if (el.getBoundingClientRect().top < window.innerHeight) {
          el.classList.add('is-revealed');
          observer?.unobserve(el);
        }
      });
    });
  }, { passive: true });
  document.documentElement.classList.add('reveal-ready');

  let sectionNo = 0;
  const section = (title, body) =>
    `<section class="section" data-reveal><div class="section__head"><span class="eyebrow">${pad2(++sectionNo)}</span><h2 class="heading-2">${esc(title)}</h2></div>${body}</section>`;

  function toolCard(t) {
    const thumb = t.thumb ? `<img src="${esc(new URL(t.thumb, ROOT))}" alt="" loading="lazy">` : '';
    return `<a class="tool-card" href="${esc(new URL(`tools/${t.slug}.html`, ROOT))}">
      <div class="tool-card__thumb">${thumb}</div>
      <div class="tool-card__tags"><span class="tag tag-area" data-area="${esc(t.area)}">${esc(AREA_LABEL[t.area] || t.area)}</span><span class="tag">${esc(t.stage)}</span></div>
      <h3 class="heading-2">${esc(t.name)}</h3>
      <p class="body ink-2">${esc(t.summary)}</p>
      <p class="caption tool-card__meta">D${pad2(t.day)} · ${esc(t.date)}</p>
    </a>`;
  }

  function render(tool, all) {
    const parts = [];
    if (tool.features?.length) {
      parts.push(section('기능 목록', `<ol class="feature-list">${tool.features
        .map((f, i) => `<li><span class="feature-list__no">${pad2(i + 1)}</span><span class="body">${esc(f)}</span></li>`)
        .join('')}</ol>`));
    }
    if (tool.history?.length) {
      parts.push(section('만든 과정', `<ol class="timeline">${tool.history
        .map((h) => `<li><span class="timeline__date">${esc(h.date)}</span><span class="label">${esc(h.step)}</span><span class="body ink-2 timeline__note">${esc(h.note)}</span></li>`)
        .join('')}</ol>`));
    }
    if (tool.promptStructure?.length) {
      parts.push(section('프롬프트 구조', `<p class="body ink-2">단계 제목만 공개합니다. 자물쇠 단계의 내용은 비공개입니다.</p><div class="prompt-card">${tool.promptStructure
        .map((p, i) => `<div class="prompt-step${p.open ? '' : ' is-locked'}"><span class="prompt-step__no">${pad2(i + 1)}</span><span class="body prompt-step__title">${esc(p.title)}</span>${p.open ? '<span></span>' : `<span class="prompt-step__lock">${LOCK_SVG}비공개</span>`}</div>`)
        .join('')}</div>`));
    }
    // 관련 도구: related가 비어 있으면 같은 영역 최신 3개(live만, 자기 자신 제외)
    let related = (tool.related || []).map((s) => all.find((t) => t.slug === s)).filter(Boolean);
    if (!related.length) {
      related = all
        .filter((t) => t.slug !== tool.slug && t.area === tool.area && t.status === 'live')
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 3);
    }
    if (related.length) parts.push(section('관련 도구', `<div class="tool-grid">${related.slice(0, 3).map(toolCard).join('')}</div>`));
    return parts.join('');
  }

  async function init() {
    const host = document.querySelector('[data-tool-sections]');
    const meta = document.querySelector('[data-tool-meta]');
    if (host) {
      host.classList.add('tool-sections');
      try {
        const res = await fetch(new URL('tools.json', ROOT), { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const all = await res.json();
        const tool = all.find((t) => t.slug === host.dataset.slug);
        if (tool) {
          host.innerHTML = render(tool, all);
          if (meta) meta.textContent = [`D${pad2(tool.day)}`, tool.date, tool.hours > 0 ? `${tool.hours}h` : ''].filter(Boolean).join(' · ');
        }
      } catch (e) {
        console.warn('tools.json을 읽지 못했습니다:', e);
      }
    }
    reveal();
  }

  window.MFT = { reveal };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
