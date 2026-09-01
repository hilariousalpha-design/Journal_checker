JournalCheck deployment

Keep this exact structure on GitHub Pages:
index.html
app.js
journalcheck-data-sources.js
data/journals.json
data/sjr-2025.json

The live evidence layer checks Crossref, OpenAlex and DOAJ independently after the local journal match is rendered. A network/CORS/API failure is shown as UNAVAILABLE, never as NOT FOUND. OpenAlex's is_in_doaj field is also displayed as secondary DOAJ evidence. Google Scholar is provided as an official manual search link; Google Scholar does not offer a public browser API for safe scraping of citation/H-index values.

Do not move journals.json or sjr-2025.json out of data/.
