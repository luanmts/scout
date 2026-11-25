#!/usr/bin/env python3
"""Scout optional contact-search bridge.

This is the search backend portion of ethanplusai/harvey's Scout agent,
preserved here under the upstream MIT license. It intentionally exposes
only search: Scout keeps its own identity checks, page extraction,
deduplication, queue and persistence.
"""

import asyncio
import base64
import json
import logging
import os
import random
import re
import sys
from html import unescape
from urllib.parse import parse_qs, quote_plus, urlparse

import httpx
from bs4 import BeautifulSoup

MAX_QUERIES_PER_CYCLE = 3
MAX_RESULTS_PER_QUERY = 20
HTTP_TIMEOUT = 15.0
MAX_RETRIES = 3
BACKOFF_BASE = 1.5
SEARCH_DELAY = (2.0, 5.0)
USER_AGENTS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/119.0.0.0 Safari/537.36",
]
BLOCK_MARKERS = (
    "unusual traffic", "captcha", "are you a robot", "verify you are human",
    "detected unusual activity", "access denied", "/sorry/index",
)
GOOGLE_JS_RETRY_MARKERS = ("/httpservice/retry/enablejs", "enablejs", "redirecionamento não iniciar")
logger = logging.getLogger("scout.contact_search_bridge")


class ContactSearchClient:
    """Direct port of Scout's provider fallback and bounded HTTP behavior."""

    def __init__(self):
        self.queries = 0
        self.attempts: list[dict] = []
        self.provider_diagnostics: list[dict] = []

    def headers(self, extra=None):
        headers = {
            "User-Agent": random.choice(USER_AGENTS),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
        if extra:
            headers.update(extra)
        return headers

    @staticmethod
    def blocked(text: str) -> bool:
        low = (text or "")[:4000].lower()
        return any(marker in low for marker in BLOCK_MARKERS)

    @staticmethod
    def requires_javascript(provider: str, text: str) -> bool:
        if provider != "google_html":
            return False
        low = (text or "")[:20000].lower()
        return any(marker in low for marker in GOOGLE_JS_RETRY_MARKERS) and not ("div class=\"g\"" in low or "<h3" in low)

    @staticmethod
    def normalize_serper_query(query: str) -> str:
        """Keep the existing contextual query, but remove unsupported quote syntax."""
        return re.sub(r"\s+", " ", (query or "").replace('“', '').replace('”', '').replace('"', '')).strip()

    async def fetch(self, provider: str, url: str, *, method="GET", json_body=None, headers=None, retries=MAX_RETRIES):
        last_error = ""
        for attempt in range(retries):
            try:
                async with httpx.AsyncClient(timeout=HTTP_TIMEOUT, follow_redirects=True, trust_env=False) as client:
                    response = await client.request(method, url, json=json_body, headers=self.headers(headers))
                if response.status_code in (429, 500, 502, 503, 504):
                    last_error = f"HTTP {response.status_code}"
                elif response.status_code == 200:
                    if self.blocked(response.text):
                        last_error = "provider challenge or access block detected"
                        break
                    if self.requires_javascript(provider, response.text):
                        metadata = {
                            "provider": provider,
                            "url": url,
                            "status": response.status_code,
                            "contentType": response.headers.get("content-type", ""),
                            "bytes": len(response.content),
                            "finalUrl": str(response.url),
                            "reason": "requires_javascript",
                        }
                        self.attempts.append(metadata)
                        self.provider_diagnostics.append({**metadata, "rawResults": 0, "validUrls": 0, "relevantSources": 0, "accepted": False})
                        return None
                    return response
                else:
                    last_error = f"HTTP {response.status_code}"
                    break
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                last_error = f"{type(exc).__name__}: {exc}"
            if attempt < retries - 1:
                await asyncio.sleep(BACKOFF_BASE * (2 ** attempt) + random.uniform(0, 1))
        reason = "query_rejected" if last_error == "HTTP 400" else "request_failed"
        self.attempts.append({"provider": provider, "url": url, "error": last_error or "request failed", "reason": reason, "retryable": reason != "query_rejected"})
        return None

    @staticmethod
    def normalize_result_url(value: str) -> str:
        """Resolve DDG/Bing wrappers before relevance or identity checks."""
        try:
            parsed = urlparse(unescape(value))
            params = parse_qs(parsed.query)
            wrapped = params.get("uddg", [""])[0]
            if wrapped:
                value = wrapped
            elif parsed.netloc.lower().endswith("bing.com") and params.get("u"):
                token = params["u"][0]
                if token.startswith("a1"):
                    padded = token[2:] + "=" * (-len(token[2:]) % 4)
                    value = base64.urlsafe_b64decode(padded).decode("utf-8", "ignore")
        except (ValueError, UnicodeError):
            return ""
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            return ""
        return parsed._replace(fragment="").geturl().rstrip("/")

    @staticmethod
    def dedupe(results):
        seen, output = set(), []
        for url, snippet, title in results:
            normalized = ContactSearchClient.normalize_result_url(url)
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            output.append({"url": normalized, "snippet": snippet, "title": title})
        return output

    @staticmethod
    def _tokens(value: str) -> set[str]:
        stop = {"the", "and", "of", "in", "for", "with", "email", "contact", "home", "service", "company", "llc", "inc"}
        return {token for token in re.findall(r"[a-z0-9]+", (value or "").lower()) if len(token) >= 3 and token not in stop}

    @classmethod
    def relevance(cls, result: dict, context: dict) -> tuple[bool, float, str]:
        name_tokens = cls._tokens(context.get("name", ""))
        location_tokens = cls._tokens(f"{context.get('city', '')} {context.get('region', '')}")
        domain = (context.get("domain", "") or "").lower().removeprefix("www.")
        url = result["url"].lower()
        host = urlparse(url).hostname or ""
        host = host.removeprefix("www.")
        corpus = f"{result.get('title', '')} {result.get('snippet', '')} {url}".lower()
        name_hits = len([token for token in name_tokens if token in corpus])
        name_ratio = name_hits / len(name_tokens) if name_tokens else 0
        location_match = any(token in corpus for token in location_tokens)
        official = bool(domain and (host == domain or host.endswith(f".{domain}")))
        contact_path = bool(re.search(r"/(contact|about|location|team|service|quote)", url))
        directory = host in {"yelp.com", "bbb.org", "yellowpages.com", "manta.com", "angi.com"} or "directory" in host
        if official:
            return True, 1.0 if contact_path else 0.9, "official_domain"
        if name_ratio >= 0.6 and (location_match or directory):
            return True, 0.75, "name_and_location_or_directory"
        if name_ratio >= 0.8:
            return True, 0.7, "strong_name_match"
        return False, name_ratio, "identity_tokens_insufficient"

    def relevant_results(self, raw_results, context):
        valid = self.dedupe(raw_results)
        relevant = []
        for result in valid:
            accepted, score, reason = self.relevance(result, context)
            result["relevance"] = score
            result["relevanceReason"] = reason
            if accepted:
                relevant.append(result)
        relevant.sort(key=lambda item: item.get("relevance", 0), reverse=True)
        return valid, relevant

    async def search_serper(self, query, api_key):
        normalized_query = self.normalize_serper_query(query)
        response = await self.fetch("serper", "https://google.serper.dev/search", method="POST", json_body={"q": normalized_query, "num": MAX_RESULTS_PER_QUERY}, headers={"X-API-KEY": api_key, "Content-Type": "application/json"}, retries=1)
        if response is None:
            return []
        try:
            data = response.json()
        except (ValueError, json.JSONDecodeError):
            return []
        return [(item.get("link", ""), item.get("snippet", ""), item.get("title", "")) for item in data.get("organic", []) if isinstance(item, dict) and item.get("link")][:MAX_RESULTS_PER_QUERY]

    async def search_duckduckgo(self, query):
        url = f"https://html.duckduckgo.com/html/?q={quote_plus(query)}"
        response = await self.fetch("duckduckgo_html", url)
        if response is None:
            return []
        soup = BeautifulSoup(response.text, "html.parser")
        results = []
        for item in soup.select(".result"):
            link = item.select_one(".result__a")
            snippet = item.select_one(".result__snippet")
            if not link or not link.get("href"):
                continue
            href = str(link.get("href"))
            if "uddg=" in href:
                href = parse_qs(urlparse(href).query).get("uddg", [href])[0]
            if href.startswith("http"):
                results.append((href, snippet.get_text(" ", strip=True) if snippet else "", link.get_text(" ", strip=True)))
        return results[:MAX_RESULTS_PER_QUERY]

    async def search_bing(self, query):
        url = f"https://www.bing.com/search?q={quote_plus(query)}&count={MAX_RESULTS_PER_QUERY}"
        response = await self.fetch("bing_html", url)
        if response is None:
            return []
        soup = BeautifulSoup(response.text, "html.parser")
        results = []
        for item in soup.select("li.b_algo"):
            link = item.select_one("h2 a")
            snippet = item.select_one(".b_caption p")
            if link and link.get("href", "").startswith("http"):
                results.append((str(link["href"]), snippet.get_text(" ", strip=True) if snippet else "", link.get_text(" ", strip=True)))
        return results[:MAX_RESULTS_PER_QUERY]

    async def search_google(self, query):
        url = f"https://www.google.com/search?q={quote_plus(query)}&num={MAX_RESULTS_PER_QUERY}"
        response = await self.fetch("google_html", url, retries=1)
        if response is None:
            return []
        soup = BeautifulSoup(response.text, "html.parser")
        results = []
        for item in soup.select("div.g"):
            link = item.select_one("a")
            snippet = item.select_one("div.VwiC3b")
            if link and link.get("href", "").startswith("http"):
                results.append((str(link["href"]), snippet.get_text(" ", strip=True) if snippet else "", item.get_text(" ", strip=True)))
        return results[:MAX_RESULTS_PER_QUERY]

    async def web_search(self, query, context):
        if self.queries >= MAX_QUERIES_PER_CYCLE:
            return {"query": query, "provider": "query_limit", "results": []}
        self.queries += 1
        if self.queries > 1:
            await asyncio.sleep(float(os.getenv("HARVEY_SEARCH_DELAY_MIN", SEARCH_DELAY[0])))
        backends = []
        if os.getenv("SERPER_API_KEY"):
            backends.append(("serper", lambda: self.search_serper(query, os.environ["SERPER_API_KEY"])))
        backends.extend([
            ("duckduckgo_html", lambda: self.search_duckduckgo(query)),
            ("bing_html", lambda: self.search_bing(query)),
            ("google_html", lambda: self.search_google(query)),
        ])
        for provider, backend in backends:
            try:
                raw_results = await backend()
                valid_results, relevant_results = self.relevant_results(raw_results, context)
                diagnostic = {"provider": provider, "rawResults": len(raw_results), "validUrls": len(valid_results), "relevantSources": len(relevant_results), "accepted": bool(relevant_results), "reason": "relevant_sources_found" if relevant_results else "no_relevant_sources"}
                prior = next((item for item in reversed(self.provider_diagnostics) if item.get("provider") == provider and item.get("reason") == "requires_javascript"), None)
                if prior:
                    diagnostic.update({key: prior[key] for key in ("status", "contentType", "bytes", "finalUrl", "reason") if key in prior})
                    self.provider_diagnostics[self.provider_diagnostics.index(prior)] = diagnostic
                else:
                    self.provider_diagnostics.append(diagnostic)
                if relevant_results:
                    return {"query": query, "provider": provider, "results": relevant_results}
            except Exception as exc:
                self.attempts.append({"provider": provider, "error": f"{type(exc).__name__}: {exc}"})
                self.provider_diagnostics.append({"provider": provider, "rawResults": 0, "validUrls": 0, "relevantSources": 0, "accepted": False, "error": f"{type(exc).__name__}: {exc}"})
        return {"query": query, "provider": "unavailable", "results": []}


async def main():
    payload = json.load(sys.stdin)
    queries = payload.get("queries", [])[:MAX_QUERIES_PER_CYCLE]
    context = payload.get("context", {}) if isinstance(payload.get("context", {}), dict) else {}
    searcher = ContactSearchClient()
    results = [await searcher.web_search(query, context) for query in queries if isinstance(query, str) and query.strip()]
    json.dump({"queries": results, "attempts": searcher.attempts, "providers": searcher.provider_diagnostics}, sys.stdout)


if __name__ == "__main__":
    asyncio.run(main())
