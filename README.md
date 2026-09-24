# qr25.dk

Klassesiden for QR25, Aalborg Tekniske Gymnasium. Den svarer på to spørgsmål:

1. Er det kagepause? (10:20 til 10:30, mandag til fredag)
2. Hvad er dagens citat fra #quotes?
3. Hvad står der i vedtægterne?
4. Hvad bliver der stemt om lige nu?

Og så det folk har bedt om i #hjemmeside-changelog-og-ideer: Tristans nyeste
gif, Dangus' profilbillede, et kinesisk flag der flager, en sang, og en
cookie-boks hvor nej-knappen ikke virker, og en nedtælling på 69 år. Resten
står der ikke, og det er med vilje.

Ren HTML, CSS og JavaScript. Intet byggetrin, ingen framework, ingen
`node_modules`, ingen skrifttyper hentet ude fra. Alt der bliver serveret ligger
i `public/`. Cloudflare Workers hoster mappen som statiske filer.

## Sådan hænger det sammen

```
public/index.html          siden
public/assets/style.css    hele stilen
public/assets/app.js       uret, dagens citat og resten af kasserne
public/data/quotes.json    de citater der er godkendt til at ligge offentligt
tools/fetch_quotes.py      henter #quotes ned fra Discord
tools/parse_quotes.py      laver rådataene om til quotes.json
tools/fetch_quote_medie.py henter billederne fra citat-beskederne ned på VPS'en
tools/fetch_members.py     henter kaldenavnene ned, så parseren kan genkende dem
tools/members.json         kaldenavnene på det tidspunkt filen blev hentet
tools/names.json           hvem der ikke skal nævnes ved navn
tools/changelog.py         lægger changelog op i #changelog og henter idéer
tools/changelog_state.json hvor langt idékanalen er læst
tools/blocklist.txt        ord der holder et citat væk fra siden
tools/exclude.txt          enkelte beskeder der aldrig må med
tools/include.txt          enkelte beskeder der springer blocklisten over
```

`tools/` bliver ikke serveret. Kun `public/` gør.

## Kør den lokalt

```
python3 -m http.server -d public 8000
```

Og åbn http://localhost:8000.

## Opdater citaterne

Botten DemokratiClanker har allerede adgang til kanalen, så dens token virker.
På VPS'en ligger den i `/etc/demokraticlanker/env`.

```
ssh root@vps 'set -a; . /etc/demokraticlanker/env; set +a; python3 - /tmp/quotes_raw.json' < tools/fetch_quotes.py
scp root@vps:/tmp/quotes_raw.json tools/quotes_raw.json
python3 tools/parse_quotes.py
```

Eller, hvis du har en token lokalt:

```
DISCORD_TOKEN=... python3 tools/fetch_quotes.py
python3 tools/parse_quotes.py
```

Skifter nogen kaldenavn, skal du ikke gøre noget. Se "Navnene" nedenfor.
Parseren bruger `tools/members.json` til at genkende hvem der er hvem mens den
læser, og den behøver ikke være dugfrisk, men vil du opdatere den:

```
ssh root@vps 'set -a; . /etc/demokraticlanker/env; set +a; python3 - /tmp/members.json' < tools/fetch_members.py
scp root@vps:/tmp/members.json tools/members.json
```

`parse_quotes.py` skriver `public/data/quotes.json` og fortæller hvor mange
beskeder der blev sorteret fra og hvorfor. Commit `public/data/quotes.json`.
`tools/quotes_raw.json` bliver ikke committet, se `.gitignore`.

### Navnene

Der står ingen navne i `quotes.json`. Der står discord-id'er, og navnet bliver
slået op i browseren hver gang siden åbnes:

```
"lines": [{"text": "...", "speakerId": "873891628660719677"}]
```

