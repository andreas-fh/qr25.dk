#!/usr/bin/env python3
"""Changelog- og idékanalen på discord.

Kanalen er der af to grunde. Den ene er at klassen kan se hvad der er blevet
lavet om på siden uden at læse en commit-log. Den anden er at folk kan skrive
idéer ind, og de bliver samlet op derfra.

To ting den kan:

    post <fil.json> [besked-id]   lægger et embed op, eller retter et der
                                  allerede ligger der hvis der står et id
    nyt [efter-id]                skriver de beskeder ud der er kommet siden

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
import re
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


GUILD = "1437357663406002288"
PING = re.compile(r"<@!?(\d+)>")


def tjek_pings(tekst):
    """Stop hvis der bliver nævnt et discord-id der ikke findes på serveren.

    Et embed med et forkert id peger på en helt anden person, eller på ingen,
    og det opdager man først når det står i kanalen. Det er billigere at
    spørge discord én gang end at rette en besked bagefter.
    """
    ider = set(PING.findall(tekst))
    if not ider:
        return
    kendte = {m["user"]["id"] for m in kald(f"/guilds/{GUILD}/members?limit=1000")}
    ukendte = sorted(ider - kendte)
    if ukendte:
        sys.exit(
            "disse id'er findes ikke på serveren: " + ", ".join(ukendte)
            + "\nslå dem op i tools/members.json i stedet for at gætte."
        )


def post(sti, besked=None):
    with open(sti, encoding="utf-8") as fh:
        ind = json.load(fh)

    linjer = []
    if ind.get("tekst"):
        linjer.append(ind["tekst"])
    for punkt in ind.get("punkter", []):
        linjer.append("- " + punkt)

    tjek_pings(" ".join([ind.get("titel", "")] + linjer))

    embed = {
        "title": ind.get("titel", "qr25.dk"),
        "description": "\n".join(linjer)[:4000],
        "color": ind.get("farve", FARVE),
        "url": "https://qr25.dk",
    }
    # Versionen står i foden. Den blev bedt om i kanalen, og et changelog uden
    # et nummer er bare en dagbog.
    fod = ind.get("fod", "qr25.dk")
    if ind.get("version"):
        fod = fod + " v" + ind["version"]
    embed["footer"] = {"text": fod}
    if ind.get("dato"):
        embed["timestamp"] = ind["dato"]

    if besked:
        kald(f"/channels/{KANAL}/messages/{besked}", "PATCH", {"embeds": [embed]})
        print("rettet:", besked)
    else:
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
        post(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
    elif sys.argv[1] == "nyt":
        nyt(sys.argv[2] if len(sys.argv) > 2 else None)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
