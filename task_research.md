# Georgia hotel ground-truth research dossier

**Source retrieval: 22 September 2026; dossier completed: 23 September 2026 (Asia/Tbilisi). Geographic focus: Telavi, Kakheti, and regional independent/boutique accommodation.**

**[I] Purpose.** Discover costly operating problems before selecting an AI-native Hotel Operating System workflow. Institutional research supplies context and comparison groups; operator records and observed work establish incidents, causes, frequency, and losses. The intended intervention is pure software with accountable agent-to-agent coordination. Hardware, IoT, fabrication, and generic point-solution SaaS are outside scope.

**[O] Work performed.** Live HTTP retrieval of institutional archives, public frontend metadata endpoints, original PDFs, platform API documentation, company reporting registry pages, hotel-owned pages, and business-media interviews; local HTML/JSON/PDF extraction; rendered inspection of a PDF without extractable text. This document replaces the earlier macro-oriented dossier with the requested investigative methodology.

**[U] What has not been established.** No hotel has supplied operating records or completed an interview in this investigation. No representative Telavi guest-review corpus was collected. No property-specific monetary loss, local incident prevalence, willingness to pay, or autonomous-system ROI has been proven. The methods below distinguish executed extraction from future discovery. “Exhaustive” here means coverage of the investigative dimensions and their failure modes, not a claim that every publication, property, or review was inspected.

## Evidence convention and research rules

| Label | Meaning in this dossier |
|---|---|
| **[D]** | Documented in an identified primary publication or official documentation. For a first-hand interview published by a news organization, establishes what the named speaker reported, not independent verification of the underlying claim. |
| **[O]** | Directly observed in HTTP responses, downloaded documents, rendered pages, or executed local extraction. Computed results are labeled observations and retain their source. |
| **[I]** | Proposed investigation, engineering inference, sampling choice, decision threshold, or design. These are not empirical sector facts. |
| **[U]** | Unknown, inaccessible, unverified, or requiring operator/platform authorization or additional evidence. |

**[I] Application.** A paragraph's initial label applies to the paragraph; a table's evidence column applies to its row. Code blocks inherit the preceding label. A publication can document a sector concern without establishing its prevalence among Kakheti boutiques. Preserve publication date, reference period, geography, population, denominator, units, sample design, and limitations with each claim. Do not promote an analyst forecast to an observed outcome.

**[I] Evidence chain to build:** institutional signal → independently recruited property → recent incident → original artifact and second participant → quantified denominator and loss → competing root-cause explanations → replayable intervention → observed commitment to trial. Stop at the last supported link.

# 1. Institutional intelligence repositories and executable retrieval

## 1.1 Repository map: what to mine and what each source cannot prove

| Institution/source | Verified public entry points | Useful extraction targets | Evidence and limits |
|---|---|---|---|
| Galt & Taggart | https://galtandtaggart.com/research/ ; public API routes below | Tourism Market Watch; Tourism Overview; selected-hotel occupancy/ADR; regional RevPAR recovery; regional bank payment indices; sample footnotes | **[O]** Site uses JavaScript and public JSON. **[D]** Selected-hotel and payment-channel measures occur in inspected PDFs. **[U]** A current representative Telavi boutique occupancy/ADR/RevPAR panel was not found. |
| TBC Capital | https://tbccapital.ge/en/publications | Tourism Pulse; Tourism Sector Overview; Kakheti hotel/restaurant payment trends; sample definitions | **[O]** Public read-only list request and direct PDFs worked. **[D]** Payment figures reflect TBC channels, not total regional hotel turnover. |
| PMC Research | https://pmcg-i.com/research/ ; https://pmcg-i.com/research-category/hotel-price-index/ ; https://pmcg-i.com/research-category/tourism-update/ ; https://pmcg-i.com/research-category/employment-tracker/ | Hotel Price Index; Quarterly Tourism Update; Hospitality Sector in Georgia; Employment Tracker | **[D]** HPI includes Kakheti and guesthouses, but measures advertised prices. Jobs-board counts and salary data measure different populations. |
| ISET Policy Institute | https://iset-pi.ge/en/publications ; https://iset-pi.ge/en/publications/research-reports ; https://iset-pi.ge/en/publications/policy-briefs | Firm-level financial performance, labor-force analysis, tourism reform; original sources cited by each report | **[O]** HTML archive and `https://iset-pi.ge/en/search?q=tourism` worked. **[U]** No representative hotel-level Telavi operating-loss database established. |
| SARAS Reportal | https://reportal.ge/en/Reports | Legal-entity financial statements, notes, audit scope, reporting category, comparative years | **[O]** Public registry exposes name, reporting year, category, and main-activity filters. **[I]** Use financial filings to investigate margins and liabilities, then resolve property/entity mismatch. |

**[I] Highest-value use of these sources:** choose which operator cohorts and incidents to investigate. For example, if a source reports seasonal staffing instability, request actual departures, vacancies, shift rosters, overtime, and service failures across busy and quiet periods. Do not conclude that a staffing problem is caused by communication, or that agents can solve retention, from a sector report alone.

## 1.2 Galt & Taggart: exact documents, discovery endpoint, and metric boundaries

**[D] G1 — “Georgia’s Tourism Market Watch – 4Q24/FY24 review and 2025 outlook,” 31 January 2025.** Direct English PDF: https://galtandtaggart.com/galt/8e2bb4f0-cfd9-4ccc-851f-e02cf2ca80b6.pdf . PDF page 6 contains Figures 16–19 for **selected hotels in Tbilisi and Batumi**, with a warning that figures may change with updated samples and an ADR note “net of VAT.” This is a benchmark for an explicitly selected urban sample; it is not a Telavi occupancy series. **[O]** Downloaded and extracted: eight PDF pages.

**[D] G2 — “Tourism Overview – September 2022.”** Direct English PDF: https://galtandtaggart.com/galt/tourism-overview_september-2022_eng_final.pdf . Page 27 contains Bank of Georgia POS-payment indices for Kakheti and Mtskheta-Mtianeti; page 28 contains ADR and RevPAR recovery charts for Tbilisi and “regions,” sourced to BoG/Galt & Taggart. **[O]** Downloaded and extracted: 32 pages. **[I]** Use as a historical method and seasonality source; preserve its recovery-index baseline and do not substitute it for current absolute ADR/RevPAR. “Regions” is not a Kakheti-only sample.

**[O] G3 — Current archive metadata.** The public tourism query returned `totalItems: 74`; the returned catalog includes “Tourism Market Watch 2Q26,” dated 23 July 2026, with an English file URL https://galtandtaggart.com/files/9e03f7f6-b191-440e-8f96-76c87338cda7.pdf . This specific file was discovered in JSON; its full PDF was not inspected in this investigation. A search for `hotel` returned zero items; that is not proof of no hotel research, since relevant files are categorized/titled as tourism.

**[O] Tested discovery mechanism.** The site's public JavaScript references `/api/tree`, `/api/page/{collection}/{id}`, and `/api/reports/list/{listId}`. The tree's Reports page resolved to `pages/698c5efc52044b0007d52368`; that page exposed reports list ID `696fe04df3faf60007e6609c`. These are observed identifiers, not a promised stable API contract. Rediscover them after a site migration.

**[I] Executable download/discovery commands; the same endpoints and two historical PDFs were fetched successfully in this investigation.** Run from the project root. `curl --fail` rejects HTTP errors; the PDF-magic checks below also reject HTML challenges returned with HTTP 200.

```bash
mkdir -p research/raw research/text research/derived
curl --fail --location --retry 2 --max-time 45 \
  'https://galtandtaggart.com/api/tree' -o research/raw/gt-tree.json
curl --fail --location --retry 2 --max-time 45 \
  'https://galtandtaggart.com/api/page/pages/698c5efc52044b0007d52368' \
  -o research/raw/gt-reports-page.json
curl --fail --location --get --retry 2 --max-time 45 \
  'https://galtandtaggart.com/api/reports/list/696fe04df3faf60007e6609c' \
  --data-urlencode 'page=1' --data-urlencode 'limit=100' \
  --data-urlencode 'order=DESC' --data-urlencode 'orderBy=date' \
  --data-urlencode 'search=tourism' -o research/raw/gt-tourism.json
curl --fail --location --retry 2 --max-time 45 \
  'https://galtandtaggart.com/galt/8e2bb4f0-cfd9-4ccc-851f-e02cf2ca80b6.pdf' \
  -o research/raw/gt-tourism-2024.pdf
curl --fail --location --retry 2 --max-time 45 \
  'https://galtandtaggart.com/galt/tourism-overview_september-2022_eng_final.pdf' \
  -o research/raw/gt-tourism-2022.pdf
```