Opslaget er `https://data.qr25.dk/navne.json`, som VPS'en bygger ud fra discord
hvert kvarter. Skifter nogen kaldenavn, står det nye navn på siden inden for et
kvarter, uden at nogen skal køre en parser eller pushe noget. Folk skifter navn
tit, og det er hele pointen med at gøre det sådan.

Pings inde i selve citatteksten bliver også stående som pings og slået op på
samme måde, og det samme gør et ping i noten (`til <@id>`).

Svarer `navne.json` ikke, bruger siden det den så sidst, gemt i browseren. Har
den heller ikke det, står der "nogen". Citatet står der stadig.

Et navn der er skrevet i hånden i stedet for pinget er ikke et id og bliver
aldrig slået op. Det er lærerne og andre der ikke er på serveren, så der er
hverken et id eller en anden stavemåde. Står der "haje", står der "haje". Af de
364 citater har 325 linjer et ping, 51 et håndskrevet navn og 29 ingen af
delene.

`- Tristan <@id>` er én person nævnt to gange, `- Sofie til <@malte>` er to.
Parseren kender forskellen på hvad der står imellem dem: er der ingenting
mellem navnet og pinget, er det den samme person, og pinget vinder. Navnene
behøver ikke ligne hinanden, folk skriver "Tristan" om en der hedder "Trisdan"
på serveren.

Vil nogen ikke nævnes, så sæt deres id i `hide` i `tools/names.json` og kør
parseren. Så bliver pinget smidt væk i stedet for skrevet i filen, og der er
ikke noget at slå op. Skal de også være væk fra afstemningerne, så skriv id'et
i `/opt/qr25-data/skjul.json` på VPS'en som en liste.

`tools/members.json` bliver kun brugt mens parseren læser, til at genkende at
"Mikkel" og `<@445...>` er den samme. Den afgør ikke hvad der står på siden.

Blocklisten kigger ikke på navne længere, for der er ingen navne i filen at
kigge på. Den kigger på citatteksten og på noten.

## Vedtægterne og afstemningerne

Kasserne henter fra `https://data.qr25.dk`, som er nginx på VPS'en
(161.97.159.207). qr25.dk er statiske filer på Cloudflare og kan ikke selv nå
ind til DemokratiClanker, så VPS'en bygger to json-filer og serverer dem med
CORS for qr25.dk.

```
qr25.dk (Cloudflare)                     VPS (161.97.159.207)
  public/assets/app.js  --- fetch --->   nginx: data.qr25.dk
                                           /var/www/qr25-data/vedtaegter.json
                                           /var/www/qr25-data/polls.json
                                           /var/www/qr25-data/navne.json
                                                 ^
                                           cron hvert minut
                                           /opt/qr25-data/build.py
                                             <- /var/lib/demokraticlanker/store.json
                                             <- nyeste pdf i #rules (Discord API)

                                           /var/www/qr25-data/live/senest.json
                                           /var/www/qr25-data/live/medie/*
                                                 ^
                                           DemokratiClanker, på gatewayen
                                           /opt/demokraticlanker/src/senest.js
                                             <- messageCreate (Discord gateway)
                                             <- selve gif'en (Discord CDN)

                        --- POST /tael -->   nginx -> 127.0.0.1:8787
                                           /opt/qr25-data/taeller.py
                                             -> /var/lib/qr25-tael/tael
```

Alt det på VPS'en ligger uden for dette repo. Filerne er:

