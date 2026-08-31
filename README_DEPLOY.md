# JournalCheck V3.3 — Search Reliability Fix

## Replace these files in GitHub
- `index.html`
- `app.js`
- `data/journals.json`

## What V3.3 fixes
1. Prevents a missing optional `googleBtn` element from crashing the whole search/render pipeline.
2. Fixes the OpenAlex ISSN request by preserving canonical ISSN formatting (for example `0390-590X`) instead of stripping the hyphen.
3. Runs OpenAlex, Crossref, DOAJ and Crossref retraction checks in parallel rather than sequentially.
4. Uses shorter timeouts so a blocked external API cannot leave the interface stuck on `Searching…` for a long time.
5. Uses `Promise.allSettled()` so one failed external source cannot prevent results from rendering.
6. Adds a final render safety net: if enrichment fails, the local journal result still appears.
7. Keeps `Unknown` separate from `No` and does not turn missing metadata into a predatory-journal finding.

## Deployment
Commit all three files together. Wait for GitHub Pages to finish deploying, then hard refresh with `Ctrl+F5`.

Test URL example:
`https://hilariousalpha-design.github.io/Journal_checker/?q=Research+in+Hospitality+Management`

## Expected behavior
Search should change from `Searching…` to `Complete` and display the local result even when an external API is unavailable. OpenAlex should no longer fail simply because the ISSN hyphen was removed.
