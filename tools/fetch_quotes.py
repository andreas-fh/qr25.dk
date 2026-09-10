#!/usr/bin/env python3
"""Download every message in #quotes to tools/quotes_raw.json.

Needs a bot token that can read the channel:

    DISCORD_TOKEN=... python3 tools/fetch_quotes.py

The token DemokratiClanker already uses works. On the VPS it lives in
/etc/demokraticlanker/env, so:

    ssh root@vps 'set -a; . /etc/demokraticlanker/env; set +a; \
        python3 - /tmp/quotes_raw.json' < tools/fetch_quotes.py
    scp root@vps:/tmp/quotes_raw.json tools/quotes_raw.json

Reading message content needs the Message Content intent switched on for the
application in the Discord developer portal. Without it every message comes
back with an empty "content" and the parser finds nothing.
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request

CHANNEL_ID = "1437373994377412640"
API = "https://discord.com/api/v10"
PAGE = 100

# Piped in over ssh there is no __file__, so fall back to the working
# directory. An explicit path as argv[1] wins over both.
try:
    HERE = os.path.dirname(os.path.abspath(__file__))
except NameError:
    HERE = os.getcwd()
DEFAULT_OUT = os.path.join(HERE, "quotes_raw.json")


def get(url, token):
    request = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bot {token}",
            # Discord rejects requests from bots that do not identify themselves.
            "User-Agent": "qr25.dk quote fetcher (https://qr25.dk, 1.0)",
        },
    )
    while True:
        try:
            with urllib.request.urlopen(request) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code != 429:
                raise
            # Discord hands back how long to wait; trust it rather than guessing.
            wait = float(error.headers.get("Retry-After", "5"))
            print(f"rate limited, waiting {wait}s", file=sys.stderr)
            time.sleep(wait)


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT
    token = os.environ.get("DISCORD_TOKEN")
    if not token:
        sys.exit("DISCORD_TOKEN is not set")

    messages = []
    before = None
    while True:
        url = f"{API}/channels/{CHANNEL_ID}/messages?limit={PAGE}"
        if before:
            url += f"&before={before}"
        page = get(url, token)
        if not page:
            break
        messages.extend(page)
        before = page[-1]["id"]
        print(f"{len(messages)} messages", file=sys.stderr)
        # Well inside the rate limit, and this runs by hand a few times a year.
        time.sleep(0.5)

    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(messages, fh, ensure_ascii=False)
    print(f"wrote {len(messages)} messages to {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