| på VPS'en | hvad |
| --- | --- |
| `/opt/qr25-data/build.py` | bygger begge json-filer |
| `/opt/qr25-data/taeller.py` | besøgstælleren, én http-service på 127.0.0.1:8787 |
| `/etc/systemd/system/qr25-tael.service` | holder tælleren kørende |
| `/var/lib/qr25-tael/tael` | selve tallet, én linje |
| `/etc/nginx/sites-available/data.qr25.dk.conf` | vhost med CORS |
| `/etc/cron.d/qr25-data` | kører build.py hvert minut |
| `/var/www/qr25-data/` | de færdige filer |
| `/var/lib/qr25-data/` | cache af navne og hvornår discord sidst blev spurgt |
| `/opt/qr25-data/skjul.json` | valgfri liste af id'er der ikke skal nævnes |
| `/opt/qr25-data/blocklist.txt` | kopi af `tools/blocklist.txt`, så botten kan filtrere |
| `/var/log/qr25-data.log` | hvad cron fangede |
| `/opt/demokraticlanker/src/senest.js` | skriver `senest.json` når han sender en gif |
| `/opt/demokraticlanker/scripts/senest-backfill.js` | finder hans nyeste gif'er bagfra, hvis filen mangler |
| `/var/www/qr25-data/live/` | det botten selv skriver. eget ejerskab, så den ikke rører resten |
| `/var/www/qr25-data/live/medie/` | selve gif'erne. det er dem siden viser |
| `/var/lib/demokraticlanker/senest.json` | hans fem seneste gif'er, så en sletning har noget at falde tilbage på |
| `/var/www/qr25-data/quote-medie/` | billederne der hører til citaterne |

### Vedtægterne

`build.py` finder den nyeste vedhæftede pdf i #rules, henter den, kører den
gennem `pdftotext` og deler teksten op i kapitler, paragraffer og nummererede
punkter. Vedhæftninger på discord har en udløbstid i url'en, så den bliver
hentet forfra hver gang og ikke gemt.

Filen bliver kun skrevet hvis pdf'ens sha256 er en anden end sidst. Så snart
nogen lægger en ny version op i #rules, står den på siden inden for et kvarter.
Der bliver spurgt discord hvert kvarter, se `DISCORD_INTERVAL` i `build.py`.

Kan teksten ikke deles op i paragraffer, bliver den gamle fil stående i stedet
for at siden bliver tom.

### Afstemningerne

Kommer fra bottens eget lager, `/var/lib/demokraticlanker/store.json`. Kun
åbne afstemninger. `build.py` rører hverken botten eller discord for det her,
den læser en fil, så det koster ingenting at gøre hvert minut. Siden henter
dem igen hvert halve minut.

To ting den er nødt til at have styr på:

- **Hemmelige afstemninger.** Er `hide_results` slået til, viser botten ingen
  tal for nogen før afstemningen lukker, heller ikke for den der lavede den.
  Så `build.py` skriver ikke tallene i filen overhovedet. Ikke skjult på
  siden, ikke med i filen. Kun spørgsmålet, mulighederne og hvor mange der har
  stemt.
- **Hvem der stemte hvad.** Botten kan vise det i discord når `show_voters`
  er slået til, men det er en lukket server. `VIS_HVEM_DER_STEMTE` i
  `build.py` står på `False`, så navnene kommer ikke ud på en offentlig side.
  Sæt den til `True` hvis klassen beslutter andet.

**Man kan ikke stemme fra hjemmesiden.** Kassen har ingen knapper, ingen
formular og der er ikke en linje javascript der sender noget. Der er et link
til #afstemninger, og det er det. Botten skal blive ved med at være det eneste
sted en stemme kan afgives, ellers holder §6 ikke.

### Tristans nyeste gif

Han bad om at få sin nyeste besked på forsiden, og Dangus bad om den før ham.
Bagefter bad han om kun at få gif'erne — ikke det han skriver — så det er
gif'er kassen viser nu. Alle kanaler tæller med.

Det er ikke `build.py` der laver den. DemokratiClanker sidder allerede på
discords gateway, så den ved det i samme sekund han trykker enter, og skriver
`/var/www/qr25-data/live/senest.json` med det samme. Siden henter filen når den
loades og igen hvert halve minut.

