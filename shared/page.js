// 마이포워더 도구 — 도구 페이지 공통 스크립트
// 1) tools.json에서 하단 섹션(기능 목록 · 만든 과정 · 프롬프트 구조 · 직접 만들어 보기 · 관련 도구)을 렌더한다.
//    직접 만들어 보기(kit): 시작 프롬프트 복사 · 만들기 키트(.md) · 데이터 내려받기 · 응용 프롬프트.
//    키트 글의 {{DATA_URL}}은 실제 데이터 주소로 바꿔 보여 준다.
//    자리: <div data-tool-sections data-slug="{slug}"></div>, 머리 메타: <p data-tool-meta></p>
// 2) [data-reveal] 요소를 뷰포트에 들어올 때 한 번 드러낸다(prefers-reduced-motion이면 즉시 표시).
//    [data-reveal-words]는 단어 단위로 나눠 40ms 간격으로 드러낸다.
// 3) .site-nav에 스크롤하면 .is-scrolled(그림자)를 붙인다.
// 4) 화면 내 목차(.page-toc): 오른쪽 아래 떠 있는 작은 반투명 상자. 실행 영역(.tool-run) + 하단 섹션을 보여 주고 현재 위치를 표시한다.
//    펼친 채 시작한다. 768px 이하는 화면을 가리지 않게 알약 하나로 접은 채 시작한다. 접기·펼치기는 기억한다.
// 5) site.json의 연락(contact.links): 첫 링크가 오류 제보 링크([data-contact-link])의 주소가 되고,
//    [data-contact-links] 자리에 모든 채널 버튼을 그린다.
// 7) 공유 버튼([data-share] 자리): "공유하기"(기기 공유창 → 카카오톡 등, 검정 주 버튼) + "링크 복사"(정식 주소 = canonical).
//    공유하기는 navigator.share를 지원하는 브라우저에서만 보이고, 없으면 링크 복사가 주 버튼이 된다.
//    (카카오 SDK 전용 버튼은 2026-10-20 시험 후 뺐다 — 공유하기로 카카오톡 전달·썸네일이 정상이라 중복)
// 6) 방문 분석: 배포된 사이트에서만 Vercel Web Analytics(같은 도메인 /_vercel/insights)를 붙인다. 로컬 미리보기에서는 불러오지 않는다.
(() => {
  if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
    const s = Object.assign(document.createElement('script'), { src: '/_vercel/insights/script.js', defer: true });
    document.head.appendChild(s);
  }
})();
(() => {
  const ROOT = new URL('..', document.currentScript.src); // shared/의 상위 = 저장소 루트
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const pad2 = (n) => String(n).padStart(2, '0');
  const AREA_LABEL = { sales: '영업', ops: '운영' };
  const COPY_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>';
  const CHAT_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 4c4.97 0 9 3.13 9 7s-4.03 7-9 7c-.9 0-1.77-.1-2.6-.3L5 20l1.2-3.6C4.2 15.1 3 13.2 3 11c0-3.87 4.03-7 9-7z"/></svg>';
  const LINK_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/></svg>';
  const SHARE_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
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

  // 공유 버튼 — 정식 주소(canonical)를 쓴다. 로컬 미리보기에서도 배포 주소가 복사된다
  function renderShare() {
    const hosts = document.querySelectorAll('[data-share]');
    if (!hosts.length) return;
    const meta = (p) => document.querySelector(`meta[property="${p}"]`)?.content;
    const url = document.querySelector('link[rel="canonical"]')?.href || location.href.split('#')[0];
    const data = { title: meta('og:title') || document.title, text: meta('og:description') || '', url };
    const canShare = typeof navigator.share === 'function';
    hosts.forEach((host) => {
      // 주 버튼(검정)은 공유하기, 공유창이 없는 브라우저에서는 링크 복사
      host.innerHTML = [
        canShare ? `<button class="btn btn-sm btn-dark" type="button" data-share-act="share">${SHARE_SVG}공유하기</button>` : '',
        `<button class="btn btn-sm ${canShare ? 'btn-outline' : 'btn-dark'}" type="button" data-share-act="copy">${LINK_SVG}링크 복사</button>`,
      ].join('');
      host.addEventListener('click', async (e) => {
        const act = e.target.closest('[data-share-act]')?.dataset.shareAct;
        if (act === 'copy') {
          toast((await copyText(url)) ? '링크를 복사했어요. 카카오톡에 붙여넣으세요' : '복사하지 못했어요. 주소창의 링크를 복사해 주세요.');
        } else if (act === 'share') {
          try { await navigator.share(data); } catch (err) {
            if (err?.name !== 'AbortError') toast((await copyText(url)) ? '공유창을 열지 못해 링크를 복사했어요' : '공유하지 못했어요');
          }
        }
      });
    });
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
  let tocUpdate = null; // buildToc가 채운다
  const nav = document.querySelector('.site-nav');
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      nav?.classList.toggle('is-scrolled', window.scrollY > 8);
      tocUpdate?.();
      document.querySelectorAll('[data-reveal]:not(.is-revealed), [data-reveal-words]:not(.is-revealed)').forEach((el) => {
        if (el.getBoundingClientRect().top < window.innerHeight) {
          el.classList.add('is-revealed');
          observer?.unobserve(el);
        }
      });
    });
  }, { passive: true });
  document.documentElement.classList.add('reveal-ready');

  // 화면 내 목차
  const TOC_KEY = 'mft:site:toc:v2'; // v2: 기본값을 "펼침"으로 바꾸며 예전 "접힘" 기록을 초기화
  const LIST_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>';
  const CHEVRON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  function buildToc(host) {
    const entries = [];
    const run = document.querySelector('.tool-run');
    if (run) {
      run.id ||= 'tool-run';
      entries.push({ id: run.id, label: run.dataset.tocLabel || '도구 쓰기' });
    }
    host.querySelectorAll(':scope > section').forEach((sec, i) => {
      const label = sec.dataset.tocLabel || sec.querySelector('h2')?.textContent.trim();
      if (!label) return;
      sec.id ||= `section-${pad2(i + 1)}`;
      entries.push({ id: sec.id, label });
    });
    if (entries.length < 2) return;

    const toc = document.createElement('nav');
    toc.className = 'page-toc';
    toc.setAttribute('aria-label', '이 페이지의 목차');
    toc.innerHTML = `
      <button class="page-toc__pill" type="button" aria-expanded="false" aria-controls="page-toc-panel" title="이 페이지의 목차">
        ${LIST_SVG}<span class="page-toc__current"></span><span class="page-toc__count"></span>
      </button>
      <div class="page-toc__panel" id="page-toc-panel">
        <div class="page-toc__head">
          <span class="eyebrow">이 페이지</span>
          <button class="btn-icon page-toc__close" type="button" aria-label="목차 접기">${CHEVRON_SVG}</button>
        </div>
        <ol class="page-toc__list">${entries.map((e) => `<li><a href="#${esc(e.id)}">${esc(e.label)}</a></li>`).join('')}</ol>
      </div>`;
    document.body.appendChild(toc);
    document.documentElement.classList.add('has-toc');

    const links = [...toc.querySelectorAll('.page-toc__list a')];
    const pill = toc.querySelector('.page-toc__pill');
    const current = toc.querySelector('.page-toc__current');
    const count = toc.querySelector('.page-toc__count');
    const mobile = window.matchMedia('(max-width: 768px)').matches;
    let saved = null;
    try { saved = localStorage.getItem(TOC_KEY); } catch { /* 저장 불가 환경 */ }
    const setOpen = (open, remember) => {
      toc.classList.toggle('is-open', open);
      document.documentElement.classList.toggle('toc-open', open); // 본문이 목차에 가리지 않게 오른쪽 여백(layout.css)
      pill.setAttribute('aria-expanded', open);
      if (remember) { try { localStorage.setItem(TOC_KEY, open ? 'open' : 'closed'); } catch { /* 저장 불가 환경 */ } }
    };
    setOpen(mobile ? false : saved !== 'closed', false);
    pill.addEventListener('click', () => setOpen(true, !mobile));
    toc.querySelector('.page-toc__close').addEventListener('click', () => setOpen(false, !mobile));
    // 모바일은 항목을 고르거나, 바깥을 누르거나, Esc를 누르면 패널을 접어 화면을 가리지 않는다
    links.forEach((a) => a.addEventListener('click', () => { if (mobile) setOpen(false, false); }));
    if (mobile) {
      document.addEventListener('click', (e) => {
        if (toc.classList.contains('is-open') && !toc.contains(e.target)) setOpen(false, false);
      });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false, false); });
    }

    tocUpdate = () => {
      const line = window.innerHeight * 0.35;
      let idx = 0;
      entries.forEach((e, i) => {
        const el = document.getElementById(e.id);
        if (el && el.getBoundingClientRect().top <= line) idx = i;
      });
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) idx = entries.length - 1;
      links.forEach((a, i) => {
        a.classList.toggle('is-active', i === idx);
        if (i === idx) a.setAttribute('aria-current', 'location');
        else a.removeAttribute('aria-current');
      });
      current.textContent = entries[idx].label;
      count.textContent = `${idx + 1}/${entries.length}`;
    };
    tocUpdate();
    window.addEventListener('resize', tocUpdate, { passive: true });
  }

  let sectionNo = 0;
  const section = (title, body) => {
    const n = ++sectionNo;
    return `<section class="section" id="section-${pad2(n)}" data-reveal><div class="section__head"><span class="eyebrow">${pad2(n)}</span><h2 class="heading-2">${esc(title)}</h2></div>${body}</section>`;
  };

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
        <h3 class="heading-2">프롬프트 하나로 만들기</h3>
        <p class="body ink-2">아래 글을 Claude 채팅에 그대로 붙여넣으세요. 파일 하나짜리 같은 도구가 완성돼요. 데이터는 옆에서 JSON을 받아 화면에서 불러오면 끝이에요.</p>
        <pre class="kit-prompt" tabindex="0" data-kit-prompt>프롬프트를 불러오고 있어요.</pre>
        <div class="kit-actions"><button class="btn btn-dark" type="button" data-kit-copy="prompt">${COPY_SVG}프롬프트 복사</button></div>
      </article>` : '';
    const guideCard = kit.guide ? `<article class="kit-card">
        <span class="eyebrow">B · 1~2시간 · Claude Code·Cursor</span>
        <h3 class="heading-2">만들기 키트로 제대로 만들기</h3>
        <p class="body ink-2">데이터 신청부터 수집, 화면, 검증까지 제가 거친 순서를 파일 하나에 담았어요. AI 코딩 도구에 넣고 "키트대로 만들어 줘"라고만 하면 돼요.</p>
        <ul class="kit-list body"><li>UNI-PASS API 신청부터 호출까지</li><li>직접 부딪혀 보고 찾은 함정과 해결법</li><li>단계별 프롬프트 6개</li><li>완성을 확인하는 체크리스트 5가지</li></ul>
        <div class="kit-actions"><a class="btn btn-dark" href="${esc(abs(kit.guide))}" download>${DOWN_SVG}키트 받기 (.md)</a><a class="btn" href="${esc(abs(kit.guide))}" target="_blank" rel="noopener">미리 보기</a></div>
      </article>` : '';
    const dataCard = kit.data?.length ? `<article class="kit-card">
        <span class="eyebrow">바로 쓰기</span>
        <h3 class="heading-2">데이터만 가져가기</h3>
        <p class="body ink-2">만들 시간이 없다면 정리된 데이터부터 받아 가세요. 엑셀에서 바로 열려요. 쓰실 때 출처(관세청 UNI-PASS)와 기준일은 꼭 함께 적어 주세요.</p>
        <ul class="kit-data">${kit.data.map((d) => `<li><div><span class="label">${esc(d.label)}</span><span class="caption ink-3">${esc(d.note || '')}</span></div><a class="btn btn-sm" href="${esc(abs(d.href))}" download>${DOWN_SVG}받기</a></li>`).join('')}</ul>
      </article>` : '';
    const ideas = kit.ideas?.length ? `<div class="kit-ideas">
        <div class="section__head"><span class="eyebrow">C · 응용</span><h3 class="heading-2">내 업무에 맞게 바꿔 보기</h3><p class="body ink-2">프롬프트 몇 줄만 바꿔도 전혀 다른 도구가 돼요. 하나 골라 그대로 붙여넣어 보세요.</p></div>
        <div class="idea-grid">${kit.ideas.map((it, i) => `<article class="idea-card">
          <h4 class="label">${esc(it.title)}</h4>
          <p class="caption ink-2 idea-card__prompt">${esc(fillUrls(it.prompt, kit))}</p>
          <button class="btn btn-sm" type="button" data-kit-copy="idea" data-idx="${i}">${COPY_SVG}프롬프트 복사</button>
        </article>`).join('')}</div>
      </div>` : '';
    return section('나도 만들어 보기', `<p class="body-l ink-2 kit-lead">코딩을 몰라도 괜찮아요. 이 도구도 AI에게 말로 설명해서 만들었거든요. 만든 방법을 그대로 열어 둘게요. 가져다 써도 좋고, 내 업무에 맞게 고쳐 봐도 좋아요.</p>
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
        pre.textContent = '프롬프트를 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.';
        console.warn('키트 프롬프트를 읽지 못했습니다:', e);
      }
    }
    host.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-kit-copy]');
      if (!btn) return;
      const text = btn.dataset.kitCopy === 'prompt' ? promptText : fillUrls(kit.ideas[Number(btn.dataset.idx)].prompt, kit);
      if (!text) return;
      toast((await copyText(text)) ? '프롬프트를 복사했어요. AI 채팅창에 붙여넣으세요' : '복사하지 못했어요. 글을 직접 선택해 복사해 주세요.');
    });
  }

  // 만든 사람·다음 걸음(site.json). 칸이 비어 있으면 그리지 않는다 — 지어낸 소개나 빈 링크를 내보내지 않기 위해.
  function funnelHtml(site = {}) {
    const c = site.creator || {};
    const cta = site.cta || {};
    const out = [];
    if (c.name) {
      // 링크별 선택 항목: style("gray" → .btn-gray 강조), icon("chat" → 말풍선)
      const links = (c.links || []).filter((l) => l.label && l.href)
        .map((l) => `<a class="btn btn-sm${l.style ? ` btn-${esc(l.style)}` : ''}" href="${esc(l.href)}"${external(l.href)}>${l.icon === 'chat' ? CHAT_SVG : ''}${esc(l.label)}</a>`).join('');
      out.push(section('만든 사람', `<div class="creator-card">
        <div class="creator-card__head"><h3 class="heading-2">${esc(c.name)}</h3>${c.role ? `<p class="body ink-2">${esc(c.role)}</p>` : ''}</div>
        ${c.bio ? `<p class="body">${esc(c.bio)}</p>` : ''}
        ${links ? `<div class="kit-actions">${links}</div>` : ''}
      </div>`));
    }
    // 버튼: cta.actions 배열(첫 번째가 주 버튼). 예전 형식(primary·secondary)도 받는다
    const actions = (cta.actions || [cta.primary, cta.secondary]).filter((a) => a?.label && a?.href);
    if (cta.title && actions.length) {
      out.push(`<section class="cta-band" id="next-steps" data-toc-label="${esc(cta.tocLabel || '다음 걸음')}" data-reveal>
        ${cta.eyebrow ? `<span class="cta-band__eyebrow">${esc(cta.eyebrow)}</span>` : ''}
        <h2 class="display-l cta-band__title">${esc(cta.title)}</h2>
        ${cta.body ? `<p class="body-l cta-band__body">${esc(cta.body)}</p>` : ''}
        <div class="cta-band__actions">
          ${actions.map((a, i) => `<a class="btn ${i === 0 ? 'cta-band__primary' : 'cta-band__secondary'}" href="${esc(a.href)}"${external(a.href)}>${esc(a.label)}</a>`).join('')}
        </div>
      </section>`);
    }
    return out.join('');
  }
  let siteConfig = {};
  const isMail = (href) => href.startsWith('mailto:');
  const external = (href) => (isMail(href) ? '' : ' target="_blank" rel="noopener"');
  function applyContact(site = siteConfig) {
    const links = (site.contact?.links || []).filter((l) => l.label && l.href);
    if (!links.length) return;
    const primary = links[0].href;
    // 오류 제보 링크: 첫 채널로. 메일이면 도구별 제목(data-contact-subject)을 미리 채운다
    document.querySelectorAll('[data-contact-link]').forEach((a) => {
      const subject = a.dataset.contactSubject;
      a.href = isMail(primary) && subject ? `${primary}?subject=${encodeURIComponent(subject)}` : primary;
      if (!isMail(primary)) { a.target = '_blank'; a.rel = 'noopener'; }
      a.hidden = false;
    });
    document.querySelectorAll('[data-contact-lead]').forEach((el) => { if (site.contact.lead) el.textContent = site.contact.lead; });
    document.querySelectorAll('[data-contact-links]').forEach((box) => {
      box.innerHTML = links
        .map((l, i) => `<a class="btn${i === 0 ? ' btn-dark' : ''}" href="${esc(l.href)}"${external(l.href)}>${esc(l.label)}</a>`)
        .join('');
    });
  }

  function render(tool, all, site) {
    const parts = [];
    if (tool.features?.length) {
      parts.push(section('할 수 있는 일', `<ol class="feature-list">${tool.features
        .map((f, i) => `<li><span class="feature-list__no">${pad2(i + 1)}</span><span class="body">${esc(f)}</span></li>`)
        .join('')}</ol>`));
    }
    if (tool.history?.length) {
      parts.push(section('만든 과정', `<ol class="timeline">${tool.history
        .map((h) => `<li><span class="timeline__date">${esc(h.date)}</span><span class="label">${esc(h.step)}</span><span class="body ink-2 timeline__note">${esc(h.note)}</span></li>`)
        .join('')}</ol>`));
    }
    if (tool.promptStructure?.length) {
      const n = tool.promptStructure.length;
      const hint = tool.kit?.guide ? ' 단계마다 쓴 프롬프트는 아래 만들기 키트에 그대로 담았어요.' : '';
      parts.push(section(`AI에게 맡긴 ${n}단계`, `<p class="body ink-2">한 번에 다 시키지 않고, ${n}단계로 나눠 AI와 주고받으며 만들었어요.${hint}</p><div class="prompt-card">${tool.promptStructure
        .map((p, i) => `<div class="prompt-step"><span class="prompt-step__no">${pad2(i + 1)}</span><span class="body prompt-step__title">${esc(p.title)}</span></div>`)
        .join('')}</div>`));
    }
    if (tool.kit) parts.push(kitSection(tool.kit));
    parts.push(funnelHtml(site));
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

  const loadSite = () =>
    fetch(new URL('site.json', ROOT), { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));

  async function init() {
    const host = document.querySelector('[data-tool-sections]');
    const meta = document.querySelector('[data-tool-meta]');
    const funnelHost = document.querySelector('[data-site-funnel]');
    const site = await loadSite();
    siteConfig = site;
    renderShare();
    applyContact(site);
    if (funnelHost) funnelHost.innerHTML = funnelHtml(site);
    if (host) {
      host.classList.add('tool-sections');
      try {
        const res = await fetch(new URL('tools.json', ROOT), { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const all = await res.json();
        const tool = all.find((t) => t.slug === host.dataset.slug);
        if (tool) {
          host.innerHTML = render(tool, all, site);
          if (tool.kit) hydrateKit(host, tool.kit);
          buildToc(host);
          if (meta) meta.textContent = [`D${pad2(tool.day)}`, tool.date, tool.hours > 0 ? `${tool.hours}h` : ''].filter(Boolean).join(' · ');
        }
      } catch (e) {
        console.warn('tools.json을 읽지 못했습니다:', e);
      }
    }
    reveal();
  }

  // 도구 화면이 나중에 그린 오류 제보 링크에도 연락 주소를 붙일 수 있게 열어 둔다
  window.MFT = { reveal, applyContact: () => applyContact() };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