**[I] Parse the API rather than constructing PDF names.** Read `totalPages` and retrieve each page if a complete catalog is needed; do not assume the requested page size is honored. Deduplicate by `_id`, retain both language file references, and filter on title/sector after search. This parser works on the observed response structure:

```python
import json
from pathlib import Path
from urllib.parse import urljoin

doc = json.loads(Path('research/raw/gt-tourism.json').read_text())
print('pages:', doc.get('totalPages'), 'items:', doc.get('totalItems'))
for item in doc.get('items', []):
    file_path = (item.get('files') or {}).get('en')
    file_path = file_path or (item.get('file') or {}).get('url')
    if file_path:
        print(json.dumps({
            'id': item['_id'], 'title': item.get('title'),
            'published': item.get('date'),
            'url': urljoin('https://galtandtaggart.com/', file_path)
        }, ensure_ascii=False))
```

## 1.3 TBC Capital: regional payment data and original PDF access

**[D] T1 — “Tourism Pulse – July 2026.”** Direct PDF: https://tbccapital.ge/static/file/202609022321-tourism-pulse_07.2026_eng.pdf . Page 6 contains Kakheti hotel/restaurant non-cash spending and transaction-value material. Page 2 explicitly says sector growth is based on POS and e-commerce payments through TBC channels and can differ from market turnover because of changes in non-cash usage and TBC market share. **[O]** Eight-page PDF downloaded and text extracted. **[I]** A regional payment increase could reflect volume, prices, channel migration, or market-share changes. It cannot isolate hotel profitability, booked room nights, guest satisfaction, or staff productivity.

**[O] T2 — “Tourism Sector Overview – 6M 2026,” catalog date 11 August 2026.** Direct PDF: https://tbccapital.ge/static/file/202608114403-1.-tourism-update-aug-2026-eng-6m.pdf . The download is a valid eight-page PDF but `pdftotext` produced no usable text. Pages 3 and 5 were rendered and visually inspected: they show visitor-trip and foreign-travel-income analysis with GNTA/NBG source notes. The catalog text separately reports large branded-hotel KPIs; the underlying KPI page and sample methodology were not visually verified here. **[U]** Do not treat that catalog's branded-hotel figures as a verified boutique or regional panel.

**[O] Tested public list call.** The frontend uses `https://tbccapital.ge/source/api/view/main/getDataList`; JSON fields include `contentType`, `searchText`, and `pageNumber`. Its response contains `list` and `listCount`. The tourism query returned ten top-level records and `listCount: 207`; broad text matches include macro reports and nested related records. The number is not a count of hotel-specific studies. Some file URLs contain `/../`; normalize with a URL parser.

```bash
curl --fail --location --retry 2 --max-time 45 \
  'https://tbccapital.ge/source/api/view/main/getDataList' \
  -H 'Content-Type: application/json' \
  --data '{"contentType":"reports","searchText":"tourism","pageNumber":1}' \
  -o research/raw/tbc-tourism.json
curl --fail --location --retry 2 --max-time 45 \
  'https://tbccapital.ge/static/file/202609022321-tourism-pulse_07.2026_eng.pdf' \
  -o research/raw/tbc-pulse-2026-07.pdf
curl --fail --location --retry 2 --max-time 45 \
  'https://tbccapital.ge/static/file/202608114403-1.-tourism-update-aug-2026-eng-6m.pdf' \
  -o research/raw/tbc-overview-2026-h1.pdf
```

**[I] Repository procedure.** Repeat `pageNumber`, stop on an empty top-level list or confirmed completion, and deduplicate top-level report IDs. Search `tourism` and `hospitality` separately; verify exact titles and languages before download. Save complete JSON because report links can sit inside nested metadata. Treat this as a public website implementation detail subject to change, not a supported client integration.

## 1.4 PMC: regional price panel, sector concerns, and labor signals

| ID and original publication | Landing page and direct English PDF | What was verified |
|---|---|---|
| P1: Hotel Price Index Georgia (August 2026), published 14 September 2026 | https://pmcg-i.com/research/hotel-price-index-georgia-august-2026/ ; https://pmcg-i.com/app/uploads/2026/09/Hotel-Price-Index_Aug_2026_EN-1.pdf-1.pdf | **[O]** One-page PDF downloaded and parsed. **[D]** Regional price table and methodology available. Keep the unusual doubled `.pdf` filename exactly. |
| P2: Hospitality Sector in Georgia, 26 November 2024 | https://pmcg-i.com/research/hospitality-sector-in-georgia/ ; https://pmcg-i.com/app/uploads/2024/11/Hospitality-Sector-Snapshot-new.pdf | **[O]** 16-page PDF downloaded and parsed. **[D]** Pages 3 and 14 discuss workforce/skills gaps, limited/inconsistent reporting, SME operating costs, and financial vulnerability. These are the report's sector assessments, not quantified Telavi incident rates. |
| P3: Quarterly Tourism Update (Tourism Indicators in 2024) | https://pmcg-i.com/research/quarterly-tourism-update-2024/ ; https://pmcg-i.com/app/uploads/2025/03/QTU-2024_ENG-1.pdf | **[O]** PDF downloaded and parsed. **[I]** Use visit/spending patterns as segmentation context; inspect units and original GNTA/Geostat/NBG sources before comparison. |
| P4: Employment Tracker Georgia (July 2026) | https://pmcg-i.com/research/employment-tracker-georgia-july-2026/ ; https://pmcg-i.com/app/uploads/2026/09/Employment-Tracker-July-2026-ENG.pdf | **[D]** PDF page 2 uses Revenue Service salary data, explicitly gross and provisional; pages 3–4 use Jobs.ge vacancy counts. **[I]** These do not measure property staff turnover, unfilled shifts, or time-to-hire. |

**[D] P1 methodology matters more than its headline.** The report uses standard double-room prices for 3-, 4-, and 5-star hotels and guesthouses across ten regions and Tbilisi, with a stratified Booking.com sample of 568 hotels and 371 guesthouses. The price index uses available hotels across current/base periods and cited CPI methodology. Missing/small regional samples can prevent publication of some observations. These are listed prices, not transaction-level realized room revenue.

**[O] Concrete regional extraction demonstration, P1 table “Hotel Price Index”:**

| Kakheti category | Month-on-month | Year-on-year |
|---|---:|---:|
| 3-, 4-, 5-star hotels | -0.2% | 9.3% |
| Guesthouses | 2.6% | 5.0% |
| All included accommodation | 1.1% | 7.3% |

**[I] Correct interpretation.** These documented indices justify asking how actual realized rates and costs changed for sampled properties. They do not prove that Kakheti hotels gained margin or incurred a coordination loss. Do not average those percentages to construct an occupancy or RevPAR measure.

**[I] Retrieval commands using verified original file links:**

```bash
curl --fail --location --retry 2 --max-time 45 \
  'https://pmcg-i.com/app/uploads/2026/09/Hotel-Price-Index_Aug_2026_EN-1.pdf-1.pdf' \
  -o research/raw/pmc-hpi-2026-08.pdf
curl --fail --location --retry 2 --max-time 45 \
  'https://pmcg-i.com/app/uploads/2024/11/Hospitality-Sector-Snapshot-new.pdf' \
  -o research/raw/pmc-hospitality-2024.pdf
curl --fail --location --retry 2 --max-time 45 \
  'https://pmcg-i.com/app/uploads/2025/03/QTU-2024_ENG-1.pdf' \
  -o research/raw/pmc-tourism-2024.pdf
curl --fail --location --retry 2 --max-time 45 \
  'https://pmcg-i.com/app/uploads/2026/09/Employment-Tracker-July-2026-ENG.pdf' \
  -o research/raw/pmc-employment-2026-07.pdf
```

**[O] Archive pagination.** PMC's tourism archive exposed `?paged=2`. It contains monthly and quarterly titles from different periods; do not assume a missing month is a failed scrape or extrapolate a fixed publication cadence. **[I]** Download English and Georgian versions only when useful for checking terminology, treating them as versions of one report rather than independent corroboration.

## 1.5 ISET: financial microdata, labor structure, and tourism reform

