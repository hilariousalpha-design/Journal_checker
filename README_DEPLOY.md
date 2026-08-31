# JournalCheck V3.2 — live evidence enrichment build

## What is fixed
- Keeps the 50,608-record master database and July 2026 Scopus enrichment.
- Correctly reads compact Scopus fields: `sco`, `sa`, `st`, `oa`, `cov`, `scopus_id`.
- Adds live OpenAlex source lookup by ISSN.
- Adds live Crossref journal lookup by ISSN.
- Attempts live DOAJ journal lookup; if browser CORS blocks it, status remains **Unknown** and the official DOAJ record link is shown.
- Adds Crossref / Retraction Watch retraction-related update check.
- Adds ISSN Portal, official journal, DOAJ, OpenAlex, Crossref, Scopus, SCImago and Think.Check.Submit links.
- Adds targeted Google investigation links for indexing claims, predatory/hijacked warnings, retractions/expressions of concern, and general discovery.
- **Risk score no longer penalizes a journal simply for not being in SCIE/SSCI/AHCI/JCR or for missing metadata.** Absence is information, not evidence of misconduct.
- Source conflicts, identifier mismatches, explicit warning flags and retraction-related updates are treated as review signals.
- Unknown is kept separate from No.
- Methodology section remains removed from the public page.
- Search auto-scrolls to results.

## Important limitation: Google
GitHub Pages cannot safely/consistently scrape Google Search results. Google's current Custom Search JSON API requires a configured search engine and API key, and Google states that the API is closed to new customers. JournalCheck therefore provides targeted Google investigation links instead of scraping snippets or treating Google results as authoritative evidence.

## Source hierarchy
1. Official journal / publisher and ISSN Portal for identity and policy claims.
2. Uploaded Scopus / Web of Science datasets for indexing fields supplied by the researcher.
3. DOAJ, OpenAlex and Crossref for independent metadata confirmation.
4. SCImago for SJR/quartile when a verified SCImago record is available.
5. Crossref / Retraction Watch for article-level retraction-related evidence.
6. Google is an investigation/discovery layer only; search results must be opened and verified.

## Deploy
Replace these in GitHub:
- `index.html`
- `app.js`
- `data/journals.json`

Commit all together and wait for GitHub Pages to deploy. Then use `Ctrl+F5`.
