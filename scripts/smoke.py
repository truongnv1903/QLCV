"""Check a built frontend and API served together. Does not create or modify data."""

import sys
from html.parser import HTMLParser

import httpx


class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        target = (
            attrs.get("src")
            if tag == "script"
            else attrs.get("href")
            if tag == "link"
            else None
        )
        if target and target.startswith("/"):
            self.paths.append(target)


with httpx.Client(
    base_url=sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
) as client:
    index = client.get("/")
    assert index.status_code == 200
    assert "La Bàn Công Việc" in index.text
    parser = Assets()
    parser.feed(index.text)
    for path in parser.paths:
        asset = client.get(path)
        assert asset.status_code == 200, path
        assert "text/html" not in asset.headers.get("content-type", ""), path
    assert client.get("/api/health").json() == {"status": "ok"}
    assert client.get("/api/tasks").status_code == 401
    missing = client.get("/api/not-a-route")
    assert missing.status_code == 404
    assert missing.headers["content-type"].startswith("application/json")
    assert client.get("/api/auth/me").headers.get("cache-control") == "no-store"
    print(
        f"Production smoke passed: HTML, {len(parser.paths)} assets, API health, auth guard, JSON404 and cache headers."
    )
