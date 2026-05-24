'use strict';

if (!window.__linkedinScraperV424) {
window.__linkedinScraperV424 = true;

const SCRAPER_TAG = '[LinkedIn Scraper]';

const POST_SELECTOR = '[class*="feed-shared-update-v2"][data-urn*="activity"]';
const NESTED_RESHARE_SELECTORS = [
  '[class*="update-components-mini-update-v2"]',
  '[class*="reshare"]',
  '[class*="shared-update"]',
  '[class*="feed-shared-mini-update"]',
  '[class*="repost"]',
];

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/hasztag\s*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseLinkedInDate(str) {
  if (!str) return new Date().toISOString().split('T')[0];
  const s = str.replace('•', '').toLowerCase().trim();
  const now = new Date();
  if (/godz|min|just|s\.|h\b|g\./.test(s))
    return now.toISOString().split('T')[0];
  const d = s.match(/(\d+)\s*(d\.|dni|day)/);
  if (d) { now.setDate(now.getDate() - parseInt(d[1], 10));
    return now.toISOString().split('T')[0]; }
  const w = s.match(/(\d+)\s*(tyg|tydz|week|w\.)/);
  if (w) { now.setDate(now.getDate() - parseInt(w[1], 10) * 7);
    return now.toISOString().split('T')[0]; }
  const mo = s.match(/(\d+)\s*(mies|month|mo\.)/);
  if (mo) { now.setMonth(now.getMonth() - parseInt(mo[1], 10));
    return now.toISOString().split('T')[0]; }
  const y = s.match(/(\d+)\s*(rok|year|y\.)/);
  if (y) { now.setFullYear(now.getFullYear() - parseInt(y[1], 10));
    return now.toISOString().split('T')[0]; }
  return now.toISOString().split('T')[0];
}

function getProfileInfo() {
  const nameSelectors = [
    'h3.single-line-truncate.t-16.t-black.t-bold.mt2',
    'h1.single-line-truncate',
    'h1[class*="t-bold"]',
    'h1.text-heading-xlarge',
  ];
  let name = '';
  let title = '';
  for (const sel of nameSelectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText.trim()) { name = el.innerText.trim(); break; }
  }
  if (!name) {
    const m = document.title.match(/^(.+?)\s*[|\-–]/);
    if (m) name = m[1].trim();
  }
  const titleEl = document.querySelector(
    'h4.t-14.t-black--light.t-normal.mb1, h2[class*="t-14"]'
  );
  if (titleEl) title = titleEl.innerText.trim();
  console.log(SCRAPER_TAG, 'Profil:', name);
  return { name, title };
}

function findPostContainers() {
  const all = document.querySelectorAll(POST_SELECTOR);

  const topLevel = Array.from(all).filter((el) => {
    let parent = el.parentElement;
    while (parent) {
      if (parent.matches(POST_SELECTOR)) return false;
      parent = parent.parentElement;
    }
    return true;
  });

  let posts = topLevel;

  if (posts.length === 0) {
    const fallback = document.querySelectorAll('[data-urn*="activity"]');
    posts = Array.from(fallback).filter((el) => {
      let parent = el.parentElement;
      while (parent) {
        if (parent.getAttribute?.('data-urn')?.includes('activity')) return false;
        parent = parent.parentElement;
      }
      return el.querySelector('[dir="ltr"], [class*="commentary"]');
    });
    console.log(SCRAPER_TAG, 'Fallback data-urn:', posts.length);
  }

  console.log(SCRAPER_TAG, 'Znaleziono postów:', posts.length);
  return posts;
}

function getDate(container) {
  const el = container.querySelector(
    'span[class*="update-components-actor__sub-description"]'
  );
  if (el) return el.innerText.replace('•', '').trim();
  return '';
}

function expandSeeMore(container) {
  container.querySelectorAll(
    '[class*="inline-show-more"], [class*="see-more"], button[aria-label*="więcej"]'
  ).forEach((btn) => {
    try { btn.click(); } catch (e) { /* ignore */ }
  });
}

