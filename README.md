# LinkedIn Scraper

Rozszerzenie Chrome (Manifest V3) do scrapowania postów z LinkedIn `recent-activity/all/`.

## Instalacja

1. `chrome://extensions/` → Tryb deweloperski
2. Załaduj rozpakowane → wybierz ten folder
3. Otwórz profil LinkedIn → `/in/[profil]/recent-activity/all/`

## Wersjonowanie

| Wersja | Opis |
|--------|------|
| 4.2.0 | Naprawa udostępnień (zagnieżdżone kontenery) + deduplikacja top-level |
| 4.1.1 | Pobieranie TXT z popup (fix chrome.downloads) |
| 4.1.0 | Potwierdzone selektory DevTools (`feed-shared-update-v2` + `data-urn`) |

## GitHub

```bash
git init
git add .
git commit -m "LinkedIn Scraper v4.2.0"
git remote add origin https://github.com/TWOJ_USER/linkedin-scraper.git
git push -u origin main
```
