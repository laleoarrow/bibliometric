#!/usr/bin/env python3
"""Update a WoS position CSV using parsed citation report metrics and validate CPP."""

from __future__ import annotations

import argparse
import csv
import json
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any

CATEGORY_ALIASES = {
    'countries_regions': 'Countries/Regions',
    'countries/regions': 'Countries/Regions',
    'country_region': 'Countries/Regions',
    'country/region': 'Countries/Regions',
    'country': 'Countries/Regions',
    'countries': 'Countries/Regions',
    'affiliations': 'Institutions',
    'affiliation': 'Institutions',
    'institution': 'Institutions',
    'institutions': 'Institutions',
    'authors': 'Authors',
    'author': 'Authors',
}


def canonical_category(raw: str) -> str:
    key = raw.strip().lower().replace(' ', '_')
    return CATEGORY_ALIASES.get(key, raw.strip())


def parse_int_like(raw: str | None) -> int | None:
    if raw is None:
        return None
    cleaned = str(raw).replace(',', '').strip()
    if not cleaned:
        return None
    return int(round(float(cleaned)))


def parse_float_like(raw: str | None) -> Decimal | None:
    if raw is None:
        return None
    cleaned = str(raw).replace(',', '').strip()
    if not cleaned:
        return None
    return Decimal(cleaned)


def load_metrics(path: Path) -> dict[tuple[str, str, str], dict[str, Any]]:
    rows = json.loads(path.read_text(encoding='utf-8'))
    metrics = {}
    for row in rows:
        if row.get('artifact_type') != 'citation_report':
            continue
        key = (
            canonical_category(row.get('category', '')),
            str(row.get('position', '')).lstrip('0') or '0',
            row.get('name', '').strip().lower(),
        )
        metrics[key] = row
    return metrics


def normalize_name(raw: str) -> str:
    return raw.strip().lower()


def format_int(value: int | None) -> str:
    if value is None:
        return ''
    return str(value)


def format_float2(value: Decimal | float | None) -> str:
    if value is None:
        return ''
    decimal_value = value if isinstance(value, Decimal) else Decimal(str(value))
    return str(decimal_value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))


def update_rows(rows: list[dict[str, str]], metrics: dict[tuple[str, str, str], dict[str, Any]]) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    updated = []
    validation = []
    for row in rows:
        if 'Rank' in row and 'Position' not in row:
            row['Position'] = row.pop('Rank')
        category = canonical_category(row.get('Category', ''))
        position = str(row.get('Position', '')).lstrip('0') or '0'
        name = normalize_name(row.get('Name', ''))
        key = (category, position, name)
        metric = metrics.get(key)
        if metric is None:
            updated.append(row)
            continue

        publication = parse_int_like(row.get('Publication'))
        citation = parse_int_like(metric.get('Citation'))
        citing_articles = parse_int_like(metric.get('Citing_Articles'))
        h_index = parse_int_like(metric.get('H_Index'))
        html_cpp = parse_float_like(metric.get('HTML_Citation_per_Publication'))
        manual_cpp = None
        if publication and citation is not None:
            manual_cpp = Decimal(citation) / Decimal(publication)

        row['Category'] = category
        row['Position'] = str(int(position)) if position.isdigit() else row.get('Position', '')
        row['Citation'] = format_int(citation)
        row['Citing_Articles'] = format_int(citing_articles)
        row['Citation_per_Publication'] = format_float2(manual_cpp)
        row['H_Index'] = format_int(h_index)
        updated.append(row)

        abs_diff = None
        match_flag = ''
        if manual_cpp is not None and html_cpp is not None:
            abs_diff = abs(manual_cpp - html_cpp)
            match_flag = 'TRUE' if format_float2(manual_cpp) == format_float2(html_cpp) else 'FALSE'

        validation.append({
            'Category': category,
            'Position': row['Position'],
            'Name': row.get('Name', ''),
            'Publication': format_int(publication),
            'Citation': format_int(citation),
            'manual_cpp': format_float2(manual_cpp),
            'html_cpp': format_float2(html_cpp),
            'abs_diff': format_float2(abs_diff),
            'match': match_flag,
        })
    return updated, validation


def write_csv(path: Path, rows: list[dict[str, str]], fieldnames: list[str]) -> None:
    with path.open('w', newline='', encoding='utf-8') as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('position_csv', type=Path, help='Target CSV to update.')
    parser.add_argument('metrics_json', type=Path, help='Parsed JSON produced by parse_wos_citation_report.py.')
    parser.add_argument('--validation-out', type=Path, required=True, help='Validation CSV output path.')
    args = parser.parse_args()

    with args.position_csv.open(newline='', encoding='utf-8') as handle:
        rows = list(csv.DictReader(handle))
        fieldnames = list(rows[0].keys()) if rows else []

    if 'Rank' in fieldnames and 'Position' not in fieldnames:
        fieldnames = ['Position' if name == 'Rank' else name for name in fieldnames]
    for required in ['Citation', 'Citing_Articles', 'Citation_per_Publication', 'H_Index']:
        if required not in fieldnames:
            fieldnames.append(required)

    metrics = load_metrics(args.metrics_json)
    updated, validation = update_rows(rows, metrics)
    write_csv(args.position_csv, updated, fieldnames)
    write_csv(args.validation_out, validation, [
        'Category',
        'Position',
        'Name',
        'Publication',
        'Citation',
        'manual_cpp',
        'html_cpp',
        'abs_diff',
        'match',
    ])


if __name__ == '__main__':
    main()
