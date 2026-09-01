JOURNALCHECK FINAL DEPLOYMENT
============================

Keep ONLY these files/folders in the GitHub Pages repository:

index.html
app.js
journalcheck-data-sources.js
data/journals.json
data/scimagojr-2025-journalcheck.csv

Delete old duplicate JS/HTML files, old README files, metrics.example.json and any older JournalCheck bundles.

IMPORTANT:
1. Keep the data folder exactly as shown above.
2. Do not move journals.json or the SJR CSV to the repository root.
3. GitHub Pages should publish from the branch/folder containing index.html.
4. After deployment, hard-refresh the site (Ctrl+Shift+R).
5. Test these searches:
   - Research in Hospitality Management
   - 2224-3534
   - Statistica
   - 0390-590X

The application loads the local 50,608-record master database first. SJR is read from the supplied SCImago 2025 CSV. Crossref, OpenAlex and DOAJ are optional live enrichment sources; their failure must not block local results.

Google Scholar is linked for manual verification. The site does not scrape Google Scholar.

Missing data is not treated as proof of misconduct. The concern score is an evidence-screening aid, not a definitive predatory-journal verdict.
