# tools

Intet herinde bliver serveret. Se `../README.md` for hele forklaringen.

| fil | hvad |
| --- | --- |
| `fetch_quotes.py` | henter alle beskeder i #quotes til `quotes_raw.json` |
| `parse_quotes.py` | laver `quotes_raw.json` om til `../public/data/quotes.json` |
| `fetch_members.py` | henter kaldenavnene til `members.json` |
| `members.json` | kaldenavne, kun brugt til at genkende hvem der er hvem |
| `names.json` | kun `hide`: hvem der ikke skal nævnes ved navn |
| `blocklist.txt` | ord der holder et citat væk fra siden |
| `exclude.txt` | besked-id'er der aldrig må med |
| `include.txt` | besked-id'er der springer blocklisten over |
| `changelog.py` | lægger changelog-embeds op i #changelog og læser idéer derfra |
| `changelog_state.json` | hvor langt idékanalen er læst |
| `flagged.json` | skrives hver gang: hvad blocklisten fangede, og hvilket ord der fangede det |

Kanal-id og server-id står i toppen af `parse_quotes.py`.

Der bliver ikke skrevet navne i `quotes.json`. Et ping bliver til et
discord-id, og browseren slår det op i `data.qr25.dk/navne.json`, som VPS'en
bygger ud fra discord hvert kvarter. Skifter nogen kaldenavn, følger siden med
af sig selv. `members.json` bliver kun brugt mens parseren læser, til at
genkende at "Mikkel" og `<@445...>` er den samme, så den behøver ikke være ny.

Et navn der er skrevet i hånden i stedet for pinget bliver stående præcis som
der står. Det er lærerne og andre der ikke er på serveren.

Hvis nogen ikke vil have deres navn på en offentlig side, så sæt deres
Discord-id i `hide` i `names.json`. Citaterne bliver, navnet ryger. Pinget bliver smidt væk i stedet for skrevet i
filen, så der er ikke noget at slå op, og det navn de er skrevet under ryger
også.
Står navnet inde i selve citatet, bliver det stående: det er hvad personen
sagde, ikke hvem siden siger det er.

Hvis nogen ikke vil have deres citat på siden overhovedet, så sæt beskedens id
i `exclude.txt`. Beskedens id får du i Discord med højreklik og "Kopier
beskeds-id" (kræver udviklertilstand).

`blocklist.txt` skal også ligge på VPS'en som `/opt/qr25-data/blocklist.txt`.
Botten læser den, når den skriver Tristans nyeste besked. Retter du i listen,
så kopier den derover — den bliver læst forfra af sig selv, når filen er ny.

## Changelog- og idékanalen

Kanal `1549329884256411720`. Hver gang der bliver lavet noget om på siden, skal
der op et embed med hvad der er lavet. Folk skriver idéer ind i den samme
kanal.

```
scp tools/changelog.py root@vps:/tmp/cl.py
scp changelog.json root@vps:/tmp/cl.json
ssh root@vps 'set -a; . /etc/demokraticlanker/env; set +a; python3 /tmp/cl.py post /tmp/cl.json'
```

`changelog.json` er `{"version", "titel", "tekst", "punkter", "fod"}`.
Versionen står i bunden af embeddet og tæller op ved hver changelog: store ting
foran, små ting bagved. Den står i `changelog_state.json`, så tag den derfra og
skriv den nye tilbage.

Skal en changelog rettes bagefter, så sæt beskedens id bagerst, så bliver den
samme besked skrevet om i stedet for at der kommer to:

```
ssh root@vps '... python3 /tmp/cl.py post /tmp/cl.json 1549331391819419711'
```

Og for at læse det folk har skrevet siden sidst:

```
ssh root@vps 'set -a; . /etc/demokraticlanker/env; set +a; python3 /tmp/cl.py nyt <sidst_laest>'
```

`sidst_laest` står i `changelog_state.json`. Skriv det id kommandoen nåede til
tilbage i filen bagefter, ellers bliver hele kanalen læst forfra næste gang.
