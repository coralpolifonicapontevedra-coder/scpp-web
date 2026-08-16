#!/usr/bin/env python3

from __future__ import annotations

import sys
from collections import deque
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
from urllib.parse import urldefrag, urljoin, urlparse
from urllib.request import Request, urlopen

BASE_URL = "https://scpp-web.pages.dev/"
MAX_URLS = 800
TIMEOUT = 20
SKIP_PREFIXES = ("/portal/", "/api/")
SKIP_SCHEMES = ("mailto:", "tel:", "javascript:", "data:")


class LinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_dict = dict(attrs)
        for key in ("href", "src"):
            value = attrs_dict.get(key)
            if value:
                self.links.append(value.strip())


def normalize(url: str) -> str:
    return urldefrag(url)[0]


def is_internal(url: str) -> bool:
    return urlparse(url).netloc == urlparse(BASE_URL).netloc


def should_skip(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return True
    return any(parsed.path.startswith(prefix) for prefix in SKIP_PREFIXES)


def fetch(url: str) -> tuple[int, str, str]:
    request = Request(
        url,
        headers={
            "User-Agent": "SCPP-Link-Checker/1.0 (+GitHub Actions)",
            "Accept": "text/html,application/xhtml+xml,application/pdf,image/*,*/*;q=0.8",
        },
    )
    try:
        with urlopen(request, timeout=TIMEOUT) as response:
            status = response.getcode()
            content_type = response.headers.get("Content-Type", "").lower()
            body = ""
            if "text/html" in content_type:
                body = response.read().decode("utf-8", errors="replace")
            return status, content_type, body
    except HTTPError as exc:
        return exc.code, exc.headers.get("Content-Type", "").lower(), ""
    except (URLError, TimeoutError, OSError) as exc:
        raise RuntimeError(str(exc)) from exc


def main() -> int:
    queue: deque[str] = deque([BASE_URL])
    seen: set[str] = set()
    failures: list[tuple[str, str]] = []
    checked = 0

    while queue and checked < MAX_URLS:
        url = normalize(queue.popleft())
        if not url or url in seen or should_skip(url):
            continue
        seen.add(url)

        if not is_internal(url):
            continue

        checked += 1
        print(f"[{checked}] {url}")

        try:
            status, content_type, body = fetch(url)
        except RuntimeError as exc:
            failures.append((url, f"erro de rede: {exc}"))
            continue

        if status < 200 or status >= 400:
            failures.append((url, f"HTTP {status}"))
            continue

        if "text/html" not in content_type or not body:
            continue

        parser = LinkParser()
        parser.feed(body)
        for raw_link in parser.links:
            lowered = raw_link.lower()
            if not raw_link or lowered.startswith(SKIP_SCHEMES) or raw_link.startswith("#"):
                continue
            absolute = normalize(urljoin(url, raw_link))
            if absolute and is_internal(absolute) and not should_skip(absolute):
                queue.append(absolute)

    print(f"\nURLs públicas comprobadas: {checked}")

    if queue:
        print(f"Aviso: alcanzouse o límite de {MAX_URLS} URLs.")

    if failures:
        print("\nLigazóns ou recursos con problemas:")
        for url, reason in failures:
            print(f"- {reason}: {url}")
        return 1

    print("Non se detectaron ligazóns internas públicas rotas.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
