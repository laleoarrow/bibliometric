# Export WoS Workflow / WoS 批量导出流程

Use this workflow when the user wants to export several hundred or several thousand Web of Science records through the `Export` menu as plain-text files.

## Goal
Attach to the user's authenticated Edge Web of Science session, export the full current search result in deterministic plain-text batches, rename each download by record range, and leave behind an auditable manifest.

## Preconditions
- The user has already run the WoS search and opened the result in Edge.
- The user is authenticated in Edge, not just in another browser.
- If that is not already true, stop and ask the user to complete login and open the searched result page first.

## Default Behavior
- Browser: Microsoft Edge through the live remote-debuggable session.
- Output directory: `./data/bibliometric_raw/txt`
- Export format: `Plain text file`
- Record content: `Full Record and Cited References`
- Default batch size: `500`
- Default coverage: the full result set from record `1` through the live total on the page
- Naming pattern: `1-500.txt`, `501-1000.txt`, ..., with the last file using the real final end such as `3001-3423.txt`
- Screenshot pattern: save the configured export overlay as `1-500.png`, `501-1000.png`, ...

## Important Reality Check
Do not hardcode the historical assumption that WoS only allows 500 records at a time.
- On the correct `Plain text file` plus `Full Record and Cited References` path, the live overlay should currently enforce `No more than 500 records at a time`.
- Still, the workflow must read the live overlay instead of assuming from memory, because WoS UI behavior can drift.
- The requested batch size must never exceed the current live WoS limit.

## Step 1: Verify the Right Page
1. Inspect the current Edge WoS tab.
2. Acceptable live entry pages:
   - `.../summary/...`
   - an analyzable WoS results page that can be converted back to the matching `summary` URL
3. If the front tab is `Analyze Results`, derive the corresponding `summary` URL and continue from there.
4. If no valid WoS results page is available, stop and ask the user to open the searched result page.

## Step 2: Verify Authentication
Before export, check for:
- login or SSO redirects
- access denied pages
- bot or captcha interruption

If authentication is missing or WoS shows a challenge, stop and ask the user to clear it in Edge. Do not fake progress.

## Step 3: Read the Live Export Constraints
Open the `Export` menu, choose `Plain text file`, switch `Record Content` to `Full Record and Cited References`, and only then read the live overlay text.
Capture at least:
- total records in the current search
- the live per-export maximum for the selected content mode
- the selected record-content option

The script should fail if the requested batch size is larger than the live per-export maximum for that content mode. Unless the user explicitly asks for a subset, the script should plan ranges from `1` through the live total record count.

## Step 4: Set the Correct Content
The required content mode is:
- `Full Record and Cited References`

Do not leave the WoS default `Author, Title, Source` in place unless the user explicitly asks for that smaller export.

## Step 5: Plan Full-Coverage Batches
1. Read the live total record count from the page.
2. Unless the user explicitly asks for a subset, plan batch ranges from `1` through the final record.
3. For a result set of `3423` with batch size `500`, the expected files are:
   - `1-500.txt`
   - `501-1000.txt`
   - `1001-1500.txt`
   - `1501-2000.txt`
   - `2001-2500.txt`
   - `2501-3000.txt`
   - `3001-3423.txt`

## Step 6: Export in Batches
For each batch:
1. open the `Export` menu
2. choose `Plain text file`
3. select `Records from:`
4. fill the current start and end record numbers
5. select `Full Record and Cited References`
6. save a screenshot of the configured export overlay with the same range stem, for example `1-500.png`
7. click `Export`
8. wait for the download to complete
9. verify the downloaded WoS tagged file contains exactly `end - start + 1` records before accepting it
10. rename the downloaded file from the WoS default name such as `savedrecs.txt` to the deterministic range name such as `1-500.txt`

## Step 7: Resume-Friendly Behavior
The workflow should support reruns.
- If `1-500.txt` already exists and resume mode is on, skip that batch.
- If resume mode is off, fail fast rather than silently overwriting an existing file.

## Step 8: Write Manifest
Write an export manifest CSV containing at least:
- `start`
- `end`
- `filename`
- `screenshot`
- `content`
- `records_total`
- `batch_size`
- `live_limit`
- `expected_records`
- `actual_records`
- `downloaded_at`
- `size_bytes`

## Step 9: Completion Checks
Do not claim success unless all of the following are true:
- the user was authenticated in Edge
- the script touched the live WoS export overlay
- `Full Record and Cited References` was selected
- every expected batch file exists through the final partial batch
- every expected screenshot file exists through the final partial batch
- filenames follow the requested range naming pattern
- the final file uses the true final record number, for example `3001-3423.txt`
- each accepted `.txt` file contains the exact number of WoS tagged records implied by its filename range
- the manifest row count matches the number of completed batches

## Common Failure Modes
- trying to export from `Analyze Results` instead of the real `summary` results page
- assuming Chrome login will carry over to Edge
- leaving the default content as `Author, Title, Source`
- assuming the WoS live maximum is always 500
- accepting a renamed file without verifying that the tagged record count matches the requested range
- letting repeated downloads accumulate as `savedrecs.txt`, `savedrecs (1).txt`, ... instead of deterministic range names
- rerunning without resume logic and silently overwriting previous batches
