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
