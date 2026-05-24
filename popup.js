(() => {
  "use strict";

  const SAVE_FOLDER = "linkedin-scraper";

  let scrapedData = null;
  let isScraping = false;

  const readyDot = document.getElementById("ready-dot");
  const readyLabel = document.getElementById("ready-label");
  const statusEl = document.getElementById("status");
  const progressBar = document.getElementById("progress-bar");
  const btnScrape = document.getElementById("btn-scrape");
  const btnDownload = document.getElementById("btn-download");
  const savedPathEl = document.getElementById("saved-path");

  const RECENT_ACTIVITY_RE = /linkedin\.com\/in\/[^/]+\/recent-activity/i;

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function setProgress(percent) {
    progressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  }

  function setPageReady(ready) {
    readyDot.classList.toggle("ready-dot--ok", ready);
    readyDot.classList.toggle("ready-dot--bad", !ready);
    readyLabel.textContent = ready ? "Strona gotowa ✓" : "Strona gotowa?";
  }

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("Brak aktywnej karty.");
    return tab;
  }

  async function pingContentScript(tabId) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { type: "PING" });
      return res?.ok === true;
    } catch {
      return false;
    }
  }

  async function ensureContentScript(tabId) {
    if (await pingContentScript(tabId)) return;
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    await new Promise((r) => setTimeout(r, 300));
    if (!(await pingContentScript(tabId))) {
      throw new Error("Nie udało się załadować skryptu. Odśwież stronę LinkedIn.");
    }
  }

  async function checkPageReady() {
    try {
      const tab = await getActiveTab();
      if (!tab.url?.includes("linkedin.com")) {
        setPageReady(false);
        setStatus("Otwórz LinkedIn — recent-activity profilu");
        return false;
      }
      const ready = RECENT_ACTIVITY_RE.test(tab.url);
      setPageReady(ready);
      setStatus(ready ? "Gotowy — kliknij Zbierz posty" : "Wejdź na: /in/[profil]/recent-activity/all/");
      return ready;
    } catch {
      setPageReady(false);
      setStatus("Nie można sprawdzić strony");
      return false;
    }
  }

  async function startScrape() {
    if (isScraping) return;

    scrapedData = null;
    savedPathEl.textContent = "";
    btnDownload.disabled = true;
    isScraping = true;
    btnScrape.disabled = true;
    setProgress(10);
    setStatus("Scrollowanie...");

    try {
      const tab = await getActiveTab();
      if (!RECENT_ACTIVITY_RE.test(tab.url || "")) {
        throw new Error("Otwórz stronę recent-activity profilu LinkedIn.");
      }

      await ensureContentScript(tab.id);
      await chrome.tabs.sendMessage(tab.id, { type: "START_SCRAPE" });
    } catch (err) {
      setStatus(`Błąd: ${err.message}`);
      setProgress(0);
      isScraping = false;
      btnScrape.disabled = false;
    }
  }

  async function downloadFile() {
    if (!scrapedData?.result) return;

    const downloadPath = `${SAVE_FOLDER}/${scrapedData.filename}`;
    const blobUrl = URL.createObjectURL(
      new Blob([scrapedData.result], { type: "text/plain;charset=utf-8" })
    );

    try {
      await new Promise((resolve, reject) => {
        chrome.downloads.download(
          { url: blobUrl, filename: downloadPath, saveAs: false },
          (downloadId) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (downloadId === undefined) {
              reject(new Error("Nie udało się rozpocząć pobierania."));
              return;
            }
            resolve(downloadId);
          }
        );
      });
      savedPathEl.textContent = `✓ Zapisano: Pobrane/${downloadPath}`;
    } catch (err) {
      setStatus(`Błąd pobierania: ${err.message}`);
    } finally {
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    }
  }

  btnScrape.addEventListener("click", startScrape);
  btnDownload.addEventListener("click", downloadFile);

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "UPDATE_COUNT" && isScraping) {
      setProgress(Math.min(95, Math.round((msg.count / 60) * 85) + 10));
      setStatus(`Znaleziono: ${msg.count} postów | Scrollowanie...`);
    }

    if (msg.type === "SCRAPE_DONE") {
      scrapedData = {
        posts: msg.posts,
        result: msg.result,
        filename: msg.filename,
        count: msg.posts?.length || 0,
        ownCount: msg.ownCount || 0,
        reshareCount: msg.reshareCount || 0,
      };
      isScraping = false;
      btnScrape.disabled = false;
      btnDownload.disabled = !scrapedData.count;
      setProgress(100);
      setStatus(
        `Znaleziono: ${scrapedData.count} postów (${scrapedData.ownCount} własne, ${scrapedData.reshareCount} udostępnienia)`
      );
    }
  });

  checkPageReady();
})();
