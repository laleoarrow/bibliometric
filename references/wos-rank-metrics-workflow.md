# WoS Rank Metrics Workflow / WoS 排名指标提取流程

Use this workflow when the user wants the ranked bibliometric metrics for Web of Science `Countries/Regions`, `Affiliations`, or `Authors` from an existing WoS summary page.

## Goal
Build an auditable extraction chain for top-ranked entities using saved HTML plus structured parsing, then update a project CSV with validated metrics.

## Required Inputs
- a valid Web of Science summary URL
- an authenticated browser session, usually Edge
- a target CSV containing at least `Category`, rank or `Position`, `Name`, and `Publication`
- an output directory for saved HTML artifacts

## Standard Outputs
- three saved `Analyze Results` baseline HTML pages:
  - `countries_regions`
  - `affiliations`
  - `authors`
- one saved `Citation Report` HTML per entity
- `html_manifest.csv`
- parsed metrics file such as `metrics_results.json` or `metrics_results.csv`
- `citation_per_publication_validation.csv`
- updated target CSV with normalized column names

## Step 1: Verify Access
1. Open the WoS summary URL in the authenticated browser.
2. Decide which state you are in:
   - login or SSO page
   - valid results page
   - error or expired session page
3. If not logged in, stop and ask the user to complete login in the real browser. Do not fake extraction from stale HTML.

## Step 2: Stabilize the Evidence Chain
Save the three `Analyze Results` baseline pages before any deep drill-down:
- `Countries/Regions`
- `Affiliations`
- `Authors`

Why this matters:
- the sorted ranking context is itself evidence
- repeated WoS navigation can timeout or reorder state
- the baseline pages tell you which top 15 entities you were actually extracting

## Step 3: Drill into Citation Report
For each category separately:
1. confirm the ranking order on the saved baseline page
2. iterate through the top 15 rows
3. open the entity-specific `Citation Report`
4. save the resulting HTML immediately
5. name artifacts with stable identifiers, for example:
   - `countries_regions__01__USA.html`
   - `affiliations__07__Harvard_University.html`
   - `authors__03__Hou_SP.html`

## Step 4: Parse Required Metrics
From each saved `Citation Report` HTML, extract:
- `Citation`
- `Citing Articles`
- `Average per item`
- `H-index`

Preferred selector anchors from WoS HTML include:
- `data-ta="cr-cites-count"`
- `data-ta="cr-tca-link"`
- `data-ta="cr-avg-cites"`
- `data-ta="cr-h-index"`

If selector text changes, fall back to label-based extraction, but record that fallback in your notes.

## Step 5: Update the Table
Rules for table update:
- rename `Rank` to `Position` if needed
- preserve original `Publication`
- add or update these columns:
  - `Citation`
  - `Citing_Articles`
  - `Citation_per_Publication`
  - `H_Index`
- compute `Citation_per_Publication = Citation / Publication`
- format citation per publication to exactly two decimal places

## Step 6: Validate Manual vs HTML Average
For every row:
1. compute manual `Citation / Publication`
2. compare with HTML `Average per item`
3. write a validation table containing at least:
   - category
   - position
   - name
   - publication
   - citation
   - manual_cpp
   - html_cpp
   - abs_diff
   - match flag

The workflow is only complete when all mismatches are explained.

## Step 7: Write Manifest
Maintain an `html_manifest.csv` with one row per saved artifact. Include enough fields to audit the run, for example:
- category
- position
- name
- artifact_type
- file_path
- citation
- citing_articles
- h_index
- citation_per_publication

## Naming and Directory Rule
Put the HTML artifacts in a dedicated output subdirectory instead of scattering them into the table directory root. A typical pattern is:

```text
output/table1/
  position.csv
  wos_citation_report_html/
    analyze_results_countries_regions.html
    analyze_results_affiliations.html
    analyze_results_authors.html
    countries_regions__01__USA.html
    ...
    html_manifest.csv
    metrics_results.json
    citation_per_publication_validation.csv
```

## Completion Gate
Do not claim the workflow is complete unless all of the following are true:
- login state was verified on the live WoS page
- three baseline `Analyze Results` HTML files were saved
- all required entity `Citation Report` HTML files were saved
- metrics were parsed from HTML, not copied by hand from memory
- `Citation_per_Publication` was computed manually
- manual and HTML average values were validated
- the final CSV uses `Position`, not `Rank`

## Common Failure Modes
- extracting from the wrong page because the session silently returned to login
- using `Analyze Results` transient view without saving baseline HTML
- forgetting `Citing Articles`
- trusting HTML average without checking `Citation / Publication`
- leaving `Citation_per_Publication` with inconsistent decimal formatting
- updating a CSV by row order alone without checking category + entity identity
