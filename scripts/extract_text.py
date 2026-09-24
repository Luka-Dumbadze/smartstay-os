#!/usr/bin/env python3
"""Page-aware PDF and BMG extraction with provenance and explicit failure rows.

Run after harvest_reports.sh. Requires Poppler (pdftotext, pdfinfo) and bs4.
No OCR or guessed table cells: numeric table extraction is deliberately bounded.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
FIELDS = [
    "source_id", "kind", "url", "effective_url", "retrieved_at_utc", "run_id",
    "file_path", "sha256", "byte_size", "http_status", "curl_exit", "content_type",
    "download_status", "download_detail", "extraction_status", "extraction_detail",
    "page_count", "paragraph_count", "usable_text", "text_path", "structured_path",
    "layout_table_path", "semantic_table_path", "headers_path", "curl_log_path",
    "transfer_path",
]


def relative(path: Path) -> str:
    return str(path.relative_to(ROOT))


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def table_blocks(page: str) -> list[dict]:
    """Keep column-like layout as evidence candidates, not verified semantic cells."""
    blocks, current = [], []
    for number, line in enumerate(page.splitlines(), 1):
        if re.search(r"\S\s{2,}\S", line):
            current.append({"line": number, "raw": line})
        else:
            if current:
                blocks.append({"lines": current})
                current = []
    if current:
        blocks.append({"lines": current})
    return blocks


def extract_pdf(record: dict, path: Path, text_dir: Path) -> None:
    if not path.read_bytes().startswith(b"%PDF-"):
        raise ValueError("Missing %PDF- magic")
    with tempfile.TemporaryDirectory(prefix="hotel-extract-") as temp:
        target = Path(temp) / "layout.txt"
        result = subprocess.run(
            ["pdftotext", "-layout", "-enc", "UTF-8", str(path), str(target)],
            capture_output=True, text=True, check=True, timeout=90,
        )
        text = target.read_text()
    info = subprocess.run(["pdfinfo", str(path)], capture_output=True,
                          text=True, check=True, timeout=30)
    match = re.search(r"^Pages:\s+(\d+)", info.stdout, re.M)
    if not match:
        raise ValueError("pdfinfo did not return page count")
    count = int(match.group(1))
    pages = text.split("\f")
    if pages and not pages[-1].strip():
        pages.pop()
    if len(pages) != count:
        raise ValueError(f"Page boundary mismatch: pdfinfo={count}, extraction={len(pages)}")
    combined = text_dir / f"{path.stem}.txt"
    combined.write_text(text)
    page_dir = text_dir / path.stem
    page_dir.mkdir(exist_ok=True)
    # Remove only outputs owned by this exact source on a successful re-extraction.
    for old in page_dir.glob("page-*.txt"):
        old.unlink()
    layouts = []
    for index, page in enumerate(pages, 1):
        (page_dir / f"page-{index:03}.txt").write_text(page)
        layouts.append({"pdf_page": index, "blocks": table_blocks(page)})
    layout_path = text_dir / f"{path.stem}.layout-tables.json"
    write_json(layout_path, {
        "source_id": record["source_id"], "sha256": record["sha256"],
        "status": "column-layout candidates; inspect before semantic use",
        "pages": layouts,
    })
    usable = any(character.isalnum() for character in text)
    record.update(page_count=count, usable_text=str(usable).lower(),
                  text_path=relative(combined), layout_table_path=relative(layout_path),
                  extraction_status="ok" if usable else "no_usable_text",
                  extraction_detail=result.stderr.strip())
    if record["source_id"] == "P1":
        candidates = []
        for index, page in enumerate(pages, 1):
            for line in page.splitlines():
                if re.match(r"^\s*Kakheti\s+", line):
                    values = re.findall(r"[-+]?\d+(?:\.\d+)?%", line)
                    if len(values) == 6:
                        candidates.append((index, line, values))
        if len(candidates) != 1:
            raise ValueError(f"Expected one six-value Kakheti HPI row; got {len(candidates)}")
        page_number, source_line, values = candidates[0]
        table_path = text_dir / f"{path.stem}.kakheti.csv"
        with table_path.open("w", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=[
                "source_id", "sha256", "pdf_page", "region", "category",
                "mom_percent", "yoy_percent", "source_line",
            ])
            writer.writeheader()
            for category, offset in [("3-,4-,5-star hotels", 0), ("guesthouses", 2), ("all", 4)]:
                writer.writerow({
                    "source_id": "P1", "sha256": record["sha256"],
                    "pdf_page": page_number, "region": "Kakheti", "category": category,
                    "mom_percent": values[offset].removesuffix("%"),
                    "yoy_percent": values[offset + 1].removesuffix("%"),
                    "source_line": source_line.strip(),
                })
        record["semantic_table_path"] = relative(table_path)
    elif record["source_id"] in {"G2", "T1", "P2"}:
        # Bounded, source-specific rows; never estimate points from chart curves.
        rows = []
        if record["source_id"] == "G2":
            page_number, page = 27, pages[26]
            month_line = next(line for line in page.splitlines() if "Jan-22" in line)
            value_line = next(line for line in page.splitlines() if "y/y growth" in line)
            months = re.findall(r"[A-Z][a-z]{2}-22", month_line)
            values = re.findall(r"[-+]?\d+(?:\.\d+)?%", value_line)
            if len(months) != 16 or len(values) != 16 or "Kakheti" not in page:
                raise ValueError("G2 two-panel monthly table layout changed")
            # The left panel is Kakheti; the right panel is Mtskheta-Mtianeti.
            rows = [{"period": month, "metric": "Kakheti BoG hotel POS spending YoY",
                     "value": value.removesuffix("%"), "unit": "percent",
                     "source_line": value_line.strip()}
                    for month, value in zip(months[:8], values[:8])]
        elif record["source_id"] == "T1":
            page_number, page = 6, pages[5]
            normalized = re.sub(r"\s+", " ", page)
            match = re.search(r"hotels in\s*creased by (\d+)\s*%.*?restaurants increased by (\d+)\s*% year over year", normalized)
            if not match or "Kakheti" not in normalized:
                raise ValueError("T1 Kakheti spending headline changed")
            rows = [{"period": "July 2026", "metric": f"Kakheti non-resident {category} non-cash spending YoY",
                     "value": value, "unit": "percent", "source_line": match.group(0)}
                    for category, value in zip(["hotel", "restaurant"], match.groups())]
        else:
            page_number, page = 8, pages[7]
            matches = [(match.group(1), line.strip()) for line in page.splitlines()
                       for match in re.finditer(r"\bKakheti[ \t]+([\d,]+)", line)]
            if len(matches) != 2 or "2020-2023" not in page:
                raise ValueError("P2 Kakheti hotel/room additions row changed")
            # Independently sorted panels: hotel-count row precedes room-count row.
            rows = [{"period": "2020-2023", "metric": f"Kakheti new {metric}",
                     "value": value.replace(",", ""), "unit": unit,
                     "source_line": line}
                    for metric, (value, line), unit in zip(["hotels opened", "hotel rooms opened"],
                                                          matches, ["hotels", "rooms"])]
        table_path = text_dir / f"{path.stem}.kakheti.csv"
        with table_path.open("w", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=[
                "source_id", "sha256", "pdf_page", "period", "metric", "value", "unit", "source_line"])
            writer.writeheader()
            for row in rows:
                writer.writerow({"source_id": record["source_id"], "sha256": record["sha256"],
                                 "pdf_page": page_number, **row})
        record["semantic_table_path"] = relative(table_path)


def extract_html(record: dict, path: Path, text_dir: Path) -> None:
    soup = BeautifulSoup(path.read_bytes(), "html.parser")
    article = soup.select_one(".news-content-for-split")
    if article is None:
        raise ValueError("BMG article selector absent: layout change or challenge")
    paragraphs = [p.get_text(" ", strip=True) for p in article.select("p")]
    paragraphs = [p for p in paragraphs if p]
    if not paragraphs:
        raise ValueError("No article paragraphs")

    def meta(key: str) -> str:
        element = soup.find("meta", attrs={"property": key})
        if element is None:
            element = soup.find("meta", attrs={"name": key})
        return str(element.get("content", "")) if element else ""

    heading = soup.find("h1")
    title = heading.get_text(" ", strip=True) if heading else meta("og:title")
    author = meta("author")
    # Preserve observed metadata only; do not infer a byline from arbitrary page text.
    structured = {
        "source_id": record["source_id"], "sha256": record["sha256"],
        "source_url": record["url"], "canonical_url": meta("og:url"),
        "title": title, "published_at": meta("article:published_time"),
        "author": author or None,
        "author_status": "documented meta tag" if author else "not exposed in author meta tag",
        "paragraphs": [{"paragraph": i, "text": p} for i, p in enumerate(paragraphs, 1)],
    }
    structured_path = text_dir / f"{path.stem}.article.json"
    write_json(structured_path, structured)
    target = text_dir / f"{path.stem}.txt"
    header = (f"Source: {record['source_id']}\nURL: {record['url']}\n"
              f"SHA256: {record['sha256']}\nTitle: {title}\n"
              f"Published: {structured['published_at']}\n\n")
    target.write_text(header + "\n\n".join(
        f"[paragraph {i}] {p}" for i, p in enumerate(paragraphs, 1)) + "\n")
    record.update(page_count="", paragraph_count=len(paragraphs), usable_text="true",
                  text_path=relative(target), structured_path=relative(structured_path),
                  extraction_status="ok")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest-only", action="store_true", help="Log download statuses without extraction")
    args = parser.parse_args()
    records = [json.loads(line) for line in (ROOT / "research/downloads.jsonl").read_text().splitlines() if line]
    if not records or len({r["source_id"] for r in records}) != len(records):
        raise SystemExit("Missing receipts or duplicate source IDs")
    text_dir = ROOT / "research/text"
    text_dir.mkdir(parents=True, exist_ok=True)
    failed = 0
    for record in records:
        record.update(extraction_status="not_run", extraction_detail="", page_count="",
                      paragraph_count="", usable_text="unknown", text_path="", structured_path="",
                      layout_table_path="", semantic_table_path="")
        try:
            path = ROOT / record["file_path"]
            raw = path.read_bytes()
            if len(raw) != record["byte_size"] or hashlib.sha256(raw).hexdigest() != record["sha256"]:
                raise ValueError("Artifact changed since download receipt")
            if record["download_status"] != "ok":
                record.update(extraction_status="skipped_download_failure", usable_text="false")
                failed += 1
            elif not args.manifest_only:
                if record["kind"] == "pdf":
                    extract_pdf(record, path, text_dir)
                elif record["kind"] == "html":
                    extract_html(record, path, text_dir)
                else:
                    raise ValueError(f"Unsupported source kind {record['kind']}")
                if record["extraction_status"] != "ok":
                    failed += 1
        except Exception as error:
            record.update(extraction_status="error", extraction_detail=str(error), usable_text="false")
            failed += 1
        print(f"{record['source_id']}: download={record['download_status']}, "
              f"extraction={record['extraction_status']}, pages={record['page_count']}, "
              f"paragraphs={record['paragraph_count']}, detail={record['extraction_detail']}")
    temporary = ROOT / "research/manifest.csv.tmp"
    with temporary.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(records)
    os.replace(temporary, ROOT / "research/manifest.csv")
    # The harvester handles download failure exit status; extraction still logs all rows.
    return 1 if failed and not args.manifest_only else 0


if __name__ == "__main__":
    sys.exit(main())