Botten har fået `GuildMessages` til det. Den er ikke privilegeret: den siger at
der er kommet en besked, hvem der skrev den og hvor, men ikke hvad der står.
Teksten hentes over REST for den ene besked det handler om. Så botten læser
præcis én persons beskeder i stedet for at få hele serverens indhold ind ad
døren, og `MessageContent` behøver aldrig blive tændt i udviklerportalen.

En besked uden billede bliver slet ikke lagt ud: den forrige gif bliver
stående. Teksten bliver stadig læst, for blocklisten skal have noget at kigge
på — står der noget grimt over gif'en, kommer gif'en heller ikke ud. Den står
bare ikke på siden nogen steder. Retter han beskeden, retter siden med. Sletter
han den, falder den tilbage på den forrige.

Skriver han bare et link til en gif, er der ikke noget billede i beskeden når
den kommer ind. Discord henter linket bagefter og sender en opdatering med et
embed i, så `messageUpdate` kigger også på beskeder botten ikke har liggende i
forvejen — ellers ville et gif-link aldrig nå frem.

Hvem det er, står i `SENEST_BRUGER` i `senest.js`. Det er med vilje ikke noget
man kan skifte udefra: der skal ikke være en generel "skriv hvad som helst
direkte på en offentlig forside"-knap til 40 mand. Skal han ud af det igen, så
sæt hans id i `skjul.json` og slet filen.

Sender han en gif, henter botten selve filen ned og lægger den i
`live/medie/`, og siden viser den. Det er med vilje ikke et link videre til
Discord: deres urler er signerede og udløber efter et døgn, så linket ville
være dødt i morgen. Filen hedder det samme som beskedens id, så den kan caches
for evigt, og der ligger kun dem der hører til de fem beskeder botten husker.
Der bliver kun hentet fra Discords egne værter og kun billeder og video — en
gif fra klipy eller tenor kommer gennem Discords egen proxy, så vi laver ikke
GET-kald mod hvad som helst nogen skriver i en chat.

Discord laver gif'er udefra om til mp4, så en "gif" er tit en video. Den bliver
vist som `<video autoplay loop muted playsinline>`, altså præcis som en gif.

Botten ved kun det den har set, siden den startede. Skal der fyldes ud bagfra
— første gang, eller hvis filen er gået tabt — går det her script hans nyeste
beskeder igennem bagfra og sender dem den samme vej som en levende besked. De
fleste af dem er tekst, så den bliver ved nedad indtil ringen er fuld:

```
set -a; . /etc/demokraticlanker/env; set +a
sudo -u demokrati -E node /opt/demokraticlanker/scripts/senest-backfill.js
```

### Kagepause-alarmen

Der blev bedt om at alle der har siden åben når kagepausen starter, får en høj
alarm der også siger "KAGEPAUSE" med SAM.

**Det er ikke den rigtige SAM.** SAM er en formantsynthesizer fra 1982, og at
hente en port af den ind ville være det første bibliotek på siden. Stemmen er i
stedet skrevet i hånden med den samme teknik: en savtakket summetone på 112 Hz
kørt gennem to båndpasfiltre der står på vokalens formanter, plus støj gennem
et højpas til k, p og s. Ét ord er til at skrive i hånden, og det skurrer
ligesom originalen. Vil I have den ægte vare, er det `sigKagepause()` der skal
skiftes ud.

Alarmen går på skiftet fra ikke-kagepause til kagepause, ikke på at klokken
*er* 10:20. Så går den for dem der sad med siden åben, og ikke for dem der
åbner den 10:24. Afprøvet sekund for sekund over tre døgn: én gang per hverdag
klokken 10:20:00, ingenting i weekenden.

En browser må ikke starte lyd af sig selv, så `AudioContext` bliver lavet på
det første klik på siden. Cookie-boksen skal klikkes væk på hvert besøg, så
den er altid klar i god tid. Knapperne i kagekassen slår alarmen fra —
`qr25-alarm=nej` i `localStorage` — og `prøv` afspiller den med det samme, for
en alarm man ikke kan høre inden den går, er ikke til at tage stilling til.

