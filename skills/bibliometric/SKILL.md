---
name: bibliometric
description: Use when bibliometric work needs Web of Science workflows, especially ranked Countries/Regions, Affiliations, or Authors with reproducible citation metrics, or batch export of WoS plain-text records from an authenticated Edge session.
---

# Bibliometric / 文献计量

## Overview / 概览
`bibliometric` is the user-facing entry point for bibliometric workflows on this machine. At present it only supports Web of Science. Keep this skill thin: it should route the task, enforce the evidence chain, and load only the smallest relevant workflow and scripts.

## When to Use / 适用场景
Use this skill when the task is about Web of Science bibliometrics, especially:
- extracting ranked entity metrics from `Analyze Results`
- collecting `Citation Report` metrics for `Countries/Regions`, `Affiliations`, or `Authors`
- updating a project CSV with reproducible citation metrics and validation artifacts
- saving WoS HTML evidence for later checking rather than relying on memory or screenshots
- exporting the full WoS result set in plain-text batches from an authenticated Edge session

Do not use this skill for Scopus, Dimensions, Lens, PubMed-only workflows, or general manuscript writing.

## Quick Reference / 快速参考
| Signal | Required response |
|---|---|
| Ranked `Countries/Regions`, `Affiliations`, or `Authors` metrics from Web of Science | Load `references/wos-rank-metrics-workflow.md` and use the parsing/update scripts when automation helps. |
| `Citation Report` extraction from an existing WoS summary page | Load `references/wos-rank-metrics-workflow.md` and preserve the HTML evidence before parsing. |
| WoS plain-text export across hundreds or thousands of records | Load `references/export-wos-workflow.md` and use `scripts/export_wos_plaintext.mjs`. |
| Scopus, Dimensions, Lens, PubMed-only, or general manuscript-writing work | Do not use this skill; route elsewhere. |

## Routing Rules / 路由规则
If the user asks for ranked Web of Science entity metrics such as:
- top countries or regions
- top institutions or affiliations
- top authors
- citation report extraction
- citation, citing articles, average per item, or h-index extraction

then immediately load:
- `references/wos-rank-metrics-workflow.md`

and use these scripts when automation is appropriate:
- `scripts/parse_wos_citation_report.py`
- `scripts/update_position_csv.py`

If the user asks to export Web of Science records, plain-text batches, or several thousand WoS records through the `Export` menu, then immediately load:
- `references/export-wos-workflow.md`

and use:
- `scripts/export_wos_plaintext.mjs`

## Core Rules / 核心规则
1. Verify the Web of Science access state first. Distinguish login page, empty result page, and valid summary page.
2. Treat saved HTML or exported files as the primary evidence object. Do not rely on transient browser text when an artifact can be saved.
3. Save baseline pages before drilling into entity-specific `Citation Report` pages.
4. Save each `Citation Report` HTML under a stable artifact directory before parsing.
5. Extract and report at least these metrics when available:
   - `Citation`
   - `Citing_Articles`
   - `H_Index`
   - HTML `Average per item`
6. Compute `Citation_per_Publication` manually as `Citation / Publication` from the table being updated.
7. Validate the manual value against the HTML `Average per item`; do not silently trust either one alone.
8. Standardize the rank column name to `Position` when updating output tables.
9. For WoS export tasks, assume the user must open the searched WoS result in Edge and authenticate there first. If that is not already true, stop and ask the user to do it.
10. For WoS export tasks, prefer the live overlay limit over stale assumptions. A requested batch size may be smaller than the live limit, but never larger.
11. By default, export the full current WoS result set rather than stopping at an arbitrary partial range.
12. Rename exported plain-text files into deterministic range names such as `1-500.txt`, `501-1000.txt`, ..., with the final partial batch named by its true end such as `3001-3423.txt`.
13. For each WoS export batch, save a screenshot of the configured export overlay before clicking `Export`, using the same range stem as the `.txt` file.
14. Do not trust a batch download by filename alone. Verify the downloaded WoS tagged file contains exactly `end - start + 1` records before accepting it.
15. Emit durable artifacts such as HTML manifests, validation tables, screenshots, or export manifests so the workflow is auditable.

## Output Contract / 输出约定
Rank-metrics tables should normally contain:
- `Category`
- `Position`
- `Name`
- `Publication`
- `Citation`
- `Citing_Articles`
- `Citation_per_Publication`
- `H_Index`

WoS plain-text export should normally leave behind:
- `.txt` files named by exported record range across the full result set
- `.png` screenshots named by the same exported record range
- a manifest of exported batches
- enough metadata to confirm batch completeness and ordering

## Expansion Rule / 扩展规则
This is a parent skill. New Web of Science workflows should be added as separate reference workflows and scripts, not by bloating this file. Keep `SKILL.md` as the router; push detailed procedures into `references/` and repeatable logic into `scripts/`.
