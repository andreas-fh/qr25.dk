#!/usr/bin/env python3
"""Download the server nicknames to tools/members.json.

The site prints whatever a person is called on the server right now, so the
names are not kept by hand anywhere: this asks discord and writes down the
answer. Run it again whenever somebody changes their nickname.

    ssh root@vps 'set -a; . /etc/demokraticlanker/env; set +a; \
        python3 - /tmp/members.json' < tools/fetch_members.py
    scp root@vps:/tmp/members.json tools/members.json

Listing members needs the Server Members intent switched on for the
application in the developer portal, the same way reading messages needs the
Message Content intent.
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request

GUILD_ID = "1437357663406002288"
API = "https://discord.com/api/v10"
PAGE = 1000

try:
    HERE = os.path.dirname(os.path.abspath(__file__))
except NameError:
    HERE = os.getcwd()
DEFAULT_OUT = os.path.join(HERE, "members.json")


def get(url, token):
    request = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bot {token}",
            "User-Agent": "qr25.dk member fetcher (https://qr25.dk, 1.0)",
        },
    )
    while True:
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code != 429:
                raise
            wait = float(error.headers.get("Retry-After", "5"))
            print(f"rate limited, waiting {wait}s", file=sys.stderr)
            time.sleep(wait)


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT
    token = os.environ.get("DISCORD_TOKEN")
    if not token:
        sys.exit("DISCORD_TOKEN is not set")

    members = []
    after = "0"
    while True:
        page = get(f"{API}/guilds/{GUILD_ID}/members?limit={PAGE}&after={after}", token)
        if not page:
            break
        members.extend(page)
        after = page[-1]["user"]["id"]
        if len(page) < PAGE:
            break
        time.sleep(0.5)

    users = {}
    for member in members:
        user = member["user"]
        nick = member.get("nick")
        navn = nick or user.get("global_name") or user["username"]
        # Everything this person has ever been called. The quotes are typed by
        # hand, so '- Mikkel <@445...>' has to be recognised as one person and
        # not as Mikkel talking to somebody else, and the name people type is
        # usually the username or the display name rather than the joke
        # nickname the site prints.
        alias = [nick, user.get("global_name"), user.get("username")]
        users[user["id"]] = {
            "navn": navn,
            "alias": sorted({a for a in alias if a and a != navn}),
        }

    roles = {}
    for role in get(f"{API}/guilds/{GUILD_ID}/roles", token):
        if not role.get("managed") and role["name"] != "@everyone":
            roles[role["id"]] = role["name"]

    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump({"guild": GUILD_ID, "users": users, "roles": roles},
                  fh, ensure_ascii=False, indent=1, sort_keys=True)
        fh.write("\n")
    print(f"wrote {len(users)} members and {len(roles)} roles to {out_path}",
          file=sys.stderr)


if __name__ == "__main__":
    main()
