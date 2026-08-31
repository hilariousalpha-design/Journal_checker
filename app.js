const state = {
    database: null
};

// GitHub Pages project URL
const DATABASE_URL = "./data/journals.json";

function normalize(text) {
    return String(text || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
}

function escapeHTML(text) {
    return String(text ?? "").replace(/[&<>"']/g, function (character) {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        };
        return entities[character];
    });
}

function displayValue(value) {
    if (
        value === undefined ||
        value === null ||
        String(value).trim() === ""
    ) {
        return "Not available";
    }

    return String(value);
}

/*
    Convert database values such as:
    True / False
    Yes / No
    Active / Inactive

    into visual badges.
*/
function createStatus(value) {
    const text = String(value || "").trim().toLowerCase();

    if (
        text === "true" ||
        text === "yes" ||
        text === "active" ||
        text === "indexed"
    ) {
        return '<span class="badge yes">✓ Yes</span>';
    }

    if (
        text === "false" ||
        text === "no" ||
        text === "inactive"
    ) {
        return '<span class="badge no">✕ No</span>';
    }

    return `<span class="badge neutral">${escapeHTML(displayValue(value))}</span>`;
}


/*
    Load database only once.
*/
async function loadDatabase() {

    if (state.database !== null) {
        return state.database;
    }

    console.log("JournalCheck: Loading database...");

    const response = await fetch(
        DATABASE_URL + "?v=" + Date.now(),
        {
            method: "GET",
            cache: "no-store"
        }
    );

    console.log(
        "JournalCheck: Database response:",
        response.status,
        response.statusText
    );

    if (!response.ok) {
        throw new Error(
            "Database request failed: HTTP " +
            response.status
        );
    }

    const database = await response.json();

    console.log(
        "JournalCheck: Database loaded.",
        "Records:",
        database.record_count
    );

    if (!database.records || !Array.isArray(database.records)) {
        throw new Error("Invalid JournalCheck database format.");
    }

    state.database = database;

    return database;
}


/*
    Search the database.

    Priority:
    1. Exact ISSN
    2. Exact eISSN
    3. Exact title
    4. Partial title
*/
function searchDatabase(database, query) {

    const normalizedQuery = normalize(query);

    if (!normalizedQuery) {
        return [];
    }

    const results = [];
    const usedIndexes = new Set();

    // -----------------------------------------
    // 1. ISSN / eISSN exact search
    // -----------------------------------------

    for (let i = 0; i < database.records.length; i++) {

        const journal = database.records[i];

        const issn = normalize(journal.i);
        const eissn = normalize(journal.e);

        if (
            normalizedQuery === issn ||
            normalizedQuery === eissn
        ) {
            results.push(journal);
            usedIndexes.add(i);
        }
    }

    if (results.length > 0) {
        return results;
    }


    // -----------------------------------------
    // 2. Exact journal title
    // -----------------------------------------

    for (let i = 0; i < database.records.length; i++) {

        const journal = database.records[i];

        if (
            normalize(journal.t) === normalizedQuery
        ) {
            results.push(journal);
            usedIndexes.add(i);
        }
    }

    if (results.length > 0) {
        return results;
    }


    // -----------------------------------------
    // 3. Partial journal title
    // -----------------------------------------

    for (let i = 0; i < database.records.length; i++) {

        const journal = database.records[i];

        const title = normalize(journal.t);

        if (
            title.includes(normalizedQuery)
        ) {
            results.push(journal);
            usedIndexes.add(i);
        }

        // Don't display hundreds of results.
        if (results.length >= 20) {
            break;
        }
    }

    return results;
}


/*
    Create the result section.
*/
function renderResults(results, originalQuery) {

    const oldResults = document.getElementById("jc-results");

    if (oldResults) {
        oldResults.remove();
    }

    const section = document.createElement("section");

    section.id = "jc-results";
    section.className = "jc-results";


    // -----------------------------------------
    // No results
    // -----------------------------------------

    if (results.length === 0) {

        section.innerHTML = `
            <div class="container">

                <div class="jc-empty">

                    <div class="tag">
                        JournalCheck result
                    </div>

                    <h2>
                        Journal not found
                    </h2>

                    <p>
                        No matching journal was found in the
                        current JournalCheck database.
                    </p>

                    <p class="jc-muted">
                        Try the complete journal title,
                        ISSN, or eISSN.
                    </p>

                </div>

            </div>
        `;

        const features =
            document.querySelector(".features");

        if (features) {
            features.before(section);
        } else {
            document.body.appendChild(section);
        }

        section.scrollIntoView({
            behavior: "smooth"
        });

        return;
    }


    // -----------------------------------------
    // Results
    // -----------------------------------------

    let cards = "";

    results.forEach(function (journal, index) {

        cards += `

        <article class="jc-card">

            <div class="jc-card-head">

                <div>

                    <div class="jc-kicker">
                        ${index === 0 ? "BEST MATCH" : "MATCH"}
                    </div>

                    <h2>
                        ${escapeHTML(
                            displayValue(journal.t)
                        )}
                    </h2>

                    <p>
                        ${escapeHTML(
                            displayValue(journal.p)
                        )}
                    </p>

                </div>

            </div>


            <div class="jc-grid">

                <div>
                    <strong>ISSN</strong>
                    <span>
                        ${escapeHTML(
                            displayValue(journal.i)
                        )}
                    </span>
                </div>

                <div>
                    <strong>eISSN</strong>
                    <span>
                        ${escapeHTML(
                            displayValue(journal.e)
                        )}
                    </span>
                </div>

                <div>
                    <strong>Country</strong>
                    <span>
                        ${escapeHTML(
                            displayValue(journal.c)
                        )}
                    </span>
                </div>

                <div>
                    <strong>Language</strong>
                    <span>
                        ${escapeHTML(
                            displayValue(journal.l)
                        )}
                    </span>
                </div>

            </div>


            <h3>
                Indexing status
            </h3>


            <div class="jc-indexing">

                <div>
                    <span>SCIE</span>
                    ${createStatus(journal.scie)}
                </div>

                <div>
                    <span>SSCI</span>
                    ${createStatus(journal.ssci)}
                </div>

                <div>
                    <span>AHCI</span>
                    ${createStatus(journal.ahci)}
                </div>

                <div>
                    <span>ESCI</span>
                    ${createStatus(journal.esci)}
                </div>

                <div>
                    <span>JCR 2025</span>
                    ${createStatus(journal.jcr)}
                </div>

                <div>
                    <span>Scopus</span>
                    ${createStatus(journal.sco)}
                </div>

                <div>
                    <span>Scopus Active</span>
                    ${createStatus(journal.sa)}
                </div>

            </div>


            <div class="jc-foot">

                <span>
                    Scopus source type:
                    ${escapeHTML(
                        displayValue(journal.st)
                    )}
                </span>

                <span>
                    Scopus OA:
                    ${escapeHTML(
                        displayValue(journal.oa)
                    )}
                </span>

                <span>
                    Coverage:
                    ${escapeHTML(
                        displayValue(journal.cov)
                    )}
                </span>

            </div>

        </article>

        `;
    });


    section.innerHTML = `

        <div class="container">

            <div class="jc-result-title">

                <div class="tag">
                    JournalCheck database search
                </div>

                <h2>
                    ${results.length}
                    result${results.length === 1 ? "" : "s"}
                    for
                    “${escapeHTML(originalQuery)}”
                </h2>

            </div>

            ${cards}

            <p class="jc-disclaimer">

                These results are based on the current
                JournalCheck master dataset.
                They are not yet a live verification
                against external indexing services.

            </p>

        </div>

    `;


    const features =
        document.querySelector(".features");

    if (features) {
        features.before(section);
    } else {
        document.body.appendChild(section);
    }


    section.scrollIntoView({
        behavior: "smooth"
    });
}


/*
    Main search function.
*/
async function checkJournal() {

    const input =
        document.getElementById("journal");

    const button =
        document.querySelector(".search-row button");

    if (!input) {
        console.error(
            "JournalCheck: #journal input not found."
        );
        return;
    }

    const query =
        input.value.trim();

    if (!query) {

        alert(
            "Please enter a journal name, ISSN or eISSN."
        );

        input.focus();

        return;
    }


    const originalButtonText =
        button ? button.textContent : "Check Journal";


    if (button) {

        button.disabled = true;

        button.textContent =
            "Searching...";

    }


    try {

        console.log(
            "JournalCheck: Searching for:",
            query
        );

        const database =
            await loadDatabase();

        const results =
            searchDatabase(
                database,
                query
            );

        console.log(
            "JournalCheck: Results:",
            results.length
        );

        renderResults(
            results,
            query
        );

    } catch (error) {

        console.error(
            "JournalCheck ERROR:",
            error
        );

        alert(
            "Journal database could not be loaded.\n\n" +
            "Please open the browser console (F12) " +
            "if the problem continues."
        );

    } finally {

        if (button) {

            button.disabled = false;

            button.textContent =
                originalButtonText;

        }

    }
}


/*
    Press Enter to search.
*/
document.addEventListener(
    "DOMContentLoaded",
    function () {

        const input =
            document.getElementById("journal");

        if (!input) {
            console.warn(
                "JournalCheck: Search input not found."
            );
            return;
        }

        input.addEventListener(
            "keydown",
            function (event) {

                if (event.key === "Enter") {

                    event.preventDefault();

                    checkJournal();

                }

            }
        );

    }
);
