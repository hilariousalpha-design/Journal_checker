JournalCheck FINAL deployment

Upload exactly these items to the GitHub repository root:
  index.html
  app.js
  journalcheck-data-sources.js
  data/journals.json
  data/sjr-2025.json

The 50,608-record master database is preserved. Do not replace it with a smaller dataset.
The SJR file is the supplied 2025 JSON dataset and is matched by normalized ISSN/eISSN.

After committing, wait for GitHub Pages to deploy, then hard-refresh the site (Ctrl+F5).
Test:
  Research in Hospitality Management
  Statistica
  2224-3534

Expected behavior:
- local journal result renders immediately;
- SJR is read from data/sjr-2025.json;
- Crossref/OpenAlex/DOAJ checks enrich the result without blocking the local result;
- Google Scholar is a manual search link only (no scraping);
- missing evidence is not treated as a predatory-journal verdict.