### Billeder på citaterne

Indi spurgte om at få fotos og vedhæftninger med, når de sad i samme besked som
citatet. `parse_quotes.py` skriver hvilke billeder der hører til hvilket citat
ind i `quotes.json` under `medie`, men ikke selve filerne. Discords urler er
signerede og er døde inden for et døgn, så et link ville ikke virke i morgen.

Filerne bliver hentet ned på VPS'en i stedet og serveret fra
`data.qr25.dk/quote-medie/`. De ligger med vilje ikke i repoet: det er billeder
af folk fra klassen, og de skal ikke ligge i et offentligt git-repo ved siden
af koden.

```
scp tools/fetch_quote_medie.py root@vps:/tmp/qm.py
ssh root@vps 'set -a; . /etc/demokraticlanker/env; set +a; python3 /tmp/qm.py'
```

Listen bliver hentet fra den `quotes.json` der rent faktisk ligger på qr25.dk.
Det er med vilje: et citat skal først igennem blocklisten, være committet og
være pushet, før billedet bliver hentet. Ryger citatet ud igen — blocklisten,
`exclude.txt`, eller beskeden bliver slettet — sletter næste kørsel billedet.
Filen hedder beskedens id og et løbenummer, så navnet peger altid på det samme
billede, og der bliver kun hentet fra Discords egne værter, kun billeder, og
kun op til 8 MB.

Discord opbevarer nogle billeder som webp og skriver det i `content_type`, men
serverer stadig den png der blev uploadet. Derfor er det endelsen på filnavnet
der bestemmer typen, og `content_type` er kun noget parseren falder tilbage på.

### Nedtællingen til erik

Tristan bad om "en countdown på 69 år" der hedder "tid til erik dør". Erik er
en rolle på serveren og et gennemgående klassegag, ikke en udpeget person.

Målet er 2095-09-16 klokken 10:20 — 69 år fra den dag der blev spurgt, og
klokken kagepause. Det står som et fast tidspunkt i `app.js`, så tallet er det
samme for alle og ikke noget der starter forfra hver gang siden hentes.

Den tæller i hele kalenderår, ikke i 365 dage. Der er 17 skudår undervejs, og
en nedtælling der springer en dag om året er ikke en nedtælling.

### Cookie-boksen

Tristan bad om en cookie-boks hvor nej-knappen ikke virker. Det er præcis hvad
den er: man kommer ikke videre uden at trykke accepter, og "nej tak" skriver
bare "nej-knappen virker ikke".

Teksten i boksen er en joke — den påstår at al din data bliver sendt til Kina
og Israel. Det er ikke rigtigt, og det står der med småt nederst i boksen:
siden har ingen sporing, ingen analytics og ingen tredjepart, og der bliver
ikke sendt noget nogen steder hen. En side der påstår noget om hvor din data
ryger hen, skylder at skrive hvad der faktisk sker.

Den ene cookie den sætter — `qr25-cookies`, et år, `SameSite=Lax` — er den der
husker at du trykkede. Værdien er `UDGAVE` i `app.js`, ikke bare et ja. Bliver
teksten lavet om, skal `UDGAVE` tælles op: så holder de gamle svar op med at
gælde, og alle bliver spurgt igen. Man har jo sagt ja til noget andet end det
der står nu.

### Dagens citat læst højt

Tristan bad om text to speech på dagens citat når man kommer ind på siden.
Browsere lader ikke en side sige noget før man har rørt den, så den prøver, og
går det ikke, står der en `læs op`-knap i stedet. Trykker man `stop`, er det
også et svar: så gemmer den `qr25-laesop=nej` i `localStorage` og holder op med
at prøve af sig selv.

Det er `SpeechSynthesis`, som ligger i browseren i forvejen. Der bliver ikke
hentet et bibliotek og ikke sendt en stavelse nogen steder hen. Er der en dansk
stemme på maskinen, bliver det den.

