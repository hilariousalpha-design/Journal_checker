# JournalCheck V3.1 — corrected end product

## What was fixed
- Uses the 50,608-record JournalCheck master dataset.
- Merges the uploaded **Scopus Sources July 2026** workbook by ISSN/eISSN.
- Supports both long field names and the compact legacy keys used by the earlier database (`sco`, `sa`, `st`, `oa`, `cov`).
- Scopus status, active status, source type, OA status, coverage and Scopus source ID are displayed.
- Search automatically scrolls to the result.
- Removes the old Methodology section from the public interface.
- Adds an ISSN-specific official SCImago lookup link.
- SJR is displayed only when a verified SJR value exists; it is never inferred from CiteScore or another metric.
- Keeps Unknown/Not available separate from explicit No.

## Scopus source used
The local enrichment was matched against the uploaded `ext_list_Jul_2026(1).xlsx`, sheet `Scopus Sources Jul. 2026`.

For Research in Hospitality Management (ISSN 2224-3534 / eISSN 2415-5152), the uploaded Scopus source record is:
- Source record ID: 21101440178
- Active: Yes
- Coverage: 2011–2026
- Source type: Journal
- Open access status: Unpaywall Open Access
- Publisher: Taylor and Francis Ltd.

## SJR handling
SCImago is a separate source. The current public SCImago Journal & Country Rank page exposes 2024 as the latest ranking year in the public ranking interface and states that its metrics are based on Scopus data as of March 2025. The app therefore does not fabricate an SJR value when a journal is not present in the locally verified SJR dataset. Instead it provides an ISSN-specific SCImago lookup link.

## Deployment
Upload/replace:
- `index.html`
- `app.js`
- `data/journals.json`

Commit all three together and wait for GitHub Pages to rebuild. Then hard-refresh the site (`Ctrl+F5`).
