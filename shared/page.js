// 마이포워더 도구 — 도구 페이지 공통 스크립트
// 1) tools.json에서 하단 섹션(기능 목록 · 만든 과정 · 프롬프트 구조 · 직접 만들어 보기 · 관련 도구)을 렌더한다.
//    직접 만들어 보기(kit): 시작 프롬프트 복사 · 만들기 키트(.md) · 데이터 내려받기 · 응용 프롬프트.
//    키트 글의 {{DATA_URL}}은 실제 데이터 주소로 바꿔 보여 준다.
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
  const COPY_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>';
  const DOWN_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 4v12M6 10l6 6 6-6M5 20h14"/></svg>';

  // 복사 + 알림(페이지에 .toast가 없으면 만든다)
  let toastTimer = null;
  function toast(msg) {
    let el = document.querySelector('.toast');
    if (!el) {
      el = Object.assign(document.createElement('div'), { className: 'toast' });
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {
      const ta = Object.assign(document.createElement('textarea'), { value: text });
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove(); return ok;
    }
  }

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

  // 직접 만들어 보기 — 프롬프트 본문은 init에서 kit.prompt를 읽어 채운다
  const abs = (href) => new URL(href, ROOT).href;
  function fillUrls(text, kit) {
    const json = kit.data?.find((d) => d.href.endsWith('.json'));
    return text.replace(/\{\{DATA_URL\}\}/g, json ? abs(json.href) : '(데이터 주소)');
  }
  function kitSection(kit) {
    const promptCard = kit.prompt ? `<article class="kit-card kit-card--wide">
        <span class="eyebrow">A · 10분 · Claude 채팅</span>
        <h3 class="heading-2">AI에게 바로 시키기</h3>
        <p class="body ink-2">이 프롬프트를 Claude 채팅에 붙여넣으면 HTML 파일 하나로 같은 도구가 만들어집니다. 데이터는 옆의 JSON을 받아 화면에서 불러오면 됩니다.</p>
        <pre class="kit-prompt" tabindex="0" data-kit-prompt>프롬프트를 불러오는 중입니다.</pre>
        <div class="kit-actions"><button class="btn btn-dark" type="button" data-kit-copy="prompt">${COPY_SVG}프롬프트 복사</button></div>
      </article>` : '';
    const guideCard = kit.guide ? `<article class="kit-card">
        <span class="eyebrow">B · 1~2시간 · AI 코딩 도구</span>
        <h3 class="heading-2">만들기 키트</h3>
        <p class="body ink-2">Claude Code·Cursor 같은 도구의 작업 폴더에 넣고 "kit 파일을 읽고 만들어 줘"라고 요청하세요. 데이터 신청부터 직접 갱신까지 혼자 할 수 있습니다.</p>
        <ul class="kit-list body"><li>UNI-PASS Open API 신청·호출 방법</li><li>필드·구분 추정·검색 규칙</li><li>단계별 프롬프트 6개</li><li>완성 확인 5가지</li></ul>
        <div class="kit-actions"><a class="btn btn-dark" href="${esc(abs(kit.guide))}" download>${DOWN_SVG}키트 내려받기 (.md)</a><a class="btn" href="${esc(abs(kit.guide))}" target="_blank" rel="noopener">미리 보기</a></div>
      </article>` : '';
    const dataCard = kit.data?.length ? `<article class="kit-card">
        <span class="eyebrow">바로 쓰기</span>
        <h3 class="heading-2">데이터 그대로 쓰기</h3>
        <p class="body ink-2">만들기보다 쓰는 게 먼저라면 정리된 데이터를 받아 엑셀이나 내 도구에 바로 넣으세요. 출처(관세청 UNI-PASS)와 기준일을 함께 적어 주세요.</p>
        <ul class="kit-data">${kit.data.map((d) => `<li><div><span class="label">${esc(d.label)}</span><span class="caption ink-3">${esc(d.note || '')}</span></div><a class="btn btn-sm" href="${esc(abs(d.href))}" download>${DOWN_SVG}받기</a></li>`).join('')}</ul>
      </article>` : '';
    const ideas = kit.ideas?.length ? `<div class="kit-ideas">
        <div class="section__head"><span class="eyebrow">C · 응용</span><h3 class="heading-2">내 것으로 바꿔 보기</h3></div>
        <div class="idea-grid">${kit.ideas.map((it, i) => `<article class="idea-card">
          <h4 class="label">${esc(it.title)}</h4>
          <p class="caption ink-2 idea-card__prompt">${esc(fillUrls(it.prompt, kit))}</p>
          <button class="btn btn-sm" type="button" data-kit-copy="idea" data-idx="${i}">${COPY_SVG}프롬프트 복사</button>
        </article>`).join('')}</div>
      </div>` : '';
    return section('직접 만들어 보기', `<p class="body-l ink-2 kit-lead">이 도구는 누구나 AI와 함께 다시 만들어 내 것으로 쓸 수 있습니다. 쓰는 것부터 시작해도, 처음부터 만들어 봐도 좋습니다.</p>
      <div class="kit-grid">${promptCard}${guideCard}${dataCard}</div>${ideas}`);
  }
  async function hydrateKit(host, kit) {
    let promptText = '';
    const pre = host.querySelector('[data-kit-prompt]');
    if (pre && kit.prompt) {
      try {
        const res = await fetch(abs(kit.prompt), { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        promptText = fillUrls(await res.text(), kit);
        pre.textContent = promptText;
      } catch (e) {
        pre.textContent = '프롬프트를 불러오지 못했습니다.';
        console.warn('키트 프롬프트를 읽지 못했습니다:', e);
      }
    }
    host.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-kit-copy]');
      if (!btn) return;
      const text = btn.dataset.kitCopy === 'prompt' ? promptText : fillUrls(kit.ideas[Number(btn.dataset.idx)].prompt, kit);
      if (!text) return;
      toast((await copyText(text)) ? '프롬프트를 복사했습니다 — AI 채팅에 붙여넣으세요' : '복사하지 못했습니다. 직접 선택해 복사하세요.');
    });
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
      const hint = tool.kit?.guide ? ' 단계별로 따라 할 수 있는 프롬프트는 아래 "직접 만들어 보기"의 만들기 키트에 있습니다.' : '';
      parts.push(section('프롬프트 구조', `<p class="body ink-2">AI에게 이 ${tool.promptStructure.length}단계로 나눠 요청해 만들었습니다.${hint}</p><div class="prompt-card">${tool.promptStructure
        .map((p, i) => `<div class="prompt-step"><span class="prompt-step__no">${pad2(i + 1)}</span><span class="body prompt-step__title">${esc(p.title)}</span></div>`)
        .join('')}</div>`));
    }
    if (tool.kit) parts.push(kitSection(tool.kit));
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
          if (tool.kit) hydrateKit(host, tool.kit);
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
