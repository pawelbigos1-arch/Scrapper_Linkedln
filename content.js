'use strict';

if (!window.__linkedinScraperV430) {
window.__linkedinScraperV430 = true;

const SCRAPER_TAG = '[LinkedIn Scraper]';
const MAX_HISTORY_MONTHS = 3;

const POST_SELECTOR = '[class*="feed-shared-update-v2"][data-urn*="activity"]';
const NESTED_RESHARE_SELECTORS = [
  '[class*="update-components-mini-update-v2"]',
  '[class*="feed-shared-mini-update"]',
  '[class*="reshare"]',
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
  const s = str
    .replace(/Edytowano/gi, '')
    .replace('•', '')
    .toLowerCase()
    .trim();
  const now = new Date();
  const d = s.match(/(\d+)\s*(d\.|dni|day)/);
  if (d) {
    now.setDate(now.getDate() - parseInt(d[1], 10));
    return now.toISOString().split('T')[0];
  }
  const w = s.match(/(\d+)\s*(tyg|tydz|week|w\.)/);
  if (w) {
    now.setDate(now.getDate() - parseInt(w[1], 10) * 7);
    return now.toISOString().split('T')[0];
  }
  const mo = s.match(/(\d+)\s*(mies|month|mo\.)/);
  if (mo) {
    now.setMonth(now.getMonth() - parseInt(mo[1], 10));
    return now.toISOString().split('T')[0];
  }
  const y = s.match(/(\d+)\s*(r\/l|rok|year|y\.)/);
  if (y) {
    now.setFullYear(now.getFullYear() - parseInt(y[1], 10));
    return now.toISOString().split('T')[0];
  }
  const absolute = parseAbsoluteLinkedInDate(s);
  if (absolute) return absolute;
  return now.toISOString().split('T')[0];
}

function parseAbsoluteLinkedInDate(s) {
  const PL_MONTHS = {
    sty: 0, lut: 1, mar: 2, kwi: 3, maj: 4, cze: 5,
    lip: 6, sie: 7, wrz: 8, paź: 8, paz: 8, lis: 10, gru: 11,
  };
  const EN_MONTHS = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const m = s.match(/(\d{1,2})\s+([a-ząćęłńóśźż.]+)\s+(\d{4})/i);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const monKey = m[2].toLowerCase().replace(/\./g, '').slice(0, 3);
  const year = parseInt(m[3], 10);
  const month = PL_MONTHS[monKey] ?? EN_MONTHS[monKey];
  if (month === undefined) return null;
  const d = new Date(year, month, day);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

function getCutoffDate() {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - MAX_HISTORY_MONTHS);
  cutoff.setHours(0, 0, 0, 0);
  return cutoff;
}

function isWithinHistory(isoDate) {
  const postDate = new Date(isoDate + 'T12:00:00');
  return postDate >= getCutoffDate();
}

function isPostTooOld(container) {
  const iso = parseLinkedInDate(getDate(container));
  return !isWithinHistory(iso);
}

function containersExceedHistory(containers) {
  return containers.some(isPostTooOld);
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
  if (el) {
    return el.innerText
      .replace(/Edytowano/gi, '')
      .replace('•', '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return '';
}

function getCommentText(container, nestedContainer) {
  const commentary = container.querySelector(
    '[class*="update-components-update-v2__commentary"]'
  );
  if (!commentary) return '';

  if (!nestedContainer) return cleanText(commentary.innerText);

  const nestedText = nestedContainer.innerText || '';
  const fullText = commentary.innerText || '';
  const comment = fullText.replace(nestedText, '').trim();
  return cleanText(comment);
}

function getFullText(container) {
  if (!container) return '';

  const more = container.querySelector(
    '[class*="inline-show-more"], [class*="see-more-less-toggle"], [class*="see-more"], button[aria-label*="więcej"]'
  );
  if (more) {
    try { more.click(); } catch (e) { /* ignore */ }
  }

  const commentary = container.querySelector(
    '[class*="update-components-update-v2__commentary"]'
  );
  if (commentary) return cleanText(commentary.innerText);

  const spans = container.querySelectorAll('span[dir="ltr"]');
  let longest = '';
  spans.forEach((s) => {
    const t = s.innerText.trim();
    if (t.length > longest.length) longest = t;
  });
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
  const hasNestedPost = !!(
    container.querySelector('[class*="update-components-mini-update-v2"]') ||
    container.querySelector('[class*="feed-shared-mini-update"]') ||
    container.querySelector(
      '[class*="update-v2__commentary"] [class*="update-v2__commentary"]'
    )
  );

  const authorLinks = container.querySelectorAll('a[href*="/in/"]');
  const uniqueProfiles = new Set(
    Array.from(authorLinks).map((a) => a.href.split('?')[0])
  );

  return hasNestedPost || uniqueProfiles.size >= 2;
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

  let nestedContainer = nested;
  if (!nestedContainer) {
    for (const sel of NESTED_RESHARE_SELECTORS) {
      nestedContainer = container.querySelector(sel);
      if (nestedContainer) break;
    }
  }

  const commentText = getCommentText(container, nestedContainer);

  let origText = '';
  if (nestedContainer) {
    origText = getFullText(nestedContainer);
  }
  if (!origText) {
    if (container.querySelector('video')) origText = '[VIDEO]';
    else if (container.querySelector('[class*="document"]')) origText = '[DOKUMENT]';
    else origText = '[MEDIA — brak tekstu]';
  }

  let origAuthor = '';
  if (nestedContainer) {
    origAuthor =
      nestedContainer.querySelector('a[href*="/in/"]')?.innerText.trim() || '';
  }

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
  const cutoffIso = getCutoffDate().toISOString().split('T')[0];
  console.log(SCRAPER_TAG, `=== START (ostatnie ${MAX_HISTORY_MONTHS} mies., od ${cutoffIso}) ===`);
  const profileInfo = getProfileInfo();
  let lastCount = 0;
  let idleRounds = 0;

  while (idleRounds < 3) {
    window.scrollBy(0, 900);
    await sleep(1800);
    const containers = findPostContainers();
    const count = containers.length;
    chrome.runtime.sendMessage({ type: 'UPDATE_COUNT', count });
    if (containersExceedHistory(containers)) {
      console.log(SCRAPER_TAG, 'Limit 3 miesięcy — koniec scrollowania');
      break;
    }
    if (count > lastCount) { lastCount = count; idleRounds = 0; }
    else { idleRounds++; }
  }

  const allContainers = findPostContainers();
  const containers = allContainers.filter((c) => !isPostTooOld(c));
  const skipped = allContainers.length - containers.length;
  if (skipped > 0) {
    console.log(SCRAPER_TAG, `Pominięto ${skipped} postów starszych niż ${MAX_HISTORY_MONTHS} mies.`);
  }

  const posts = containers.map((c, i) =>
    extractPost(c, i + 1, profileInfo.name, profileInfo.title)
  );
  const own = posts.filter((p) => p.typ === 'POST').length;
  const re = posts.filter((p) => p.typ === 'UDOSTĘPNIENIE').length;

  console.log(SCRAPER_TAG, `KONIEC: ${posts.length} postów (${own} własne, ${re} udostępnienia, limit ${MAX_HISTORY_MONTHS} mies.)`);

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
