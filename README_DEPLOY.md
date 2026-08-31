# JournalCheck v3 — deployment package

## Files

- `index.html` — complete redesigned interface.
- `app.js` — database loader, search/matching, external confirmations, risk engine and report renderer.
- `data/metrics.example.json` — optional schema for enrichment fields.
- `README_DEPLOY.md` — deployment instructions.

## Important data rule

The application does **not invent** Scopus, SJR, Q1–Q4, CiteScore, DOAJ or JCR results.

Your existing `data/journals.json` remains the master dataset. The app understands the compact fields already visible in the current database (`t`, `i`, `e`, `p`) and also accepts descriptive field names.

For the best result, add the optional fields shown in `data/metrics.example.json` to your master records or merge a verified enrichment dataset into them.

## Recommended GitHub structure

Journal_checker/
├── index.html
├── app.js
└── data/
    ├── journals.json
    └── metrics.json (optional)

## What is fixed

- Search button works through one consolidated event handler.
- Query in URL is restored on page load.
- Results automatically scroll into view after a successful search.
- Database loading has clear success/error states.
- `No`, `Not available`, and `Unknown` are kept separate.
- Scopus and Scopus Active are independent fields.
- SJR, quartile, CiteScore, SNIP and H-index are displayed when present.
- DOAJ, OpenAlex and Crossref are attempted as external confirmations.
- External checks fail safely to `Unknown`; a failed API call is never treated as `No`.
- Google investigation is provided as an external search aid, not as an automatic misconduct verdict.
- Concern screening uses explicit warning evidence only. Missing information is not scored as misconduct.
- Methodology section has been removed from the public page.
- Complete criterion-by-criterion checklist is included in each result.
- Print-friendly report button is included.
- Dark/light mode is included.
- Mobile responsive layout is included.

## Data sources

For Scopus, use the official Scopus Sources data. Scopus documentation says its Sources feature can search by title, publisher or ISSN and can provide the source list and metrics.

For SCImago/SJR and quartiles, use the verified SCImago record and preserve the year and subject category. Do not collapse category-specific quartiles into an unsupported single quality label.

For DOAJ/OpenAlex/Crossref, use official records where possible.

For journal due diligence, use the Think. Check. Submit. checklist as a framework for identity, publisher contact, peer review, indexing/archiving, fees, author guidelines and recognized industry initiatives.

## Risk wording

Never display "Predatory journal" as an automatic conclusion. Use:

- Low concern
- Moderate concern
- High concern
- Extreme concern

and list the exact detected signals. A high score is a warning to investigate, not proof of misconduct.