| ID | Exact publication and PDF | Investigative use and boundary |
|---|---|---|
| I1 | “Size-based financial performance patterns of Georgian enterprises: evidence from firm-level data,” landing date 30 December 2025: https://iset-pi.ge/en/publications/3620-size-based-financial-performance-patterns-of-georgian-enterprises-evidence-from-firm-level-data ; PDF https://iset-pi.ge/storage/media/other/2026-01-15/0b570b00-f22b-11f0-b452-172d27a4e7d5.pdf | **[D]** PDF page 3 identifies SARAS standardized financial statements as a source. **[O]** 19-page PDF retrieved and parsed. **[I]** Follow its data source to entities and notes, without treating size/margin association as a causal boutique-hotel finding. |
| I2 | “Skill-biased change or structural stagnation? … post-pandemic labor market trends in Georgia”: https://iset-pi.ge/en/publications/3598-skill-biased-change-or-structural-stagnation-trends-post-pandemic-labor-market-trends-in-georgia ; PDF https://iset-pi.ge/storage/media/other/2025-09-15/e71bff70-9239-11f0-9b3d-fd0da8e2e434.pdf | **[D]** PDF is Research Note #2025/09, August 2025; uses Labor Force Survey and skill decomposition. Accommodation/food services appears on PDF pages 7–8; methodological appendix begins on page 17. **[I]** Labor structure context, not a hotel vacancy or retention survey. |
| I3 | “Tourism reform assessment,” 1 August 2023: https://iset-pi.ge/en/publications/research-reports/3353-tourism-reform-assessment ; PDF https://iset-pi.ge/storage/media/other/2023-08-03/39d7a9b0-31f6-11ee-806b-3d6d5c80f4e9.pdf | **[O]** Landing page and original PDF retrieved. **[D]** Landing page concerns tourism draft-law reform. **[U]** This investigation did not establish current legal obligations from the report; a 2023 reform document cannot be treated as current law. |

**[O] Useful discovery routes.** `https://iset-pi.ge/en/search?q=tourism` returns actual search results with `&page=2` pagination. The site's JavaScript constructs `/en/search?q=...`; the earlier attempted `?search=tourism` archive parameter did not establish filtering. Observed results include the above assessment, public-private tourism reform dialogues, and agritourism projects. A particularly relevant stakeholder-discovery page is https://iset-pi.ge/en/news-and-events/news/3488-reformeter-hosted-the-third-public-private-dialogue-on-tourism-reform1 ; this was discovered in search results, not fully inspected.

**[I] Retrieval commands:**

```bash
curl --fail --location --get --max-time 45 \
  'https://iset-pi.ge/en/search' --data-urlencode 'q=tourism' \
  -o research/raw/iset-tourism-search.html
curl --fail --location --max-time 45 \
  'https://iset-pi.ge/storage/media/other/2026-01-15/0b570b00-f22b-11f0-b452-172d27a4e7d5.pdf' \
  -o research/raw/iset-firm-finances.pdf
curl --fail --location --max-time 45 \
  'https://iset-pi.ge/storage/media/other/2025-09-15/e71bff70-9239-11f0-9b3d-fd0da8e2e434.pdf' \
  -o research/raw/iset-labor.pdf
curl --fail --location --max-time 45 \
  'https://iset-pi.ge/storage/media/other/2023-08-03/39d7a9b0-31f6-11ee-806b-3d6d5c80f4e9.pdf' \
  -o research/raw/iset-tourism-reform.pdf
```

## 1.6 Financial filings: move from sector claims to a hotel's economics

**[O] Public route:** https://reportal.ge/en/Reports . The SARAS registry page has legal-entity name, legal form, reporting year, reporting category, and main economic activity filters. Its interface says to select a year before searching by category/main activity. No individual hotel's filing was downloaded in this investigation.

**[I] Exact investigation sequence:**

1. Ask the operator for the trading name, legal name, identification code, and whether the building owner and operating company differ. A hotel brand is not a reliable financial-statement join key.
2. Search the registry by legal entity and year, then confirm the identification code in the filing. Use accommodation activity as a discovery filter; a mixed wine/restaurant/hotel company may be classified elsewhere.
3. Download available annual financial statements and notes for multiple comparable years. Record consolidated versus separate accounts, fiscal period, audit/review status, currency/unit, accounting basis, and restatements.
4. Extract revenue, operating costs where disclosed, employee expense/headcount where disclosed, receivables, payables, cash, debt, interest expense, leases, related-party balances, and going-concern qualifications. Preserve missing disclosures as missing.
5. Ask the operator to reconcile revenue and cash receipts to property-level management accounts. Separate room, restaurant, wine, events, and other revenue; do not call entity-wide revenue “room revenue.”
6. Link potential loss mechanisms to original artifacts: commission statement ↔ reservation; folio ↔ payment settlement; invoice ↔ supplier receipt; payroll/overtime ↔ roster and exception workload. Do not infer the root cause of a low margin from the annual accounts.

**[I] Financial comparability traps:** cash versus accrual; GEL versus USD; net versus gross VAT; OTA merchant versus agency settlements; room-only versus packages; bank POS versus all channels; owner labor excluded from payroll; connected-party rent; interest and currency effects; construction costs versus recurring operations; seasonal closure and unavailable inventory. Annual financial pressure can be real while the fix lies outside software.

## 1.7 Common extraction pipeline, tested failure detection, and source manifest

**[O] Available local tools:** Python 3, BeautifulSoup, `pdftotext`, and `pdftoppm` were usable. `tesseract` was not installed. Therefore this investigation rendered selected TBC pages for visual inspection and did not claim to have OCRed the report.

**[I] Standard-library PDF validation and page-aware extraction.** Run after the download commands. The technique was exercised on the downloaded files; the no-text branch correctly describes the TBC overview. SHA-256 is a version identifier, not proof of publisher authenticity.

```python
from pathlib import Path
import hashlib, json, subprocess

out = Path('research/text')
out.mkdir(parents=True, exist_ok=True)
for path in sorted(Path('research/raw').glob('*.pdf')):
    raw = path.read_bytes()
    if not raw.startswith(b'%PDF-'):
        raise SystemExit(f'Not a PDF; inspect HTTP/challenge response: {path}')
    target = out / (path.stem + '.txt')
    subprocess.run(['pdftotext', '-layout', str(path), str(target)], check=True)
    text = target.read_text(errors='replace')
    pages = text.split('\f')
    if pages and not pages[-1].strip():
        pages.pop()
    record = {
        'file': str(path), 'sha256': hashlib.sha256(raw).hexdigest(),
        'bytes': len(raw), 'pages': len(pages),
        'usable_text': bool(text.strip()),
        'next_step': 'inspect text and tables' if text.strip() else 'render/OCR'
    }
    print(json.dumps(record))
    for number, page in enumerate(pages, 1):
        (out / f'{path.stem}.p{number:03}.txt').write_text(page)
```

**[I] Render a problematic page without claiming the file contains no information:**

```bash
pdftoppm -f 3 -l 3 -scale-to 1800 -png -singlefile \
  research/raw/tbc-overview-2026-h1.pdf research/derived/tbc-overview-p3
# Optional only if Tesseract is installed; this OCR step was not executed here:
# tesseract research/derived/tbc-overview-p3.png stdout -l eng
```

**[I] PDF quality protocol.** Inspect columns and chart legends visually before translating extracted numbers into rows. Retain physical PDF page number and printed page number if they differ. For OCR record language pack, engine/version, and image; human-check minus signs, percentages, decimal separators, axes, category order, and units. Never fill an unreadable cell with an LLM guess. For Georgian use an appropriate installed language pack and a fluent reviewer.

**[I] HTML link extraction without search interstitials.** Save a verified report landing page using `curl`, then enumerate its real PDF links. BeautifulSoup is the only non-standard-library dependency in this snippet:

```python
from bs4 import BeautifulSoup
from pathlib import Path
from urllib.parse import urljoin, urlparse

base = 'https://pmcg-i.com/research/hotel-price-index-georgia-august-2026/'
# First save this exact page to research/raw/report-page.html using curl.
soup = BeautifulSoup(Path('research/raw/report-page.html').read_text(), 'html.parser')
links = set()
for tag in soup.select('a[href]'):
    url = urljoin(base, tag['href'])
    if '.pdf' in urlparse(url).path.lower():
        links.add(url)
for url in sorted(links):
    print(url)
```

**[O] Download audit, selected original PDFs.** Hashes below are the first 16 hexadecimal characters of SHA-256, included as a compact audit fingerprint. Full hashes can be regenerated with the script. The source IDs above provide exact download URLs.

