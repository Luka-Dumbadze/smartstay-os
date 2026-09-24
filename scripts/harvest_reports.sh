#!/usr/bin/env bash
# Download the eight verified sources in task_research.md; never use cached fallbacks.
# Requirements: bash, curl, python3, beautifulsoup4. Run from any directory.
set -Eeuo pipefail
umask 022
PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"
command -v curl >/dev/null
python3 -c 'import bs4' >/dev/null
mkdir -p research/raw/failed research/text research/derived research/harvest-logs
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
LOG_DIR="research/harvest-logs/$RUN_ID"
mkdir -p "$LOG_DIR"
RECEIPTS="$LOG_DIR/downloads.jsonl"
: > "$RECEIPTS"
failures=0

while IFS=$'\t' read -r source_id kind url filename expected_title; do
    [[ -n "$source_id" ]] || continue
    body="$LOG_DIR/$source_id.body"
    header="$LOG_DIR/$source_id.headers"
    transfer="$LOG_DIR/$source_id.transfer.json"
    errors="$LOG_DIR/$source_id.curl.log"
    printf 'Fetching %s: %s\n' "$source_id" "$url"
    curl_exit=0
    # Keep error response bodies and all retry/redirect headers for diagnosis.
    # Do not use --fail, which can discard the evidence of an HTTP error.
    curl --location --proto '=https' --proto-redir '=https' \
        --connect-timeout 15 --max-time 60 --retry 2 --retry-delay 2 \
        --retry-max-time 150 --silent --show-error \
        --dump-header "$header" --output "$body" --write-out '%{json}' \
        "$url" > "$transfer" 2> "$errors" || curl_exit=$?
    if ! python3 - "$source_id" "$kind" "$url" "$filename" "$expected_title" \
        "$body" "$transfer" "$errors" "$header" "$curl_exit" "$RUN_ID" "$RECEIPTS" <<'PY'
import datetime, hashlib, json, os, re, sys
from pathlib import Path
from bs4 import BeautifulSoup

(sid, kind, url, filename, expected, body_name, transfer_name, errors_name,
 headers_name, exit_code, run_id, receipts) = sys.argv[1:]
body = Path(body_name)
raw = body.read_bytes() if body.exists() else b''
try:
    transfer = json.loads(Path(transfer_name).read_text())
except (ValueError, OSError):
    transfer = {}
http = int(transfer.get('http_code', 0))
status, detail = 'ok', ''
if int(exit_code):
    status, detail = 'transport_error', f'curl exit {exit_code}'
elif not 200 <= http < 300:
    status, detail = 'http_error', f'HTTP {http}'
elif not raw:
    status, detail = 'empty_response', 'Zero response bytes'
elif kind == 'pdf' and not raw.startswith(b'%PDF-'):
    status, detail = 'invalid_pdf', 'Missing %PDF- magic; inspect saved response for HTML/challenge'
elif kind == 'html':
    soup = BeautifulSoup(raw, 'html.parser')
    h1 = soup.find('h1')
    actual = h1.get_text(' ', strip=True) if h1 else ''
    article = soup.select_one('.news-content-for-split')
    paragraphs = article.select('p') if article else []
    normalize = lambda s: re.sub(r'\W+', ' ', s.casefold()).strip()
    if not actual or normalize(expected) not in normalize(actual):
        status, detail = 'invalid_html', f'Expected article title absent; received title {actual!r}'
    elif not any(p.get_text(strip=True) for p in paragraphs):
        status, detail = 'invalid_html', 'Expected article paragraphs absent; possible challenge or layout change'
destination = Path('research/raw') / filename
if status != 'ok':
    destination = Path('research/raw/failed') / f'{sid}-{run_id}.body'
# Preserve failures even if a previous successful canonical artifact exists.
# The manifest always points to this run's actual response, never the old file.
if body.exists():
    os.replace(body, destination)
else:
    destination.write_bytes(b'')
record = {
    'source_id': sid, 'kind': kind, 'url': url, 'expected_title': expected,
    'file_path': str(destination), 'retrieved_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'run_id': run_id, 'http_status': http, 'curl_exit': int(exit_code),
    'effective_url': transfer.get('url_effective', ''),
    'content_type': transfer.get('content_type', ''),
    'download_status': status, 'download_detail': detail,
    'sha256': hashlib.sha256(raw).hexdigest(), 'byte_size': len(raw),
    'headers_path': headers_name, 'curl_log_path': errors_name,
    'transfer_path': transfer_name,
}
with Path(receipts).open('a') as handle:
    handle.write(json.dumps(record, ensure_ascii=False) + '\n')
print(f'{sid}: {status}; HTTP {http}; {len(raw)} bytes; {detail}', flush=True)
sys.exit(0 if status == 'ok' else 1)
PY
    then
        failures=$((failures + 1))
    fi
done <<'SOURCES'
G1	pdf	https://galtandtaggart.com/galt/8e2bb4f0-cfd9-4ccc-851f-e02cf2ca80b6.pdf	G1-gt-tourism-2024.pdf	Georgia's Tourism Market Watch 4Q24/FY24 review and 2025 outlook
G2	pdf	https://galtandtaggart.com/galt/tourism-overview_september-2022_eng_final.pdf	G2-gt-tourism-2022.pdf	Tourism Overview September 2022
T1	pdf	https://tbccapital.ge/static/file/202609022321-tourism-pulse_07.2026_eng.pdf	T1-tbc-pulse-2026-07.pdf	Tourism Pulse July 2026
P1	pdf	https://pmcg-i.com/app/uploads/2026/09/Hotel-Price-Index_Aug_2026_EN-1.pdf-1.pdf	P1-pmc-hpi-2026-08.pdf	Hotel Price Index Georgia August 2026
P2	pdf	https://pmcg-i.com/app/uploads/2024/11/Hospitality-Sector-Snapshot-new.pdf	P2-pmc-hospitality-2024.pdf	Hospitality Sector in Georgia
V1	html	https://bm.ge/en/news/staff-shortages-and-seasonality-challenge-kakheti-hotels	V1-bmg-kakheti.html	Staff Shortages and Seasonality Challenge Kakheti Hotels
V2	html	https://bm.ge/en/news/many-hotel-owners-want-to-sell-their-properties-shalva-alaverdashvili	V2-bmg-costs.html	Many Hotel Owners Want to Sell Their Properties
V3	html	https://bm.ge/en/news/hotel-occupancy-rises-but-trends-vary-by-region-keti-amirbari	V3-bmg-regions.html	Hotel Occupancy Rises
SOURCES

cp "$RECEIPTS" research/downloads.jsonl.tmp
mv research/downloads.jsonl.tmp research/downloads.jsonl
# Publish status rows even if a download failed. Full extraction is a separate step.
python3 scripts/extract_text.py --manifest-only
printf 'Harvest finished: %s failed source(s). Receipts: %s\n' "$failures" "$RECEIPTS"
if (( failures > 0 )); then
    exit 1
fi