### Dangus' profilbillede

Han bad om at få sit nuværende profilbillede op at stå. Det kommer med i
`navne.json` under `avatarer`, for det er den samme tur ud til Discord som
navnene — `build.py` henter det hvert kvarter, så skifter han billede, følger
siden med.

Det er den modsatte vej rundt af `skjul.json`: kun de id'er der står i
`AVATARER` i `build.py` kommer med. Et billede af en er ikke det samme som et
navn, så man skal selv have bedt om det. Serverens eget billede vinder over
kontoens, og starter hashet med `a_`, er billedet animeret og hentes som `.gif`.
Urlen er Discords egen og er ikke signeret, så den holder — der er ikke noget at
hente ned her.

### Flaget

"Indsæt en aktiv gif af et kinesisk flag der flager 24/7". Det er ikke en gif.
Flaget er tegnet som svg direkte i `style.css`, og `app.js` skærer det i 30
lodrette strimler der hver kører den samme bølge lidt senere end naboen til
venstre. Så løber bølgen hen over flaget, og der er ikke en fil nogen steder
der kan holde op med at findes. Står der `prefers-reduced-motion`, står det
stille.

### Sangen

Indi bad om en sang der spiller fra 0:28 og om igen. En side må ikke selv sætte
lyd i gang — browseren stopper den — så der er en knap. Youtube bliver først
spurgt når nogen trykker på den: indtil da er der ikke hentet en byte
derudefra, og trykker man `stop`, ryger rammen ud igen.

`loop=1` virker kun sammen med `playlist=` på en enkelt video. Sådan er deres
afspiller skruet sammen.

### Hvis det skal sættes op forfra

```
apt-get install -y poppler-utils
mkdir -p /opt/qr25-data /var/www/qr25-data /var/lib/qr25-data
# læg build.py og taeller.py i /opt/qr25-data
# læg vhosten i sites-available og symlink den til sites-enabled
certbot --nginx -d data.qr25.dk
systemctl reload nginx
python3 /opt/qr25-data/build.py --nu
# læg qr25-tael.service i /etc/systemd/system
systemctl enable --now qr25-tael

# tristans nyeste gif: botten skriver den, så den skal have et sted at
# skrive hen, og lov til det inde i sin egen ProtectSystem=strict
cp tools/blocklist.txt /opt/qr25-data/blocklist.txt
install -d -o demokrati -g www-data -m 0755 /var/www/qr25-data/live
install -d -o demokrati -g www-data -m 0755 /var/www/qr25-data/live/medie
mkdir -p /etc/systemd/system/demokraticlanker.service.d
printf '[Service]\nReadWritePaths=/var/www/qr25-data/live\n' \
  > /etc/systemd/system/demokraticlanker.service.d/senest.conf
systemctl daemon-reload && systemctl restart demokraticlanker
sudo -u demokrati -E node /opt/demokraticlanker/scripts/senest-backfill.js
```

DNS: `data.qr25.dk` skal være en A-record mod 161.97.159.207 i qr25.dk-zonen
på Cloudflare.

## Changelog

Bliver der lavet noget om på siden, kommer der et embed op i kanal
`1549329884256411720` med hvad der er lavet. Den samme kanal er idékasse, så
klassen kan skrive ønsker ind i den. Se `tools/README.md`.

## Hvad der bliver sorteret fra

Kanalen er en almindelig chatkanal, så størstedelen af den er folk der
kommenterer på citaterne i stedet for at skrive dem. Parseren beholder kun
beskeder der ser ud som et citat:

- der skal være noget i anførselstegn, både `"..."` og `“...”` tæller
- der skal enten være en tilskrivning (`- Mikkel`, `<@id>`, `Navn:`) eller
  også skal citatet stå først på linjen