| Source | Bytes received | SHA-256 prefix |
|---|---:|---|
| G1 | 530103 | `75f2925f6097b8f2` |
| G2 | 877735 | `a92c0d602ed17659` |
| T1 | 1994457 | `407d58825af18e52` |
| T2 | 2105872 | `c527e96fd006d273` |
| P1 | 204584 | `cce52f0de113fd24` |
| P2 | 780371 | `39581d5fb23a9faf` |
| P3 | 2222320 | `eebe874477a2f778` |
| P4 | 445340 | `f85cd9711c476471` |
| I1 | 383019 | `4ea2447ab9a7bcb0` |
| I2 | 642523 | `e21dca66e26928e5` |
| I3 | 1581169 | `cf419bf3d4bae4eb` |

**[I] Maintain a CSV/JSON manifest:** `source_id, institution, title, landing_url, file_url, retrieved_at_utc, publication_date, reference_period, language, http_status, content_type, sha256, bytes, geography, population, sample_size, measure, units, method_note, source_page, extraction_method, evidence_label, limitations`. Record a changed PDF under a new hash instead of silently overwriting its source history.

# 2. Digital exhaust and sentiment mining

## 2.1 Verified professional channels and actual practitioner evidence

| ID/channel | Concrete public target | Evidence, use, and limitation |
|---|---|---|
| V1 — BMG, 7 September 2026 | “Staff Shortages and Seasonality Challenge Kakheti Hotels”: https://bm.ge/en/news/staff-shortages-and-seasonality-challenge-kakheti-hotels | **[D]** Interview report attributes difficulties finding/retaining staff, seasonal staff reductions, and service-quality effects to Amirbari Hospitality Agency managing partner Ketevan Amirbari. **[I]** A highly relevant lead for manager interviews; it supplies no property-level turnover denominator or causal experiment. |
| V2 — BMG, 4 September 2026 | “Many Hotel Owners Want to Sell Their Properties” — Shalva Alaverdashvili: https://bm.ge/en/news/many-hotel-owners-want-to-sell-their-properties-shalva-alaverdashvili | **[D]** BMG attributes operating-cost, payroll, margin, and sale-pressure claims to the hotelier/Hotels Federation founder. **[I]** Trace these claims to actual accounts and named operators before inferring prevalence. |
| V3 — BMG, 2 September 2026 | “Hotel Occupancy Rises, but Trends Vary by Region — Keti Amirbari”: https://bm.ge/en/news/hotel-occupancy-rises-but-trends-vary-by-region-keti-amirbari | **[D]** Discusses differing regional profiles and Kakheti wine/gastronomy demand. **[I]** Useful for segmentation and counterexamples, not a statistical occupancy dataset. V1/V3 share a speaker and are not independent confirmations. |
| Georgian Tourism Association | https://www.tourism-association.ge/ ; official-site-linked Facebook https://www.facebook.com/itsGeorgianTourism/?ref=bookmarks ; Instagram https://www.instagram.com/georgian.tourism.association/ | **[O]** Initial homepage retrieval exposed these links and “DUAL Education in Hospitality” / training navigation. **[I]** Recruit through membership/training networks and discover event discussions. **[U]** The linked education page returned 503 on retrieval; social feeds and member complaints were not collected. |
| Hotels Federation | Named in V2 as Shalva Alaverdashvili's organization | **[D]** Named practitioner/organization verified through the first-hand interview report. **[U]** A current official member forum or open group URL was not established; do not invent one. |
| HOREKA/HORECA | https://www.horeca.ge ; linked https://www.facebook.com/Horeca.geo | **[O]** The retrieved site describes a corporate hygiene supplier. **[U]** This is not evidence that it is the “HOREKA Georgia” hotelier association or a manager forum. A specific active hotelier group under that name remains unverified. |
| Labor advertisements | P4 Employment Tracker and its named source Jobs.ge | **[D]** PMC documents Jobs.ge as its vacancy source. **[O]** A direct attempt at https://jobs.ge/en/ returned 410. **[I]** Use PMC now; use authorized/manual vacancy collection if the current board interface is accessible later. A repost is not automatically a newly unfilled role. |
| ISET stakeholder dialogues | Tourism search and reform-assessment links in §1.5 | **[O]** Public-private dialogue pages appeared in official search. **[I]** Extract participant organizations and policy questions, then check relevance with operators. This is not a hotel service-incident log. |

**[I] Public-channel investigation protocol.** Record speaker, role, property/portfolio if disclosed, publication date, incident reference period, direct versus paraphrased speech, and commercial interests. A consultant, association spokesperson, and supplier observe different populations. Ask for introductions to dissatisfied former customers, closed/seasonal properties, and managers outside their network. Do not treat press coverage, advertisements, and recruitment notices as independent proofs of the same loss.

**[U] No authenticated social-group access or outreach occurred.** Ask operators which Georgian-language groups they actually consult; verify an administrator, recency, operator participation, and permission for research before collecting group content. Closed-group posts are not a public bulk dataset. No messages were sent in this investigation.

## 2.2 Demonstrated public-text mining: exact archive and article extraction

**[O] BMG provides a public sitemap index:** https://bm.ge/sitemap.xml . It exposed `news-sitemap-v1.xml` through `news-sitemap-v8.xml` plus other sitemaps. Local XML extraction found 48,000 `<loc>` entries in v1 and 30,059 in v8 on retrieval. These counts include language variants and are not counts of unique hospitality stories. V8 yielded the three relevant English articles above. This avoids dependence on search-engine result pages.

**[I] Reproducible discovery commands and standard-library sitemap filter:**

```bash
curl --fail --location --max-time 60 'https://bm.ge/sitemap.xml' \
  -o research/raw/bmg-sitemap.xml
curl --fail --location --max-time 60 'https://bm.ge/news-sitemap-v8.xml' \
  -o research/raw/bmg-news-v8.xml
curl --fail --location --max-time 45 \
  'https://bm.ge/en/news/staff-shortages-and-seasonality-challenge-kakheti-hotels' \
  -o research/raw/bmg-kakheti.html
```

```python
from pathlib import Path
import re
import xml.etree.ElementTree as ET

root = ET.fromstring(Path('research/raw/bmg-news-v8.xml').read_bytes())
ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
urls = {node.text for node in root.findall('.//s:loc', ns) if node.text}
for url in sorted(urls):
    if re.search(r'hotel|hospitality|sastumro|kakhet|kaxet|telavi', url, re.I):
        print(url)
```

**[I] Targeted extraction with evidence spans; no LLM required to discover candidate passages:**

```python
from pathlib import Path
from bs4 import BeautifulSoup
import json, re

url = 'https://bm.ge/en/news/staff-shortages-and-seasonality-challenge-kakheti-hotels'
soup = BeautifulSoup(Path('research/raw/bmg-kakheti.html').read_text(), 'html.parser')
body = soup.select_one('.news-content-for-split')
if body is None:
    raise SystemExit('Article selector changed; inspect HTML before proceeding')
paragraphs = [p.get_text(' ', strip=True) for p in body.select('p')]
paragraphs = [p for p in paragraphs if p]
for index, paragraph in enumerate(paragraphs, 1):
    if re.search(r'staff|employee|payroll|operating cost|profit margin|season', paragraph, re.I):
        print(json.dumps({
            'source_url': url, 'paragraph': index,
            'evidence_span': paragraph,
            'source_type': 'published_practitioner_interview',
            'status': 'candidate_for_human_coding'
        }, ensure_ascii=False))
```

**[O] Executed result on live article HTML:** V1 had four non-empty article paragraphs and four candidate paragraphs; V2 had four and four; V3 had four and one. The keyword includes “season,” so these counts intentionally include context as well as complaints. They are retrieval results, not hotel-problem frequencies. An exact short sentence in V1 is: “Seasonality further complicates the problem, as hotels often have to reduce staff after the peak season.” Its attribution is the article's account of Amirbari's remarks; it is not an interview conducted by this project.

**[I] Translation-aware query inventory for institutional/native-site search and manual discovery:** `Telavi hotel staffing`, `Kakheti hotel operations`, `hotel payroll profitability Georgia`; Georgian seeds `თელავი სასტუმრო`, `კახეთი სასტუმრო`, `კადრების დეფიციტი`, `სეზონურობა`, `სასტუმროს მართვა`; Russian seeds `Телави отель`, `Кахетия гостиница`, `заселение`, `персонал`, `возврат`. These are proposed search terms, not findings; have a fluent speaker extend inflections and local terminology. The official ISET search and BMG sitemap routes were tested; generalized search-engine queries in this environment encountered verification challenges.

## 2.3 Guest-review access: distinguish real coverage from convenient snippets

