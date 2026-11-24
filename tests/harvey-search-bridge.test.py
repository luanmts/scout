import asyncio
import base64
import importlib.util
import os
import unittest


SPEC = importlib.util.spec_from_file_location(
    "harvey_search_bridge", "scripts/harvey-search-bridge.py"
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class HarveySearchBridgeTests(unittest.TestCase):
    def test_resolves_bing_redirect_before_identity_checks(self):
        target = "https://example.com/contact#fragment"
        token = "a1" + base64.urlsafe_b64encode(target.encode()).decode().rstrip("=")
        wrapped = f"https://www.bing.com/ck/a?u={token}"
        self.assertEqual(MODULE.HarveyWebSearcher.normalize_result_url(wrapped), "https://example.com/contact")

    def test_rejects_homonym_without_name_or_location_evidence(self):
        accepted, _, reason = MODULE.HarveyWebSearcher.relevance(
            {"url": "https://dictionary.example/discount", "title": "Discount definition", "snippet": "A reduction in price"},
            {"name": "Discount Mechanical Heating and Plumbing", "city": "Anchorage", "region": "Alaska", "domain": "discountmechanical.net"},
        )
        self.assertFalse(accepted)
        self.assertEqual(reason, "identity_tokens_insufficient")

    def test_continues_to_google_when_bing_has_only_irrelevant_results(self):
        searcher = MODULE.HarveyWebSearcher()
        os.environ["HARVEY_SEARCH_DELAY_MIN"] = "0"

        async def duck(_):
            return []

        async def bing(_):
            return [("https://dictionary.example/discount", "A reduction in price", "Discount definition")]

        async def google(_):
            return [("https://discountmechanical.net/contact", "Discount Mechanical Heating and Plumbing Anchorage contact", "Discount Mechanical Heating and Plumbing")]

        searcher.search_duckduckgo = duck
        searcher.search_bing = bing
        searcher.search_google = google
        result = asyncio.run(searcher.web_search(
            '"Discount Mechanical Heating and Plumbing" email',
            {"name": "Discount Mechanical Heating and Plumbing", "city": "Anchorage", "region": "Alaska", "domain": "discountmechanical.net"},
        ))
        self.assertEqual(result["provider"], "google_html")
        self.assertEqual([item["provider"] for item in searcher.provider_diagnostics], ["duckduckgo_html", "bing_html", "google_html"])

    def test_google_enablejs_interstitial_is_not_a_valid_empty_search(self):
        body = '<html><head><meta content="0;url=/httpservice/retry/enablejs?sei=abc"></head><body>Google Search<br>redirecionamento não iniciar em alguns segundos</body></html>'
        self.assertTrue(MODULE.HarveyWebSearcher.requires_javascript("google_html", body))
        self.assertFalse(MODULE.HarveyWebSearcher.requires_javascript("google_html", '<div class="g"><h3>Discount Mechanical</h3></div>'))
        self.assertFalse(MODULE.HarveyWebSearcher.requires_javascript("bing_html", body))

    def test_serper_queries_remove_unsupported_quotes(self):
        self.assertEqual(
            MODULE.HarveyWebSearcher.normalize_serper_query('"Discount Mechanical" "Anchorage" email'),
            "Discount Mechanical Anchorage email",
        )

    def test_http_400_is_non_retryable(self):
        searcher = MODULE.HarveyWebSearcher()

        async def request(*args, **kwargs):
            raise AssertionError("network client should not be replaced in this test")

        original = MODULE.httpx.AsyncClient

        class FakeResponse:
            status_code = 400
            text = '{"message":"Query pattern not allowed for free accounts."}'

        class FakeClient:
            async def __aenter__(self): return self
            async def __aexit__(self, *args): return False
            async def request(self, *args, **kwargs): return FakeResponse()

        MODULE.httpx.AsyncClient = lambda *args, **kwargs: FakeClient()
        try:
            result = asyncio.run(searcher.fetch("serper", "https://google.serper.dev/search", retries=3))
        finally:
            MODULE.httpx.AsyncClient = original
        self.assertIsNone(result)
        self.assertEqual(len(searcher.attempts), 1)
        self.assertEqual(searcher.attempts[0]["reason"], "query_rejected")
        self.assertFalse(searcher.attempts[0]["retryable"])

    def test_provider_errors_are_independent(self):
        searcher = MODULE.HarveyWebSearcher()
        os.environ["HARVEY_SEARCH_DELAY_MIN"] = "0"

        async def duck(_):
            raise RuntimeError("temporary duck failure")

        async def bing(_):
            return [("https://example.com/contact", "Acme Heating Austin contact", "Acme Heating")]

        searcher.search_duckduckgo = duck
        searcher.search_bing = bing
        result = asyncio.run(searcher.web_search("Acme Heating email", {"name": "Acme Heating", "city": "Austin", "region": "Texas", "domain": "acmeheating.com"}))
        self.assertEqual(result["provider"], "bing_html")
        self.assertTrue(any(item.get("provider") == "duckduckgo_html" and "temporary duck failure" in item.get("error", "") for item in searcher.attempts))


if __name__ == "__main__":
    unittest.main()
