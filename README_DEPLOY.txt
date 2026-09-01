JOURNALCHECK v9 DEPLOYMENT

Keep this exact structure:
index.html
app.js
journalcheck-data-sources.js
data/journals.json
data/sjr-2025.json

IMPORTANT
- Keep the 50,608-record data/journals.json.
- Keep data/sjr-2025.json.
- Do not move either JSON file.
- Upload the updated app.js, index.html and journalcheck-data-sources.js.
- After GitHub Pages deploys, hard-refresh the site (Ctrl+F5).

External checks:
- Crossref: ISSN works-filter + journal endpoint + title fallback.
- OpenAlex: ISSN source endpoint + title fallback.
- DOAJ: checks both print/eISSN + title fallback.
- Google Scholar: official search link only; no scraping/fabrication.

Statuses are deliberately separated:
Confirmed = provider returned a matching record.
Not found = provider responded successfully but no match was found.
Unavailable = network/CORS/API failure; never treat as evidence against a journal.