| Platform/route | Documented or observed access | What to do |
|---|---|---|
| Google Places API (New) | **[D]** Official resource schema https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places : reviews are sorted by relevance; **maximum five** returned. Details guide: https://developers.google.com/maps/documentation/places/web-service/place-details . | **[I]** Useful for property identity and a small discovery sample, not a comprehensive negative-review corpus. Record relevance-selection bias. Do not infer historical incidence. |
| Google Business Profile reviews | **[D]** https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list : authorized verified location; paginated list; maximum `pageSize=50`; `nextPageToken`; sorting supported. | **[I]** Preferred route with an eligible consenting operator and authorized access. Collect all pages, timestamp the snapshot, preserve updates and sorting. API access/authorization is an actual dependency. |
| TripAdvisor Content API | **[D]** https://tripadvisor-content-api.readme.io/reference/getlocationreviews : standard Location Reviews request returns up to five most recent reviews, with different limits for specified upgraded/beta access. | **[I]** Use within licensed entitlement. Standard access is inadequate for exhaustive historical mining; do not imply it paginates a complete public corpus. |
| Booking.com | **[O]** Official connectivity landing page https://developers.booking.com/connectivity/docs/ identifies Guest Review API and a Guest reviews connection type for retrieval/reply. Two guessed deep documentation URLs returned 404. A public review-page request returned a JavaScript/verification challenge. | **[I]** Obtain an authorized property export or a documented provider connection through the current official navigation. **[U]** Exact current endpoint, partner eligibility, fields, history, and pagination were not verified; no fabricated API call is provided. |
| Public browser/manual review collection | **[I]** Available only if ordinary access and applicable platform conditions permit. | Record property URL, review URL/ID if exposed, ordering, selected date window, score, text, language, and capture date. Stop at verification/login barriers; do not claim automation completed when it did not. |

**[O] Property-identity demonstration.** A verified hotel-owned page, https://communalhotels.com/index.php/telavi-2/ , identifies the Telavi property and links its address, **11 Cholokashvili st., Telavi, Kakheti 2200**, to https://maps.app.goo.gl/7XMQ9A31L54M2gLp8 . It also links a Cloudbeds booking destination. The initially tried `/telavi/` URL was an image attachment page; following the site's actual navigation resolved the correct property page. **[I]** Use this as a seed for identity matching, not a claim that this hotel has any particular operating failure. **[U]** Its Google reviews were not extracted, and the guessed Booking.com review slug was not independently validated.

**[I] Authorized Google Business Profile retrieval template.** The endpoint and pagination are documented; this call was **not executed** because no account/location authorization was supplied. Set the variables through your normal secret mechanism, keep tracing off, and keep credentials out of manifests. Only request reviews; no reply/post action is needed.

```bash
: "${GBP_ACCESS_TOKEN:?Set an authorized OAuth token}"
: "${GBP_ACCOUNT_ID:?Set the authorized account ID}"
: "${GBP_LOCATION_ID:?Set the verified location ID}"
curl --fail --get --max-time 45 \
  "https://mybusiness.googleapis.com/v4/accounts/${GBP_ACCOUNT_ID}/locations/${GBP_LOCATION_ID}/reviews" \
  -H "Authorization: Bearer ${GBP_ACCESS_TOKEN}" \
  --data-urlencode 'pageSize=50' \
  --data-urlencode 'orderBy=updateTime desc' \
  -o research/raw/gbp-reviews-page1.json
# For a subsequent page, add --data-urlencode "pageToken=${GBP_NEXT_PAGE_TOKEN}"
# using the prior response's nextPageToken. Stop when that field is absent.
```

**[I] Automated public-page scraping, when permitted, should be an adapter rather than a universal selector.** Save the raw response; check status, content type, hotel identity, and presence of real review records; parse exposed structured data or stable page elements; preserve source IDs and pagination; enforce a low request rate; stop on 403/429/challenges and follow retry guidance. Test the adapter against a manually counted page. JavaScript rendering is not evidence of a complete dataset, and JSON-LD on a hotel website can be curated marketing testimonials. A successful HTTP status with zero records is a failed collection, not zero complaints. No CAPTCHA bypass or proxy rotation is part of this method.

## 2.4 Sampling, coding, and triangulation protocol

**[I] Proposed property frame.** Start with a purposive discovery sample of 12 properties: four Telavi city independent/boutique hotels, four rural Kakheti guesthouses or wine-linked stays, two larger regional hotels as contrasts, and two independently recruited struggling/seasonally closed or recently exited operators if reachable. These are recruitment targets, not observed counts. Record room count, operating months, services, ownership, staffing model, booking channels, and current systems. Sample by actual operating model, not merely a “boutique” marketing label.

**[I] Review collection design.** Prefer all available reviews within a defined 12-month window; extend only when testing seasonality/rare events and label periods separately. If full collection is unavailable, record a reproducible stratified sample rather than “the worst reviews.” Proposed within-platform strata: Booking.com scores ≤6, 7–8, 9–10; Google/TripAdvisor scores 1–2, 3, 4–5. These are study choices, not validated equivalents across scales. Include positive controls to detect things hotels do well and errors in negative-keyword classification. Review score alone does not establish complaint type.

**[I] Preserve:** platform/property IDs, canonical property URL and address, review ID, review permalink when available, posted date, stay date if actually exposed, raw rating/scale, original language, original positive/negative fields, original text, collection method, sort order, snapshot date, and whether a platform translation was shown. Keep owner replies separate. Minimize personal identifiers; use restricted storage for raw records and redact text before public demos.

**[I] Bias controls:**

- Separate review-sample complaint share from incidents per occupied stay. Guests who review are self-selected; a negative-stratum sample exaggerates complaints by design.
- A review can mention multiple failures; one failed stay may generate multiple posts. Count distinct review IDs and incident IDs separately.
- Preserve original date and edits; deduplicate within a platform by stable ID, with update versions retained. Flag likely cross-platform duplicates for human review; do not identify people by guesswork.
- Record missing/removed reviews and collection gaps. Absence from an API response is not evidence of deletion or resolution.
- Keep language-original text alongside translations. Have a fluent speaker audit Georgian and Russian coding, idioms, negation, and intensity. “No delay” must not become a delay complaint.
- Separate observed symptom, guest interpretation, and proposed root cause. “Waited” does not establish minutes; “staff absent” does not establish a staffing shortage; an unhappy review does not establish a refund.
- Use two coders on a meaningful subset, adjudicate disagreements, and report agreement and exclusions. Model confidence is not a substitute for grounded evidence spans.

**[I] Operational codebook for multi-label human/model-assisted coding:**

| Code | Evidence to capture | Root-cause hypothesis to test with hotel records |
|---|---|---|
| ARRIVAL_READINESS | Promised arrival/check-in, reported wait, room-readiness communication | Arrival update failed to reach readiness/assignment responsibility; alternatively real capacity/cleaning constraint |
| REQUEST_OWNERSHIP | Request, acknowledgement, repeated follow-up, delivered/missed outcome | No accountable owner, missing dispatch/acknowledgement, shift-transfer loss |
| BOOKING_PROMISE | Booked room/service/terms versus supplied outcome | Channel/booking amendment not propagated; alternatively guest misunderstanding or deliberate overpromise |
| FOLIO_SETTLEMENT | Disputed charge, missing credit/refund, contradictory amount | Service delivery and folio/payment state diverged; alternatively exchange rate/tax/policy issue |
| SHIFT_CONTINUITY | Repeating instructions after shift change, unresolved escalation | Open exceptions and commitments missing from handover |
| SERVICE_DEPENDENCY | Breakfast/event/transfer/request depends on other responsibilities | Reservation promise not checked against service capacity or scheduling |
| OUTSIDE_SOFTWARE_SCOPE | Physical condition, location, unavailable real capacity, staff pay/retention, external disruption | Do not reclassify into an AI problem unless a separately evidenced preventable communication/control loss exists |

**[I] Coding schema:** `claim_id, source_type, source_id, property_id, episode_id_if_known, original_span, language, code, symptom, claimed_time, verified_time, responsible_role, required_handoff, guest_effect, claimed_money, verified_money, alternative_cause, corroborating_artifact, coder, adjudication, evidence_label`. A model may propose a code and quote a span; a human accepts or rejects it. Unknown fields remain null.

**[I] Minimal aggregation script for a human-adjudicated review corpus.** The CSV must have `property_id, platform, review_id, review_date, rating, rating_max, text_original, source_url, codes_verified`. Use semicolon-separated approved codes. This computes review-sample shares, not stay-level failure rates; it has an explicit no-data stop. No real review CSV existed during this investigation, so no empirical review shares are reported.