function getFullText(container) {
  if (!container) return '';
  expandSeeMore(container);

  const spans = container.querySelectorAll('span[dir="ltr"]');
  let longest = '';
  spans.forEach((s) => {
    const t = s.innerText.trim();
    if (t.length > longest.length) longest = t;
  });

  if (!longest) {
    const comm = container.querySelector(
      '[class*="commentary"], [class*="update-components-text"]'
    );
    if (comm) longest = comm.innerText.trim();
  }

  return cleanText(longest);
}

function getReactions(container) {
  const el = container.querySelector('[class*="reactions-count"]');
  if (el && el.innerText.trim()) return el.innerText.trim();
  const btn = container.querySelector('[aria-label*="reakcji"], [aria-label*="reaction"]');
  if (btn) {
    const m = btn.getAttribute('aria-label').match(/(\d+)/);
    if (m) return m[1];
  }
  return '0';
}

function getComments(container) {
  const spans = container.querySelectorAll('span');
  for (const s of spans) {
    const t = s.innerText.trim();
    const m = t.match(/^(\d+)\s+komentarz/i);
    if (m) return m[1];
  }
  return '0';
}

function findNestedContainer(container) {
  for (const sel of NESTED_RESHARE_SELECTORS) {
    const nested = container.querySelector(sel);
    if (nested && nested !== container) return nested;
  }
  return null;
}

function isReshare(container) {
  if (findNestedContainer(container)) return true;

  const header = container.querySelector(
    '.update-components-header__text-view, [class*="header__text"]'
  );
  if (header?.innerText?.match(/udost[eę]pni[łl]/i)) return true;

  const actorNames = container.querySelectorAll(
    '[class*="update-components-actor__name"], .feed-shared-actor__name'
  );
  if (actorNames.length >= 2) return true;

  return container.querySelectorAll('a[href*="/in/"]').length >= 2;
}

function getReshareComment(container, nested) {
  if (nested) {
    const outer = getFullText(container);
    const inner = getFullText(nested);
    if (outer && inner && outer.length > inner.length) {
      const diff = cleanText(outer.replace(inner, ''));
      if (diff.length > 5) return diff;
    }
  }

  const nestedSpans = nested
    ? new Set(nested.querySelectorAll('span[dir="ltr"]'))
    : new Set();

  for (const span of container.querySelectorAll('span[dir="ltr"]')) {
    if (nested && nested.contains(span)) continue;
    const t = cleanText(span.innerText);
    if (t.length > 15) return t;
  }

  return '';
}

function getOriginalAuthor(container, nested) {
  if (nested) {
    const nameEl = nested.querySelector(
      '[class*="update-components-actor__name"], .feed-shared-actor__name'
    );
    if (nameEl?.innerText?.trim()) return nameEl.innerText.trim();

    const link = nested.querySelector('a[href*="/in/"]');
    if (link?.innerText?.trim()) return link.innerText.trim();
  }

  const links = container.querySelectorAll('a[href*="/in/"]');
  if (links.length >= 2) return links[1].innerText.trim();
  return '';
}

function getOriginalText(container, nested) {
  if (nested) {
    const text = getFullText(nested);
    if (text) return text;
  }

  const allDirs = container.querySelectorAll('span[dir="ltr"]');
  if (allDirs.length >= 2) {
    return cleanText(allDirs[allDirs.length - 1].innerText);
  }

  if (container.querySelector('video')) return '[VIDEO]';
  if (container.querySelector('[class*="document"]')) return '[DOKUMENT]';
  return '[MEDIA — brak tekstu]';
}

