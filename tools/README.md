# tools

Intet herinde bliver serveret. Se `../README.md` for hele forklaringen.

| fil | hvad |
| --- | --- |
| `fetch_quotes.py` | henter alle beskeder i #quotes til `quotes_raw.json` |
| `parse_quotes.py` | laver `quotes_raw.json` om til `../public/data/quotes.json` |
| `names.json` | Discord-id til det navn der bliver vist, plus `hide` |
| `blocklist.txt` | ord der holder et citat væk fra siden |
| `exclude.txt` | besked-id'er der aldrig må med |
| `include.txt` | besked-id'er der springer blocklisten over |
| `flagged.json` | skrives hver gang: hvad blocklisten fangede, og hvilket ord der fangede det |

Kanal-id og server-id står i toppen af `parse_quotes.py`.

`names.json` har en tvilling på VPS'en, `/opt/qr25-data/navne.json`, så
afstemningerne skriver de samme navne som citaterne. Retter du den ene, så kopier
den over: `scp tools/names.json root@vps:/opt/qr25-data/navne.json`.

Hvis nogen ikke vil have deres navn på en offentlig side, så sæt deres
Discord-id i `hide` i `names.json`. Citaterne bliver, navnet ryger, både pinget og det navn de er skrevet under.
Står navnet inde i selve citatet, bliver det stående: det er hvad personen
sagde, ikke hvem siden siger det er.

Hvis nogen ikke vil have deres citat på siden overhovedet, så sæt beskedens id
i `exclude.txt`. Beskedens id får du i Discord med højreklik og "Kopier
beskeds-id" (kræver udviklertilstand).