```python
import csv, json
from pathlib import Path
from collections import Counter

path = Path('research/derived/reviews-adjudicated.csv')
if not path.exists():
    raise SystemExit('UNESTABLISHED: no authorized review corpus')
with path.open(newline='') as handle:
    rows = list(csv.DictReader(handle))
if not rows:
    raise SystemExit('UNESTABLISHED: empty corpus; no complaint-rate estimate')
seen, unique = set(), []
for row in rows:
    if not all(row.get(k) for k in ('platform', 'property_id', 'review_id', 'source_url')):
        raise SystemExit('Missing identity or source; adjudicate before aggregation')
    key = (row['platform'], row['property_id'], row['review_id'])
    if key in seen:
        raise SystemExit('Duplicate/update found; resolve versions before aggregation')
    seen.add(key)
    unique.append(row)
counts = Counter()
for row in unique:
    counts.update({c.strip() for c in row['codes_verified'].split(';') if c.strip()})
print(json.dumps({
    'sample_reviews': len(unique),
    'sample_properties': len({r['property_id'] for r in unique}),
    'unit': 'share of collected adjudicated reviews, not share of stays',
    'counts': dict(counts),
    'sample_shares': {c: n / len(unique) for c, n in counts.items()}
}, indent=2))
```

**[I] The decisive triangulation step.** With permission, ask the operator to locate a complaint episode in its own system without exposing guest identities. Match an anonymized booking reference/date to reservation changes, readiness messages, task acknowledgements, folio adjustments, and payment settlement. If no match is possible, the review remains a perception signal. If an artifact contradicts a review or management account, preserve the contradiction and investigate; do not silently discard inconvenient evidence.

# 3. On-the-ground customer discovery in Telavi/Kakheti

## 3.1 Recruitment and interview structure

**[I] Framework.** Use past-behavior customer discovery consistent with the requested “Mom Test” approach: discuss the operator's actual work, investigate specific past episodes, and ask for artifacts and commitments instead of approval of an idea. The script below is an original proposed protocol, not quoted book text or a validated hospitality instrument. Attempts to retrieve the book's website did not produce usable source material; no book quotation is asserted.

**[I] Recruit for contrasts, not applause.** Use Telavi Technopark introductions, association contacts, independently discovered hotels, accountants/PMS implementers, and referrals from front-line workers. Recruit beyond hackathon attendees and technology enthusiasts. Maintain a recruitment log including nonresponses, refusals, role, property characteristics, referral source, and whether the participant knows the team. The proposed 12-property frame is qualitative discovery, not a probability sample or a basis for market-wide percentages.

**[I] Roles to hear separately where possible:** owner/financial decision-maker, manager/reception, housekeeping/readiness responsibility, accountant/cashier, and restaurant/event responsibility when relevant. In a family property, one person may perform several roles. Map responsibilities as actually performed rather than inventing departments. Managers' descriptions of workload require corroboration from people doing the work.

**[I] Proposed opening, read verbatim if useful:**

> We are researching how hotels here actually operate. We would like to understand a recent working day and where things became difficult. We are not asking you to evaluate a product. You can skip any question. If you show us records, please hide guest names, payment details, and other private information. May we take notes? We will ask separately before recording or using any attributable quotation.

**[I] Keep recording consent, artifact access, quotation attribution, and future pilot participation separate.** A willing conversation is not permission to copy the PMS database or enroll the property in an autonomous system. Use pseudonymous property IDs in shared research; let the operator demonstrate sensitive steps without sending raw guest records.

## 3.2 A 40-minute non-leading interview script

| Time | Exact proposed questions | Evidence sought; what to avoid |
|---|---|---|
| 0–5 min: operating context | “What is your responsibility on a normal shift?” “Which services do you operate, and which months do you operate them?” “Walk me through yesterday from opening to closing.” | **[I]** Actual roles, calendar, demand, and workflow. Do not start with “Would AI help?” |
| 5–12 min: last difficult episode | “What was the last occasion when the shift did not go as planned?” “When was that?” “What happened first, and what happened next?” “Who first noticed?” | **[I]** A concrete event, ordered actions, and consequences. Let the participant choose the issue before suggesting review topics. |
| 12–20 min: artifact walkthrough | “Can you show me where that booking or request first appeared, with private details hidden?” “How did the next person find out?” “Where was responsibility recorded?” “What did the system show at that moment?” | **[I]** Real state and handoffs rather than an idealized SOP. Ask to see timestamps and original records; don't accept “we always” as a trace. |
| 20–27 min: frequency and financial consequence | “When else did this happen recently?” “Could we count it for the last completed month?” “How many relevant arrivals/requests/settlements were there in that period?” “What was paid, refunded, written off, or worked extra?” | **[I]** Numerator, denominator, observed cost, and uncertainty. Never introduce an invented savings number for them to agree with. |
| 27–33 min: existing attempts and constraints | “What have you changed to address it?” “When did you last change that process?” “What did the change cost?” “What still failed afterward?” “Why does the current workaround survive?” | **[I]** Revealed priority, past expenditure, competing causes, integration barriers, and rational reasons for manual work. |
| 33–37 min: counterexample | “Show me a similar day when this went well.” “What was different?” “Who handles this best?” “What problem would you solve before this one?” | **[I]** Disconfirming evidence and comparative importance. Successful handling may reveal a simple rule, not a need for agents. |
| 37–40 min: concrete next step | “Who else took part and could check this account?” “Would you let us reconstruct a few anonymized past cases with that person?” “What approval and access would a supervised trial require?” | **[I]** A verifiable action: scheduled follow-up, artifact owner, test cases, decision-maker. Polite enthusiasm is not demand validation. |

**[I] Follow-up probes, used only after the participant identifies the relevant issue:**

- **Labor/seasonality:** “Who left most recently, when, and what reason did they give?” “What happened to that person's work on the next shift?” “Which shifts were uncovered?” “Was replacement/overtime actually paid?” “How did the quiet-season roster differ?” Distinguish retention, wages, training, and seasonal demand from dispatch failure.
- **Room readiness:** “For the last delayed arrival, when did you learn arrival time, when did cleaning finish, when was readiness recorded, and when was the guest informed?” “Was a room physically available?” A real capacity shortage cannot be fixed by communication alone.
- **Request/shift continuity:** “Show the last request that had to be repeated.” “What acknowledgement was expected?” “At shift change, where could the incoming person see the unresolved promise?”
- **Billing/refund:** “Show the last disagreement over a charge.” “Which amount was in the booking, folio, channel statement, and settlement?” “What adjustment was made, and was it collected or paid?”
- **Events/packages:** “For the last group or event change, who received the change and who had to act?” “Where were food/service capacity and room promises reconciled?”
- **Management interruption:** “What interrupted you most recently?” “What decision required you rather than another person?” “What happened the last time you were unavailable?” Avoid labeling every managerial decision as unnecessary micromanagement.

**[I] Avoid these low-signal prompts:** “Is hotel coordination a big problem?” “Would you use our AI OS?” “Would you pay 100 GEL?” “Do you lose hours every day?” “Would automating this help?” Replace each with the last real episode, record, attempted remedy, and actual cost. A hypothetical price answer is not willingness to pay.

## 3.3 Exact workflow walkthrough: trace a guest, then follow the exceptions

**[I] Unit of analysis:** one completed stay/booking and every linked promise, task, financial action, and exception. Pick one incident case and one comparable smooth stay from the same property and period. Add a second observer or responsible staff member when possible. Have the operator use the actual interface, notebook, spreadsheet, or message history with sensitive fields hidden.

| Journey stage | Ask the operator to demonstrate | Capture the boundary where work could fail |
|---|---|---|
| Discovery/booking | Original channel record, booked room/service, rate/terms, acceptance, deposit requirements | **[I]** What was promised; which record became authoritative; channel updates versus manually copied fields |
| Amendment/pre-arrival | Last arrival-time, occupancy, room-type, meal, transfer, or special-request change | **[I]** Sender, recipient, acknowledgement, version, deadline, and dependent services |
| Inventory/readiness | Room assignment, physical readiness confirmation, cleaning work and availability | **[I]** Reservation state versus readiness state; real constraints versus stale information; who can mark ready |
| Arrival | Actual arrival, access/check-in completion, payment/deposit state, promise to guest | **[I]** Queue/wait timestamps, handoff failures, escalation, and compensation |
| During stay | One service request through completion and guest confirmation | **[I]** Dispatch, ownership, task acceptance, dependencies, timeout, repeated request, recovery |
| Shift handover | Open tasks and promises before and after shift transfer | **[I]** Missing owner, oral-only transfer, duplicate work, unacknowledged escalation |
| Departure/settlement | Final folio, service charges, credits, invoice, payment receipt and channel remittance | **[I]** Physical service versus financial record, charge authority, refund approval, reconciliation |
| Post-stay | Complaint, response, recovery action, correction of underlying process | **[I]** Whether action closed the incident or merely sent a message |