function extractPost(container, index, profileName, profileTitle) {
  const rawDate = getDate(container);
  const nested = findNestedContainer(container);
  const reshare = isReshare(container);

  const base = {
    nr: String(index).padStart(3, '0'),
    autor: profileName,
    stanowisko: profileTitle,
    data: parseLinkedInDate(rawDate),
    dataRaw: rawDate,
    url: 'https://www.linkedin.com/feed/update/' + container.getAttribute('data-urn'),
    reakcje: getReactions(container),
    komentarze: getComments(container),
  };

  if (!reshare) {
    const tresc = getFullText(container);
    console.log(SCRAPER_TAG, `#${base.nr} POST | ${base.reakcje} reakcji | "${tresc.substring(0, 40)}"`);
    return { ...base, typ: 'POST', tresc, oryg_autor: '', oryg_tresc: '' };
  }

  const commentText = getReshareComment(container, nested);
  const origText = getOriginalText(container, nested);
  const origAuthor = getOriginalAuthor(container, nested);

  console.log(
    SCRAPER_TAG,
    `#${base.nr} UDOSTĘPNIENIE | ${base.reakcje} reakcji | komentarz="${commentText.substring(0, 30)}" | orig="${origText.substring(0, 30)}"`
  );

  return {
    ...base,
    typ: 'UDOSTĘPNIENIE',
    tresc: commentText,
    oryg_autor: origAuthor,
    oryg_tresc: origText,
  };
}

function formatPost(p) {
  const sep = '='.repeat(60);
  if (p.typ === 'POST') {
    return [
      `--- POST #${p.nr} ---`,
      'Typ:        WŁASNY POST',
      `Autor:      ${p.autor}`,
      `Stanowisko: ${p.stanowisko}`,
      `Data:       ${p.data} (${p.dataRaw})`,
      `URL:        ${p.url}`,
      `Reakcje:    ${p.reakcje} | Komentarze: ${p.komentarze}`,
      'Treść:',
      p.tresc || '(brak)',
      sep,
    ].join('\n');
  }
  return [
    `--- POST #${p.nr} ---`,
    'Typ:        UDOSTĘPNIENIE',
    `Udostępnił: ${p.autor} (${p.stanowisko})`,
    `Data:       ${p.data} (${p.dataRaw})`,
    `URL:        ${p.url}`,
    `Reakcje:    ${p.reakcje} | Komentarze: ${p.komentarze}`,
    'Komentarz przy udostępnieniu:',
    p.tresc || '(brak komentarza)',
    '--- ORYGINALNY POST ---',
    `Autor:      ${p.oryg_autor || '—'}`,
    'Treść:',
    p.oryg_tresc || '(brak)',
    sep,
  ].join('\n');
}

function buildFilename(name) {
  const parts = name.trim().split(/\s+/);
  const init = parts[0]?.[0]?.toUpperCase() || 'X';
  const sur = parts[parts.length - 1] || 'Nieznany';
  return `${init}${sur}_posty_${new Date().toISOString().split('T')[0]}.txt`;
}

async function runScraper() {
  console.log(SCRAPER_TAG, '=== START ===');
  const profileInfo = getProfileInfo();
  let lastCount = 0;
  let idleRounds = 0;

  while (idleRounds < 3) {
    window.scrollBy(0, 900);
    await sleep(1800);
    const count = findPostContainers().length;
    chrome.runtime.sendMessage({ type: 'UPDATE_COUNT', count });
    if (count > lastCount) { lastCount = count; idleRounds = 0; }
    else { idleRounds++; }
    if (lastCount >= 60) break;
  }

  const containers = findPostContainers();
  const posts = containers.map((c, i) =>
    extractPost(c, i + 1, profileInfo.name, profileInfo.title)
  );
  const own = posts.filter((p) => p.typ === 'POST').length;
  const re = posts.filter((p) => p.typ === 'UDOSTĘPNIENIE').length;

  console.log(SCRAPER_TAG, `KONIEC: ${posts.length} postów (${own} własne, ${re} udostępnienia)`);

  chrome.runtime.sendMessage({
    type: 'SCRAPE_DONE',
    posts,
    result: posts.map(formatPost).join('\n'),
    ownCount: own,
    reshareCount: re,
    filename: buildFilename(profileInfo.name),
    profileName: profileInfo.name,
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'PING') {
    sendResponse({ ok: true });
    return;
  }
  if (msg.type === 'START_SCRAPE') {
    runScraper();
    sendResponse({ ok: true });
  }
  return true;
});

}
