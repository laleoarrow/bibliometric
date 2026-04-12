#!/usr/bin/env python3
"""Parse Web of Science Citation Report HTML files into structured metrics."""

from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path
from typing import Any

METRIC_PATTERNS = {
    'Citation': [
        re.compile(r'data-ta="cr-cites-count"[^>]*>\s*([0-9,]+(?:\.[0-9]+)?)\s*<', re.I | re.S),
        re.compile(r'Citations?\s*</[^>]+>\s*<[^>]+>\s*([0-9,]+(?:\.[0-9]+)?)', re.I | re.S),
    ],
    'Citing_Articles': [
        re.compile(r'data-ta="cr-tca-link"[^>]*>\s*([0-9,]+(?:\.[0-9]+)?)\s*<', re.I | re.S),
        re.compile(r'Citing Articles?\s*</[^>]+>\s*<[^>]+>\s*([0-9,]+(?:\.[0-9]+)?)', re.I | re.S),
    ],
    'HTML_Citation_per_Publication': [
        re.compile(r'data-ta="cr-avg-cites"[^>]*>\s*([0-9,]+(?:\.[0-9]+)?)\s*<', re.I | re.S),
        re.compile(r'Average per item\s*</[^>]+>\s*<[^>]+>\s*([0-9,]+(?:\.[0-9]+)?)', re.I | re.S),
    ],
    'H_Index': [
        re.compile(r'data-ta="cr-h-index"[^>]*>\s*([0-9,]+(?:\.[0-9]+)?)\s*<', re.I | re.S),
        re.compile(r'H-?index\s*</[^>]+>\s*<[^>]+>\s*([0-9,]+(?:\.[0-9]+)?)', re.I | re.S),
    ],
}

BASELINE_PREFIX = 'analyze_results_'


def parse_number(raw: str | None) -> float | None:
    if raw is None:
        return None
    cleaned = raw.replace(',', '').strip()
    if not cleaned:
        return None
    return float(cleaned)


def format_metric(value: float | None) -> str:
    if value is None:
        return ''
    if value.is_integer():
        return str(int(value))
    return f'{value:.2f}'


def parse_metric(text: str, patterns: list[re.Pattern[str]]) -> float | None:
    for pattern in patterns:
        match = pattern.search(text)
        if match:
            return parse_number(match.group(1))
    return None


def infer_identity(path: Path) -> dict[str, str]:
    stem = path.stem
    if stem.startswith(BASELINE_PREFIX):
        category = stem[len(BASELINE_PREFIX):]
        return {
            'artifact_type': 'analyze_results',
            'category': category,
            'position': '',
            'name': '',
        }

    parts = stem.split('__', 2)
    if len(parts) == 3:
        category, position, name = parts
        return {
            'artifact_type': 'citation_report',
            'category': category,
            'position': position,
            'name': name.replace('_', ' '),
        }

    legacy = re.match(r'^(affiliation|author|country)_(\d+)_(.+)$', stem, re.I)
    if legacy:
        category, position, name = legacy.groups()
        return {
            'artifact_type': 'citation_report',
            'category': category.lower(),
            'position': position,
            'name': name.replace('_', ' '),
        }

    return {
        'artifact_type': 'unknown',
        'category': '',
        'position': '',
        'name': stem.replace('_', ' '),
    }


def parse_html_file(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding='utf-8', errors='ignore')
    identity = infer_identity(path)
    record: dict[str, Any] = {
        'file_path': str(path),
        **identity,
    }
    for field, patterns in METRIC_PATTERNS.items():
        value = parse_metric(text, patterns)
        record[field] = format_metric(value)
    return record


def write_csv(rows: list[dict[str, Any]], out_path: Path) -> None:
    fieldnames = [
        'artifact_type',
        'category',
        'position',
        'name',
        'file_path',
        'Citation',
        'Citing_Articles',
        'HTML_Citation_per_Publication',
        'H_Index',
    ]
    with out_path.open('w', newline='', encoding='utf-8') as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('html_dir', type=Path, help='Directory containing saved WoS HTML artifacts.')
    parser.add_argument('--json-out', type=Path, help='Path to write parsed JSON results.')
    parser.add_argument('--csv-out', type=Path, help='Path to write parsed CSV results.')
    parser.add_argument('--glob', default='*.html', help='Glob pattern for HTML files. Default: *.html')
    args = parser.parse_args()

    html_files = sorted(args.html_dir.glob(args.glob))
    rows = [parse_html_file(path) for path in html_files]

    if args.json_out:
        args.json_out.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
    if args.csv_out:
        write_csv(rows, args.csv_out)
    if not args.json_out and not args.csv_out:
        print(json.dumps(rows, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