**[I] Record each handoff in an event table:**

```text
case_id | event_id | event_time | time_source | actor_role | source_system
trigger | input_record/version | expected_action | deadline
recipient_role | acknowledgement_time | completion_time | completion_evidence
exception | escalation | rework_minutes | actual_cash_effect | evidence_ref
```

**[I] Preserve uncertainty in the trace.** “Around lunch” is an estimated range, not `12:00:00`. Record clock/timezone differences, edited messages, and missing timestamps. A handwritten completion mark cannot establish when another worker received the update. Distinguish event occurrence from entry time, and task accepted from work completed. A prototype's simulated completion must never masquerade as staff-confirmed completion.

**[I] Walkthrough technique:** ask “what happened next?” at each step; request the record; compare expected/actual state; follow every manual copy, message, decision, and wait; ask the next participant to reconstruct their view independently. Then draw a responsibility swimlane from those observations. Do not ask the owner to invent an ideal process diagram first. Where accounts differ, keep both versions and identify the missing evidence.

**[I] Final case card:** incident narrative without identities; event graph; responsible roles; artifacts; alternative causes; number of comparable opportunities; verified cost; current workaround; point of preventable divergence; constraints and approval boundaries; proposed replay test. The case card becomes the unit for problem ranking and prototype evaluation.

## 3.4 Establish frequency, loss, and causation without invented economics

**[I] Use a common closed reporting period.** Start with the last completed 30 days for recurring operations; inspect seven recent working days for recall and trace reconstruction. Use longer historical windows for rare high-severity incidents and compare busy/quiet periods separately. These windows are proposed study choices. Do not extrapolate harvest-season incidents uniformly over a year, and don't mix “last month” denominators with all-time complaint numerators.

| Metric | Operational definition | Guardrail |
|---|---|---|
| Incident frequency | Distinct verified incidents / eligible arrivals, requests, handovers, or settlements in the same period | **[I]** Select the denominator appropriate to the problem; open days differ from calendar days. |
| Waiting | Completion/availability time minus the relevant promised or required time | **[I]** Report median/tail only when enough timestamped cases exist; keep estimates separate. |
| Staff effort | Observed handling minutes + verified rework minutes by role | **[I]** Elapsed guest delay is not paid staff time. Sum concurrent labor carefully. |
| Cash leakage | Actual avoidable refund, write-off, duplicate payment, incremental purchase, fee, or overtime tied to a case | **[I]** Check original folio, invoice, payroll, or bank settlement. Avoid adding the same loss twice. |
| Revenue opportunity | Documented unsatisfied demand × feasible availability × expected net contribution, with uncertainty | **[I]** An empty room is not proof of a lost booking. Do not claim gross revenue as profit. |
| Labor value | Recoverable effort × actual loaded hourly cost | **[I]** Label as capacity released unless payroll/overtime really changes. Owner time needs a separate explicit valuation. |
| Recurrence after remedy | Same defined incident rate before/after a process change, with exposure and demand context | **[I]** A small observational comparison suggests an effect; it does not remove confounding. |

**[I] Root-cause ladder:** symptom → failed state/decision → information available at that time → responsible role and permitted action → missing acknowledgement/dependency/control → underlying constraint. Test alternatives: insufficient paid staffing, physical capacity, training, incentives, incorrect commercial policy, unavoidable disruption, or bad data. If the true cause is wages or lack of a room, software can sometimes improve allocation/communication but cannot claim to eliminate the constraint.

**[I] Quantification discipline.** Keep `verified_cash_loss`, `verified_effort`, and `hypothesized_opportunity` as separate columns. A refunded sale cannot also be counted as full lost contribution plus the same refunded cash without a coherent accounting model. Calculate a conservative and uncertain range from actual inputs; do not use invented industry-average wages, OTA fees, failure rates, or savings percentages.

# 4. Problem evaluation matrix and AI-native OS/A2A filter

## 4.1 Hard gates before scoring

**[I] These are internal project decision rules, not GITA judging criteria.** The 115-hour window is the user's engineering constraint. This dossier does not establish an official Smartstay/GITA rubric or change the hackathon's terms.

| Gate | Required evidence to pass | Failure response |
|---|---|---|
| G1: Real problem | A recent operator episode with an artifact or directly observed work; relevant role confirms consequence | **[I]** Keep as an unvalidated hypothesis until supported. A news article or model-generated scenario alone does not pass. |
| G2: Recurrent/material | Measurable recurrence or sufficiently serious verified consequence, with an explicit denominator/period | **[I]** Occasional inconvenience gets deprioritized; rare serious cases need a different risk justification. |
| G3: Structural coordination | At least two real responsibilities with dependent state/constraints and asynchronous actions; a missing negotiation, ownership, or acknowledgement affects the outcome | **[I]** A simple field update, report, or single-database CRUD task fails the A2A-fit gate. Do not split one operation into fictional agents. |
| G4: Software leverage | A permitted software action can change the failure path with available information | **[I]** Physical construction, equipment, IoT, wages, or external market demand are not the proposed solution. |
| G5: Access and authority | Available/redacted input artifacts, a usable adapter or honest simulator, explicit limits on writes, a role able to approve trial actions | **[I]** No assumed PMS/OTA privileges, unrestricted refunds, or invented integration access. |
| G6: Verifiable within 115 hours | A bounded end-to-end workflow, deterministic oracle, replayable cases, and a baseline comparison | **[I]** A polished conversation that cannot demonstrate state change and recovery fails. |
| G7: Advantage over simpler control | Evidence that dependency negotiation/adaptation matters beyond a shared task list or deterministic rule | **[I]** If a simple process/rule fixes the problem, reject it as the flagship A2A problem or use that rule inside the OS. |

**[I] Gate interpretation.** A tiny hotel may have one person handling several responsibilities, so separate job titles are unnecessary. But distinct constraints and meaningful delegated decisions must exist. Multi-agent topology is justified by the actual problem, not by a requirement to display many chatbots.

## 4.2 Anchored scoring after all hard gates pass

**[I] Proposed score:** `sum(weight × rating / 4)` on a 0–100 scale. Weights and thresholds are internal engineering choices, not empirically validated or official. Record supporting source IDs for every rating; use `unknown`, not a flattering midpoint, when evidence is missing. Unknown material dimensions make the candidate ineligible for final selection.

| Dimension | Weight | 0 anchor | 2 anchor | 4 anchor |
|---|---:|---|---|---|
| Frequency/exposure | 15 | Isolated/recalled only | Repeated verified episodes, limited exposure data | Occurs on many operating days or repeatedly per relevant opportunities, demonstrated with records |
| Severity/economic materiality | 20 | No measured consequence | Verified time loss or small cash loss meaningful to the operator | Material recurring loss, serious guest failure, or operational interruption supported by artifacts and operator priorities |
| A2A structural fit | 20 | Single CRUD task | Two responsibilities but mostly a fixed one-way handoff | Multiple dependent commitments/constraints, competing actions, exceptions, and justified coordination |
| Preventable/control share | 10 | Root cause outside software authority | Some failure path controllable | Evidence identifies the exact preventable divergence and permitted corrective action |
| 115-hour feasibility | 15 | Missing core data/access; unbounded build | One end-to-end path with partial adapters and known gaps | Inputs available, bounded adapters, clear oracle, failure recovery demonstrable |
| Verification/evidence strength | 15 | Opinions alone | Incident artifacts and plausible before/after comparator | Reconstructable cases, independent role corroboration, denominator, and holdout replay set |
| Adoption/commitment | 5 | Polite praise | Decision-maker schedules a concrete follow-up | Operator supplies redacted cases, names a trial owner, and agrees a supervised workflow/test window |

**[I] Proposed selection rule:** require all gates, a score of at least 70, and no zero in severity, A2A fit, feasibility, or verification. Compare the top candidates with a sensitivity check: vary the major weights and inspect whether the winner changes. A narrow score difference is not evidence of a real ranking difference. A skeptical owner and a front-line worker should review the final case card.

**[U] No candidate has been scored as a discovered local winner.** The investigation has not yet obtained the operator evidence needed for G1/G2. The following rows are hypotheses to test, not declarations of market demand.

