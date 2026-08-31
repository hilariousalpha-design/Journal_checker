# JournalCheck End Product v3

## What this package changes
- More polished researcher-facing interface instead of a plain minimal layout.
- Search by title, ISSN or eISSN.
- Clear identity profile and indexing matrix.
- Four-level transparent concern screening: Low / Moderate / High / Extreme.
- External confirmation checks for DOAJ, OpenAlex and Crossref.
- Official-source links for DOAJ and ISSN/ROAD.
- No methodology section in the public page.
- Responsive mobile layout, dark-mode toggle, recent searches and URL query support.
- Missing information is displayed as "Not available"; it is not automatically treated as misconduct.

## Installation
Keep your existing:
    data/journals.json

Replace:
    index.html
    app.js
    styles.css

Your GitHub Pages structure should be:

    /
      index.html
      app.js
      styles.css
      data/
        journals.json

The JavaScript supports the current compact field names visible in the JournalCheck database (`t`, `i`, `e`, `p`, etc.) and several readable aliases.

## Important evidence rule
The local database remains the primary dataset for SCIE/SSCI/AHCI/ESCI/JCR/Scopus fields.
DOAJ, OpenAlex and Crossref are separate external confirmation streams.
A record in Crossref/OpenAlex is a metadata/discovery confirmation, not a quality endorsement.
The concern score is a screening aid, not a predatory-journal verdict.

## External services
The browser checks:
- DOAJ by ISSN
- OpenAlex Sources by ISSN
- Crossref Journals by ISSN

If a browser blocks an external request, the UI shows "Check manually" and provides an official/source link rather than inventing a result.
