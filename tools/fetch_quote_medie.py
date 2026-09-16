#!/usr/bin/env python3
"""Hent billederne der hører til citaterne ned på VPS'en.

Indi spurgte om at få fotos og andre vedhæftninger fra citat-beskederne vist
på siden. parse_quotes.py skriver hvilke billeder der hører til hvilket citat
ind i quotes.json, men ikke selve filerne: discords urler er signerede og er
døde inden for et døgn, så et link ville ikke virke i morgen. Derfor det her.

Den henter listen fra den quotes.json der rent faktisk ligger på qr25.dk. Det
er med vilje: et citat skal først igennem blocklisten, være committet og være
pushet, før billedet bliver hentet. Er citatet aldrig kommet ud, kommer
billedet det heller ikke.

Beskeden bliver slået op igen over API'et for at få en frisk url, og filen
bliver gemt under det navn parse_quotes.py gav den, så den kan caches for
evigt. Filer der allerede ligger der, bliver ikke hentet igen.

Kører på VPS'en, hvor både token og målmappen er:

    scp tools/fetch_quote_medie.py root@vps:/tmp/qm.py
    ssh root@vps 'set -a; . /etc/demokraticlanker/env; set +a; \
        python3 /tmp/qm.py'

--tørt viser hvad den ville hente uden at hente det. En anden liste kan gives
som sti eller url i argv.
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

LISTE = "https://qr25.dk/data/quotes.json"
UD = os.environ.get("QUOTE_MEDIE_DIR", "/var/www/qr25-data/quote-medie")
API = "https://discord.com/api/v10"
GUILD = "1437357663406002288"
KANAL = "1437373994377412640"
UA = "qr25.dk quote media (https://qr25.dk, 1.0)"

# Kun discords egne værter, og kun billeder. Der bliver ikke lavet et GET-kald
# mod hvad som helst nogen har vedhæftet i en chat.
VAERTER = {"cdn.discordapp.com", "media.discordapp.net"}
TYPER = {"image/png", "image/jpeg", "image/gif", "image/webp"}
MAX = 8 * 1024 * 1024


def hent(url, token=None, raa=False):
    hoveder = {"User-Agent": UA}
    if token:
        hoveder["Authorization"] = "Bot " + token
    r = urllib.request.Request(url, headers=hoveder)
    with urllib.request.urlopen(r, timeout=30) as svar:
        if raa:
            return svar
        return json.load(svar)


def hent_fil(url, forventet):
    """Hent én vedhæftning. Returnerer bytes, eller None hvis den ikke duer."""
    vaert = urllib.parse.urlsplit(url).hostname or ""
    if vaert not in VAERTER:
        print("  springer over, ikke discords egen vært:", vaert)
        return None

    r = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(r, timeout=60) as svar:
        type_ = (svar.headers.get("Content-Type") or "").split(";")[0].strip()
        if type_ not in TYPER:
            print("  springer over, er ikke et billede:", type_)
            return None
        if type_ != forventet:
            print(f"  springer over, {type_} men quotes.json siger {forventet}")
            return None
        # Læs et byte mere end loftet, så en fil der er præcis for stor også
        # bliver fanget i stedet for at blive klippet af.
        data = svar.read(MAX + 1)
    if len(data) > MAX:
        print("  springer over, over 8 MB")
        return None
    return data


def skriv(sti, data):
    # skriv ved siden af og byt om, så nginx aldrig kan nå at servere en halv fil
    tmp = sti + ".ny"
    with open(tmp, "wb") as fh:
        fh.write(data)
    os.replace(tmp, sti)


def main():
    toert = "--tørt" in sys.argv or "--tort" in sys.argv
    argv = [a for a in sys.argv[1:] if not a.startswith("-")]
    kilde = argv[0] if argv else LISTE

    token = os.environ.get("DISCORD_TOKEN")
    if not token and not toert:
        sys.exit("DISCORD_TOKEN er ikke sat. set -a; . /etc/demokraticlanker/env; set +a")

    if kilde.startswith("http"):
        data = hent(kilde)
    else:
        with open(kilde, encoding="utf-8") as fh:
            data = json.load(fh)

    med_medie = [q for q in data.get("quotes", []) if q.get("medie")]
    print(f"{len(data.get('quotes', []))} citater, {len(med_medie)} med billede")

    if not toert:
        os.makedirs(UD, exist_ok=True)

    hentet = laa = sprunget = 0
    beholdes = set()
    for q in med_medie:
        efter = {m["fil"]: m for m in q["medie"]
                 if not os.path.exists(os.path.join(UD, m["fil"]))}
        beholdes.update(m["fil"] for m in q["medie"])
        laa += len(q["medie"]) - len(efter)
        if not efter:
            continue

        print(f"{q['id']}  {q['date']}  {len(efter)} fil(er)")
        if toert:
            for navn in efter:
                print("  ville hente", navn)
            continue

        try:
            besked = hent(f"{API}/channels/{KANAL}/messages/{q['id']}", token)
        except urllib.error.HTTPError as fejl:
            # Slettet, eller flyttet. Så er der ikke noget at hente.
            print(f"  kunne ikke slås op: {fejl.code}")
            sprunget += len(efter)
            continue

        for nr, a in enumerate(besked.get("attachments", [])):
            navn = None
            for m in efter.values():
                if m["fil"].startswith(f"{q['id']}-{nr}."):
                    navn = m
                    break
            if not navn:
                continue
            try:
                raa = hent_fil(a["url"], navn["type"])
            except urllib.error.URLError as fejl:
                print("  kunne ikke hentes:", fejl)
                raa = None
            if raa is None:
                sprunget += 1
                continue
            skriv(os.path.join(UD, navn["fil"]), raa)
            print(f"  {navn['fil']}  {len(raa)} bytes")
            hentet += 1

    print(f"\nhentet {hentet}, lå der {laa}, sprunget over {sprunget}")

    # Et citat der er røget ud af quotes.json — blocklisten, exclude.txt, eller
    # beskeden er slettet — skal ikke have sit billede liggende offentligt.
    if not toert and os.path.isdir(UD):
        for navn in sorted(os.listdir(UD)):
            if navn.endswith(".ny") or navn in beholdes:
                continue
            os.remove(os.path.join(UD, navn))
            print("fjernet, hører ikke til et citat mere:", navn)


if __name__ == "__main__":
    main()