| Candidate workflow hypothesis | Potential coordination boundary | Evidence needed to keep it | Disconfirming result |
|---|---|---|---|
| Arrival promise and room readiness | Reservation/arrival commitment ↔ readiness responsibility ↔ reception/guest communication | **[I]** Timestamps show room-ready/arrival changes were known but not propagated, causing avoidable delay or recovery cost | Physical room capacity or cleaning labor was the binding constraint; a basic acknowledgement rule solves it |
| Request completion across shifts | Guest request ↔ responsible worker ↔ incoming shift ↔ completion confirmation | **[I]** Repeated requests and lost ownership visible in records; dependency and escalation needs survive a simple-rule baseline | Isolated oversight or no meaningful dependency beyond a to-do list |
| Service delivery to folio settlement | Reservation inclusions ↔ restaurant/event/service records ↔ folio ↔ approval/payment reconciliation | **[I]** Actual charges/credits are missed or duplicated because operational and financial state diverge | Existing PMS configuration resolves it, missing access prevents verification, or issue is purely manual data entry |
| Event/group amendment coordination | Booking changes ↔ rooms ↔ meal/service capacity ↔ cost/guest commitments | **[I]** One verified amendment propagates across several constraints, with measurable failure cost and available records | Too rare, commercially bespoke, or dependent on unprovided integrations for the sprint |
| Staff retention/seasonality itself | Employment economics and demand calendar | **[D]** Raised in V1/P2; **[I]** useful investigation context, but not automatically an A2A use case | Pay, job security, or demand is the cause; reject claims that agents alone fix it |
| Regional demand/margin pressure itself | Commercial strategy, capital, market conditions | **[D]** Raised in V2 and institutional research; **[I]** contextual concern | No bounded operational loss mechanism; macro weakness alone does not justify a Hotel OS workflow |

## 4.3 Prototype boundaries: prove an operating system transaction, not an agent conversation

**[I] Minimum meaningful slice.** Select one verified workflow with cross-responsibility dependencies. Use a canonical event/state model and specialized agents operating through typed commands. Agents can propose, negotiate, dispatch, reject, or escalate within policy; the state-transition service validates authority and invariants. A single accountable coordinator/supervisor can manage the case while specialized agents own real responsibilities. Avoid unrestricted all-to-all messaging and role duplication.

**[I] Example topology, contingent on the selected problem:** intake interprets a booking/change/request and cites its source; a planning/coordinator agent opens a case; reservation/service/readiness or finance agents evaluate their constraints; proposals become explicit commitments; a policy/state service commits valid actions; task acknowledgements and actual human confirmations produce events; timeout/conflict handling escalates or replans. The owner sees the current case, evidence, open commitments, and approval needs rather than having to micromanage each message.

**[I] Essential contracts:**

- Case/event identity, property boundary, source record/version, actor role, timestamp, correlation/causation IDs.
- Command type, preconditions, proposed state change, responsible party, deadline, acknowledgement, and completion evidence.
- Idempotency key, expected version, retry policy, rejected-command reason, and escalation route.
- Policy authority for money, availability promises, cancellations, guest communications, and external writes. In a demo, use simulated sends/refunds unless an operator has explicitly authorized a real trial.
- Separate agent proposal, validated decision, external action, and observed completion. A generated message is not proof of service execution.

**[I] Build boundary.** A functional prototype needs persistent state, adapters, task lifecycle, conflict checks, audit/replay, a small operational console, and evaluations. It does not need to replace every PMS module. Existing PMS/channel data can be systems of record at the boundary. Simulated integrations must be visibly labeled; use real redacted data shapes and a tested connector contract rather than claiming a live hotel deployment.

**[I] Comparative test:** reconstruct the same incoming events under (a) the observed manual workflow, where reliable records exist; (b) a simple deterministic task/rule baseline; and (c) the proposed OS. Compare valid completed cases, missed commitments, conflicts, duplicate actions, handling effort, escalations, latency, and model cost. A2A earns its complexity only if it improves materially relevant outcomes without violating invariants. Do not convert replay performance directly into deployed monetary savings.

## 4.4 A 115-hour critical path with decision points

**[I] Proposed elapsed-hour schedule; stages total 115 hours.** Staffing and parallel work capacity are not assumed. Adjust implementation breadth to the actual team while preserving time for verification.

| Hours | Deliverable | Stop/revise condition |
|---|---|---|
| 0–12 | Targeted repository intake, recruit operators, first interviews and artifact traces | No operator evidence: reduce claims, prioritize securing one real trace; do not market a synthetic problem as validated |
| 12–24 | Reconstruct incident/smooth cases; define denominator/cost; select one gated problem and baseline | Root cause outside software or no meaningful A2A fit: change candidate |
| 24–38 | State schema, typed command/event contracts, policy boundaries, replay fixtures, adapter interface, oracle | Can't specify success and invalid states: don't expand agents |
| 38–66 | End-to-end persistent workflow, specialized agents, dispatch/acknowledgement, operational console | No working vertical path: cut secondary workflows |
| 66–84 | Timeouts, retries, duplicate/out-of-order events, stale versions, escalation, restart/replay | Duplicate external action or invalid state: resolve before cosmetic work |
| 84–103 | Holdout cases, baseline comparison, operator review, observed-effort/cost limits | No baseline advantage: simplify and state result honestly |
| 103–115 | Frozen reproducible demo, evidence pack, reset script, backup replay, pitch tied to proven scope | Do not spend final hours adding unsupported integrations or claims |

**[I] Required verification scenarios:** happy path; changed arrival/request; late/missing acknowledgement; conflicting room/service allocation; duplicate event; out-of-order update; worker or model timeout; invalid model output; denied financial action; stale data; restart/replay; human override. Inputs from messages/reviews are untrusted content, not instructions granting agent authority. Assertions must check state and external-action intent, not just whether an answer sounds correct.

**[I] Suggested pass conditions:** no invariant violation in the defined test set; no duplicate external-action intent under retries; complete source-to-action trace; explicit escalation for unresolved uncertainty; correct recovery after restart; bounded cost/latency measured on the chosen model/runtime. These are engineering acceptance criteria. Numeric improvement targets should be set only after measuring the baseline.

## 4.5 Lean research-to-engineering handoff

**[I] Proposed workspace; only this dossier is created by this task.** Keep raw private evidence out of version control and public demos. Public-source manifests, schemas, redacted fixtures, and evaluations can be reviewed together.

```text
smartstay-hackathon/
├── task_research.md
├── research/
│   ├── manifest.csv
│   ├── raw/                  # restricted/source snapshots; excluded from Git
│   ├── text/                 # page-aware extraction; provenance retained
│   ├── derived/              # coded sources, denominators, scored candidates
│   └── cases/                # redacted, operator-checked incident cards
├── apps/
│   ├── console/              # case state, evidence, approvals, exceptions
│   └── worker/               # agent execution and orchestration
├── packages/
│   ├── domain/               # typed events, commands, constraints
│   ├── agents/               # actual operational responsibilities
│   ├── policy/               # authority, money limits, escalation
│   └── adapters/             # PMS/import/simulator boundaries
├── evals/
│   ├── fixtures/             # redacted train/development and holdout cases
│   ├── baselines/            # deterministic rule/task baseline
│   └── scenarios/            # invariants, failures, restart/replay
└── docs/
    ├── evidence-register.md
    ├── decisions.md
    └── demo-runbook.md
```

**[I] Deliverable for each selected problem:** one evidence-backed case card; raw-source references and hashes; anonymized event trace; counted exposure and verified loss; alternative explanations; existing workaround and simple baseline; completed hard gates and supported score; bounded agent responsibilities and authority; success/failure oracle; known gaps; named operator trial owner if one actually commits.

**[U] Remaining ground-truth work.** Secure operator participation; collect redacted incident/financial artifacts; obtain authorized review coverage; validate language coding; resolve property/entity identities; measure denominators and cash consequences; compare the simple baseline; then finalize the workflow. Institutional reports and practitioner interviews substantially improve where to look, but none alone proves the operational bottleneck that should determine the product.

**[O] Final local validation.** All seven Bash snippets passed `bash -n`. All six Python snippets parsed and were executed against locally staged copies of the retrieved material or the explicitly absent review dataset: five completed successfully; the review aggregation script stopped with the intended `UNESTABLISHED: no authorized review corpus` message. The PDF pipeline processed eight staged PDFs and correctly flagged the TBC overview as lacking usable extracted text. The HTML PDF-link parser returned two language links; the BMG sitemap filter returned 354 candidate URLs; the V1 article extractor returned four candidate paragraphs. These results validate extraction mechanics, not hotel-level incident prevalence. All four requested research dimensions are present in this file.
