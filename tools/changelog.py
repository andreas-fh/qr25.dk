#!/usr/bin/env python3
"""Changelog- og idékanalen på discord.

Kanalen er der af to grunde. Den ene er at klassen kan se hvad der er blevet
lavet om på siden uden at læse en commit-log. Den anden er at folk kan skrive
idéer ind, og de bliver samlet op derfra.

To ting den kan:

    post <fil.json>   lægger et embed op. filen er {"titel", "tekst", "punkter"}
    nyt [efter-id]    skriver de beskeder ud der er kommet siden efter-id

Begge dele kræver bottens token, så den kører på VPS'en:

    scp tools/changelog.py root@vps:/tmp/cl.py
    scp changelog.json root@vps:/tmp/cl.json
    ssh root@vps 'set -a; . /etc/demokraticlanker/env; set +a; \
        python3 /tmp/cl.py post /tmp/cl.json'

'nyt' skriver til sidst det id den nåede til. Skriv det ind i
tools/changelog_state.json, så starter næste læsning der og ikke forfra.
"""

import json
import os
import sys
import urllib.error
import urllib.request

KANAL = "1549329884256411720"
API = "https://discord.com/api/v10"

# Der er ingen regnbue i et embed, men der skal heller ikke være grå. Den her
# er den samme grønne som "det er kagepause" på siden.
FARVE = 0x35C93A


def kald(sti, metode="GET", krop=None):
    token = os.environ.get("DISCORD_TOKEN")
    if not token:
        sys.exit("DISCORD_TOKEN er ikke sat")
    data = json.dumps(krop).encode() if krop is not None else None
    r = urllib.request.Request(
        API + sti,
        data=data,
        method=metode,
        headers={
            "Authorization": "Bot " + token,
            "User-Agent": "qr25.dk changelog (https://qr25.dk, 1.0)",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(r, timeout=20) as svar:
            return json.load(svar)
    except urllib.error.HTTPError as fejl:
        sys.exit(f"discord svarede {fejl.code}: {fejl.read().decode()[:400]}")


def post(sti):
    with open(sti, encoding="utf-8") as fh:
        ind = json.load(fh)

    linjer = []
    if ind.get("tekst"):
        linjer.append(ind["tekst"])
    for punkt in ind.get("punkter", []):
        linjer.append("- " + punkt)

    embed = {
        "title": ind.get("titel", "qr25.dk"),
        "description": "\n".join(linjer)[:4000],
        "color": ind.get("farve", FARVE),
        "url": "https://qr25.dk",
    }
    if ind.get("fod"):
        embed["footer"] = {"text": ind["fod"]}
    if ind.get("dato"):
        embed["timestamp"] = ind["dato"]

    svar = kald(f"/channels/{KANAL}/messages", "POST", {"embeds": [embed]})
    print("lagt op:", svar["id"])


def nyt(efter):
    sti = f"/channels/{KANAL}/messages?limit=100"
    if efter:
        sti += "&after=" + efter
    beskeder = kald(sti)
    beskeder.sort(key=lambda m: int(m["id"]))

    egne = 0
    for m in beskeder:
        if m.get("author", {}).get("bot"):
            egne += 1
            continue
        navn = m["author"].get("global_name") or m["author"]["username"]
        print(f"[{m['id']}] {m['timestamp'][:10]} {navn}: {m.get('content', '')}")

    if beskeder:
        print(f"\nnåede til: {beskeder[-1]['id']}  ({len(beskeder) - egne} fra mennesker, {egne} fra botten)")
    else:
        print("ikke noget nyt")


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    if sys.argv[1] == "post":
        post(sys.argv[2])
    elif sys.argv[1] == "nyt":
        nyt(sys.argv[2] if len(sys.argv) > 2 else None)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
