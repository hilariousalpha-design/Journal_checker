JournalCheck FINAL — SJR FIXED BUILD

Upload these files/folders exactly:
index.html
app.js
journalcheck-data-sources.js
data/journals.json
data/sjr-2025.json

Delete older duplicate files before uploading.

IMPORTANT:
- Keep journals.json and sjr-2025.json inside the data folder.
- Do not rename the data folder.
- The app now loads SJR from a compact JSON index instead of parsing the 11 MB CSV in the browser.
- SJR dataset: SCImago Journal & Country Rank 2025 supplied by the project owner.
- Example: STATISTICA (ISSN 0390-590X / 1973-2201) should show SJR 0,179, Q4, H-index 11, rank 23355.
- SJR status should say 32,193 records loaded after deployment.
