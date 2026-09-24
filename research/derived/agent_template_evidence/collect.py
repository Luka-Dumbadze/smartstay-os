"""Fetch public primary sources; retain HTTP failures and content hashes."""
import concurrent.futures
import datetime
import hashlib
import json
from pathlib import Path
import subprocess
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent
SOURCES = {
    'openai_agents': 'https://developers.openai.com/api/docs/guides/agents-sdk',
    'mcp_architecture': 'https://modelcontextprotocol.io/docs/learn/architecture',
    'mcp_security': 'https://modelcontextprotocol.io/specification/2025-11-25/basic/security_best_practices',
    'a2a': 'https://a2a-protocol.org/latest/topics/overview/',
    'agents_readme': 'https://raw.githubusercontent.com/openai/openai-agents-python/main/README.md',
    'agents_handoffs': 'https://raw.githubusercontent.com/openai/openai-agents-python/main/docs/handoffs.md',
    'agents_context': 'https://raw.githubusercontent.com/openai/openai-agents-python/main/docs/context.md',
    'agents_human': 'https://raw.githubusercontent.com/openai/openai-agents-python/main/docs/human_in_the_loop.md',
    'agents_models': 'https://raw.githubusercontent.com/openai/openai-agents-python/main/docs/models/index.md',
    'agents_tracing': 'https://raw.githubusercontent.com/openai/openai-agents-python/main/docs/tracing.md',
    'agents_pyproject': 'https://raw.githubusercontent.com/openai/openai-agents-python/main/pyproject.toml',
    'swarm': 'https://raw.githubusercontent.com/openai/swarm/main/README.md',
    'langgraph_durable': 'https://docs.langchain.com/oss/python/langgraph/durable-execution',
    'langgraph_interrupt': 'https://docs.langchain.com/oss/python/langgraph/interrupts',
    'langgraph_pyproject': 'https://raw.githubusercontent.com/langchain-ai/langgraph/main/libs/langgraph/pyproject.toml',
    'autogen': 'https://raw.githubusercontent.com/microsoft/autogen/main/README.md',
    'crewai': 'https://raw.githubusercontent.com/crewAIInc/crewAI/main/README.md',
    'crewai_flows': 'https://docs.crewai.com/en/concepts/flows',
    'crewai_pyproject': 'https://raw.githubusercontent.com/crewAIInc/crewAI/main/lib/crewai/pyproject.toml',
    'pydantic_ai': 'https://raw.githubusercontent.com/pydantic/pydantic-ai/main/README.md',
    'google_genai': 'https://raw.githubusercontent.com/googleapis/python-genai/main/README.md',
    'google_thinking': 'https://ai.google.dev/gemini-api/docs/thinking',
    'google_models': 'https://ai.google.dev/gemini-api/docs/models',
    'sqlite_transaction': 'https://www.sqlite.org/lang_transaction.html',
    'sqlite_wal': 'https://www.sqlite.org/wal.html',
    'outbox': 'https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html',
    'react': 'https://arxiv.org/abs/2210.03629',
    'mas_failures': 'https://arxiv.org/abs/2503.13657',
    'autogen_paper': 'https://arxiv.org/abs/2308.08155',
}

def fetch(item):
    sid, url = item
    raw = ROOT / (sid + '.raw')
    result = subprocess.run(['curl', '-L', '--retry', '2', '--max-time', '60', '-sS',
                             '-o', str(raw), '-w', '%{http_code}\n%{url_effective}', url],
                            capture_output=True, text=True)
    lines = result.stdout.splitlines()
    status = lines[0] if lines else '000'
    body = raw.read_bytes() if raw.exists() else b''
    text = body.decode('utf-8', errors='replace')
    if '<html' in text[:3000].lower() or '<!doctype html' in text[:3000].lower():
        soup = BeautifulSoup(text, 'html.parser')
        for tag in soup(['script', 'style', 'nav', 'header', 'footer']):
            tag.decompose()
        text = (soup.find('main') or soup.find('article') or soup).get_text('\n', strip=True)
    (ROOT / (sid + '.txt')).write_text(text)
    return dict(id=sid, url=url, final_url=lines[-1] if len(lines)>1 else url,
                http_status=status, curl_exit=result.returncode, error=result.stderr,
                bytes=len(body), sha256=hashlib.sha256(body).hexdigest(),
                fetched_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                raw=raw.name, text=sid+'.txt')

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default=str(ROOT / 'refresh'),
                        help='Separate destination; original evidence is not overwritten by default')
    args = parser.parse_args()
    original_manifest = ROOT / 'manifest.json'
    if original_manifest.exists():
        SOURCES.update({row['id']: row['url']
                        for row in json.loads(original_manifest.read_text())})
    ROOT = Path(args.output).resolve()
    ROOT.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        rows = list(pool.map(fetch, SOURCES.items()))
    (ROOT/'manifest.json').write_text(json.dumps(rows, indent=2)+'\n')
    for row in rows:
        print(row['id'], row['http_status'], row['bytes'], row['error'][:100])