- flere linjer med anførselstegn i samme besked bliver til en dialog
- det der står efter tilskrivningen bliver til en note (`til Content Creator møde`)
- Discord-markup bliver oversat: pings bliver til navne, custom emoji ryger ud
- gengangere ryger ud

Af 1002 beskeder i kanalen bliver 364 til citater.

**Blocklisten er ikke en sikkerhedsnet.** Den matcher på ord, den kan ikke læse
en sætning, og der ligger citater i kanalen som er et problem uden at indeholde
et eneste ord fra listen. Læs `public/data/quotes.json` igennem inden I peger
domænet herhen, og brug `tools/exclude.txt` til resten.

Alt hvad blocklisten fanger, bliver skrevet til `tools/flagged.json` sammen med
det ord der fangede det, så I kan se hvad der forsvandt.

Siden er sat til `noindex` i `public/index.html`, så den ikke ender i Google ved
siden af skolens navn. Slet den meta-tag hvis I vil have den med.

## Sådan tilføjer du en kasse

En kasse er en `<div class="kasse">` inde i `<div id="scene">` i
`public/index.html`:

```html
<div class="kasse" id="kasse-ditnavn">
  <div class="indhold">
    ...
  </div>
</div>
```

Kopier en af de andre og skriv dit eget i. Den bliver automatisk taget med når
kasserne bliver smidt ud på siden, du skal ikke røre `app.js`.

## Sådan ligger kasserne

`spred()` i `app.js` giver hver kasse en tilfældig plads og et lille skævt hæld,
hver gang siden hentes. Den vælger et tilfældigt sted på hele skærmens bredde,
tjekker om der allerede ligger en kasse der, og prøver igen hvis der gør, så de
aldrig lander oven i hinanden. Bagefter skubbes hele bunken op så den øverste
kasse rører toppen. Knappen "bland" kører den samme funktion.

Arkivet under citatet gør kassen højere når man folder det ud, så `spred()`
måler kassen med arkivet åbent og lukker det igen bagefter. Ellers ville den
lægge sig oven i naboen første gang nogen trykkede. Rører man ved en kasse,
lægger den sig øverst.

Under 700 px er der ikke plads til at rode med det, så der springer `spred()`
over og lader kasserne stå i en søjle i midten. Det samme sker hvis javascript
er slået fra.

`#scene` har en `max-width` så længe kasserne står i søjlen, så `clientWidth`
er søjlens bredde og ikke skærmens. Klassen `spredt` skal på plads før der
bliver målt, ellers måler `spred()` 460 px, tror der ikke er plads, og springer
fra hver gang.

## Stil

Siden skal ligne at nogen fra klassen har lavet den, ikke at et bureau har.
Reglerne står øverst i `public/assets/style.css`:

- gradienten skal være en regnbue, og den skal ligge der hele tiden. Den
  kedelige lilla-til-lyserøde fade som alle ai-sider har er forbudt
- ingen slørede skygger, ingen mat glas, ingen runde hjørner
- ingen overskrifter på kasserne, man kan godt se hvad de er
- ingen ting der fader ind når man scroller
- ingen emoji som ikoner
- ingen skrifttyper hentet ude fra, det der ligger på maskinen er nok

Så det er regnbue i baggrunden hele tiden, hvide kasser med `outset`-kanter
smidt ud over hele skærmen, Impact i overskriften, Verdana i brødteksten,
Georgia i citaterne, et rullebånd i toppen med nedtællingen til kagepausen, og
en besøgstæller.

Citatet står ét sted. Rullebåndet havde et tilfældigt citat i sig før, men så
var der to forskellige citater på siden på samme tid, og det var forvirrende.

Rullebåndet er ikke et rigtigt `<marquee>`. Den starter forfra hver gang man
skriver i den, og nedtællingen skriver i den hvert sekund, så det ville stå
stille. Det er en `<div>` med en css-animation i stedet, for animationen kører
på elementet og ikke på teksten.
