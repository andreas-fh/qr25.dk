/* qr25.dk
 *
 * tre ting sker her nede. uret finder ud af om det er kagepause, og kalenderen
 * finder ud af hvilket citat der er dagens. begge dele kører på dansk tid og
 * ikke på den tid der står i din egen maskine, så siden siger det samme
 * uanset om du åbner den i klassen eller på ferie i et andet land. og så
 * bliver kasserne smidt tilfældige steder hen hver gang siden hentes.
 *
 * ingen frameworks. hvis du vil lave om på noget, så skriv det bare ind.
 */

(function () {
  "use strict";

  var ZONE = "Europe/Copenhagen";
  var START = 10 * 60 + 20; // 10:20
  var SLUT = 10 * 60 + 30;  // 10:30

  var DAGE = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];

  // vedtægter, afstemninger, navne og besøgstælleren. resten er filer herfra.
  var DATA = "https://data.qr25.dk";

  /* Alt det siden har hentet, samlet ét sted. Mikkel slår op i det, og han er
     det eneste der læser herfra — resten af siden bruger sine egne data
     direkte. Er en af dem ikke hentet endnu, er listen bare tom. */
  var VIDEN = { citater: [], kapitler: [], polls: [] };


  function id(name) { return document.getElementById(name); }

  // ---------------- dansk tid ----------------

  var deleFormat = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });

  function dele(instant) {
    var ud = {};
    deleFormat.formatToParts(instant).forEach(function (del) {
      if (del.type !== "literal") ud[del.type] = parseInt(del.value, 10);
    });
    // nogle browsere skriver midnat som time 24 i stedet for 0
    if (ud.hour === 24) ud.hour = 0;
    return ud;
  }

  function forskel(ms) {
    var p = dele(new Date(ms));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - ms;
  }

  /* dansk vægur tilbage til et rigtigt tidspunkt. forskellen afhænger af det
     tidspunkt vi leder efter, så: gæt, slå forskellen op der, ret. to gange er
     nok til et sommertidsspring på en time. */
  function tidspunkt(y, m, d, hh, mm) {
    var naivt = Date.UTC(y, m - 1, d, hh, mm, 0);
    var ms = naivt - forskel(naivt);
    return naivt - forskel(ms);
  }

  /* dage siden 1970. bruges som frø til at vælge citat, så det skifter ved
     dansk midnat og ikke ved din egen. */
  function dagnr(p) {
    return Math.floor(Date.UTC(p.year, p.month - 1, p.day) / 86400000);
  }

  function ugedag(p) {
    return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  }

  // ---------------- kagepause ----------------

  function naeste(p) {
    var minutter = p.hour * 60 + p.minute;
    var wd = ugedag(p);
    if (wd >= 1 && wd <= 5 && minutter < START) {
      return tidspunkt(p.year, p.month, p.day, 10, 20);
    }
    var udgangspunkt = Date.UTC(p.year, p.month - 1, p.day);
    for (var skridt = 1; skridt <= 7; skridt++) {
      var d = new Date(udgangspunkt + skridt * 86400000);
      if (d.getUTCDay() >= 1 && d.getUTCDay() <= 5) {
        return tidspunkt(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 10, 20);
      }
    }
    return null;
  }

  function laenge(ms) {
    var alt = Math.max(0, Math.round(ms / 1000));
    var d = Math.floor(alt / 86400);
    var t = Math.floor((alt % 86400) / 3600);
    var m = Math.floor((alt % 3600) / 60);
    var s = alt % 60;

    var stumper = [];
    if (d) stumper.push(d + (d === 1 ? " dag" : " dage"));
    if (t) stumper.push(t + (t === 1 ? " time" : " timer"));
    if (m) stumper.push(m + (m === 1 ? " minut" : " minutter"));
    // sekunder er kun interessante når det er tæt nok på til at man kigger
    if (!d && !t && (s || !m)) stumper.push(s + (s === 1 ? " sekund" : " sekunder"));

    if (stumper.length === 1) return stumper[0];
    return stumper.slice(0, -1).join(", ") + " og " + stumper[stumper.length - 1];
  }

  // ---------------- kagepause-alarmen ----------------

  /* Der blev bedt om at alle der har siden åben når kagepausen starter, får en
     høj alarm der også siger "KAGEPAUSE" med SAM.

     Det er ikke den rigtige SAM. SAM er en formantsynthesizer fra 1982, og at
     hente en port af den ind ville være det første bibliotek på siden. I
     stedet er stemmen skrevet her med den samme teknik: en summende firkantet
     tone kørt gennem to båndpasfiltre der står på vokalens formanter, og støj
     til k'erne og s'et. Ét ord er til at skrive i hånden, og det skurrer
     ligesom originalen.

     Lyd må ikke starte af sig selv, så der bliver lavet en AudioContext første
     gang nogen rører siden. Cookie-boksen skal klikkes væk på hvert besøg, så
     den er altid rørt inden klokken bliver 10:20. */

  var LYD = null;
  var ALARM_HUSK = "qr25-alarm";
  var STOEJ = null;

  /* Sirenen er en rigtig optagelse af en civilforsvarssirene. Den ligger i
     public domain — se afsnittet i README for hvor den kommer fra.

     Filen bliver hentet og afkodet når lydkortet vækkes, altså længe før
     klokken bliver 10:20. Kommer den ikke — filen mangler, netværket driller,
     browseren kan ikke aac — tager den syntetiske sirene nedenfor over. Det
     er bedre end en alarm der ikke går. */
  var SIRENE_FIL = "/assets/sirene.m4a";
  var SIRENE_LYD = null;

  function hentSirene(ctx) {
    if (SIRENE_LYD) return;
    fetch(SIRENE_FIL)
      .then(function (svar) {
        if (!svar.ok) throw new Error(svar.status);
        return svar.arrayBuffer();
      })
      .then(function (raa) {
        return new Promise(function (ja, nej) {
          // det gamle kald med to funktioner, for safari kan ikke det nye
          ctx.decodeAudioData(raa, ja, nej);
        });
      })
      .then(function (buffer) { SIRENE_LYD = buffer; })
      .catch(function () {
        // så bliver den syntetiske brugt. ingen grund til at larme om det
      });
  }
  var GRUND = 112;          // hz. dybt og fladt, som en maskine
  var alarmKoerer = false;

  function alarmTil() {
    try { return localStorage.getItem(ALARM_HUSK) !== "nej"; } catch (e) { return true; }
  }

  function vaekLyd() {
    if (!LYD) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      try { LYD = new C(); } catch (e) { return null; }
    }
    if (LYD.state === "suspended") LYD.resume();
    hentSirene(LYD);
    return LYD;
  }

  // hvid støj, lavet én gang og brugt igen. den er til k, p og s
  function stoej(ctx) {
    if (STOEJ) return STOEJ;
    var n = Math.floor(ctx.sampleRate * 0.5);
    STOEJ = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = STOEJ.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return STOEJ;
  }

  /* --- stemmen ---

     "kagepause", sagt af en maskine. Én savtakket tone hele vejen igennem,
     kørt gennem tre båndpasfiltre der står på vokalernes formanter.

     Det vigtige er at formanterne GLIDER mellem lydene i stedet for at hoppe.
     Står de stille, hører man løsrevne toner; glider de, hører man et ord. Det
     er også derfor rammerne nedenfor har mellempunkter: de er ikke lyde, de er
     vejen fra én lyd til den næste.

     [tid, F1, F2, F3, styrke] — tid i sekunder fra ordets begyndelse. */
  var RAMMER = [
    [0.00,  660, 1750, 2500, 0.00],   // k'et lukker munden
    [0.055, 660, 1750, 2500, 0.00],
    [0.075, 660, 1750, 2500, 1.00],   // a
    [0.230, 680, 1720, 2480, 1.00],
    [0.300, 320, 2250, 2900, 0.85],   // g, som er et j på dansk
    [0.370, 500, 1450, 2450, 0.80],   // e
    [0.420, 480, 1400, 2400, 0.35],
    [0.455, 480, 1400, 2400, 0.00],   // lukket mund foran p
    [0.505, 480, 1400, 2400, 0.00],
    [0.530, 730, 1200, 2450, 1.00],   // a
    [0.690, 700, 1150, 2400, 1.00],
    [0.780, 380,  900, 2300, 0.85],   // u
    [0.830, 380,  900, 2300, 0.00],   // s'et er ustemt
    [0.950, 500, 1450, 2450, 0.00],
    [0.975, 500, 1450, 2450, 0.70],   // e
    [1.080, 490, 1430, 2430, 0.55],
    [1.140, 490, 1430, 2430, 0.00],
  ];

  // [start, længde, knæk, styrke] — k, p og s er støj og ikke tone
  var PUSTENE = [
    [0.000, 0.050, 2600, 0.34],
    [0.455, 0.050, 1000, 0.30],
    [0.835, 0.115, 4500, 0.26],
  ];

  function sigKagepause(ctx, ud, t0) {
    var laengde = RAMMER[RAMMER.length - 1][0];

    var o = ctx.createOscillator();
    o.type = "sawtooth";
    /* Lidt fald hen over ordet. Helt fladt lyder dødt, og et menneskes
       tonefald ville ødelægge robotten — det her er midt imellem. */
    o.frequency.setValueAtTime(106, t0);
    o.frequency.linearRampToValueAtTime(98, t0 + laengde);

    var samlet = ctx.createGain();
    samlet.gain.setValueAtTime(0, t0);
    RAMMER.forEach(function (r) {
      samlet.gain.linearRampToValueAtTime(r[4] * 0.42, t0 + r[0]);
    });
    samlet.connect(ud);

    [0, 1, 2].forEach(function (nr) {
      var b = ctx.createBiquadFilter();
      b.type = "bandpass";
      b.Q.value = [5, 7, 9][nr];
      b.frequency.setValueAtTime(RAMMER[0][nr + 1], t0);
      RAMMER.forEach(function (r) {
        b.frequency.linearRampToValueAtTime(r[nr + 1], t0 + r[0]);
      });
      var v = ctx.createGain();
      v.gain.value = [1, 0.65, 0.35][nr];
      o.connect(b);
      b.connect(v);
      v.connect(samlet);
    });

    // lidt af den rå tone med under. ellers bliver den tynd og fløjtende
    var krop = ctx.createBiquadFilter();
    krop.type = "lowpass";
    krop.frequency.value = 420;
    var kg = ctx.createGain();
    kg.gain.value = 0.5;
    o.connect(krop);
    krop.connect(kg);
    kg.connect(samlet);

    o.start(t0);
    o.stop(t0 + laengde + 0.05);

    PUSTENE.forEach(function (pu) {
      var k = ctx.createBufferSource();
      k.buffer = stoej(ctx);
      k.loop = true;
      var f = ctx.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = pu[2];
      var g = ctx.createGain();
      var t = t0 + pu[0];
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(pu[3], t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, t + pu[1]);
      k.connect(f);
      f.connect(g);
      g.connect(ud);
      k.start(t);
      k.stop(t + pu[1] + 0.02);
    });

    return laengde;
  }

  /* --- luftalarmen ---

     Ikke et bip. En rigtig civilforsvarssirene er en tung, savtakket tone der
     glider langsomt op og langsomt ned igen, og som brummer fordi den kommer
     fra en skive der hakker luft i stykker.

     Tre oscillatorer en anelse ude af trit giver den svævende klang — én alene
     lyder som en synthesizer. Brummen er en langsom svingning oven på
     lydstyrken. Tonehøjden glider eksponentielt, for det er sådan øret hører
     en glidende tone som jævn. */
  var SIRENE_BUND = 190, SIRENE_TOP = 580;

  function sirene(ctx, ud, t0, cyklusser, opTid, nedTid) {
    var op = opTid || 2.1;
    var ned = nedTid || 2.4;
    var laengde = cyklusser * (op + ned);

    var g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.55, t0 + 0.25);
    g.gain.setValueAtTime(0.55, t0 + laengde - 0.35);
    g.gain.linearRampToValueAtTime(0, t0 + laengde);

    // brummen. den sidder på lydstyrken, ikke på tonen
    var lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 6.5;
    var lfoDybde = ctx.createGain();
    lfoDybde.gain.value = 0.16;
    lfo.connect(lfoDybde);
    lfoDybde.connect(g.gain);
    lfo.start(t0);
    lfo.stop(t0 + laengde + 0.05);

    // tag det skarpeste af toppen, så det brøler i stedet for at hvæse
    var top = ctx.createBiquadFilter();
    top.type = "lowpass";
    top.frequency.value = 2400;
    top.Q.value = 0.7;

    // og giv den noget mave
    var mave = ctx.createBiquadFilter();
    mave.type = "peaking";
    mave.frequency.value = 520;
    mave.Q.value = 0.9;
    mave.gain.value = 7;

    [0, 8, -11].forEach(function (afstemt) {
      var o = ctx.createOscillator();
      o.type = "sawtooth";
      o.detune.value = afstemt;
      o.frequency.setValueAtTime(SIRENE_BUND, t0);
      var t = t0;
      for (var i = 0; i < cyklusser; i++) {
        o.frequency.exponentialRampToValueAtTime(SIRENE_TOP, t + op);
        o.frequency.exponentialRampToValueAtTime(SIRENE_BUND, t + op + ned);
        t += op + ned;
      }
      var d = ctx.createGain();
      d.gain.value = 1 / 3;
      o.connect(d);
      d.connect(mave);
      o.start(t0);
      o.stop(t0 + laengde + 0.05);
    });

    mave.connect(top);
    top.connect(g);
    g.connect(ud);
    return laengde;
  }

  // optagelsen hvis den er der, ellers den syntetiske. returnerer længden
  function spilSirene(ctx, ud, t0) {
    if (!SIRENE_LYD) return sirene(ctx, ud, t0, 1);
    var k = ctx.createBufferSource();
    k.buffer = SIRENE_LYD;
    k.connect(ud);
    k.start(t0);
    return SIRENE_LYD.duration;
  }

  function alarm() {
    var ctx = vaekLyd();
    if (!ctx || alarmKoerer) return;

    var ud = ctx.createGain();
    ud.gain.value = 0.9;
    ud.connect(ctx.destination);

    // sirene, så beskeden. omvendt rækkefølge og folk når ikke at kigge op
    var t = ctx.currentTime + 0.05;
    t += spilSirene(ctx, ud, t) + 0.2;
    t += sigKagepause(ctx, ud, t);

    alarmKoerer = true;
    document.body.classList.add("alarmerer");
    setTimeout(function () {
      alarmKoerer = false;
      document.body.classList.remove("alarmerer");
    }, Math.ceil((t - ctx.currentTime) * 1000));
  }

  function alarmKnapper() {
    var rad = id("alarm-rad");
    if (!rad || !(window.AudioContext || window.webkitAudioContext)) return;
    rad.hidden = false;

    var knap = id("alarm-til");
    function vis() { knap.textContent = "alarm: " + (alarmTil() ? "til" : "fra"); }
    vis();

    knap.addEventListener("click", function () {
      try { localStorage.setItem(ALARM_HUSK, alarmTil() ? "nej" : "ja"); } catch (e) {}
      vis();
    });

    id("alarm-proev").addEventListener("click", function () { vaekLyd(); alarm(); });

    // en lyd må ikke starte af sig selv. så vi tager fat i det første klik der
    // kommer, og har konteksten klar længe inden klokken bliver 10:20
    document.addEventListener("pointerdown", function foerste() {
      vaekLyd();
      document.removeEventListener("pointerdown", foerste);
    });
  }

  // ---------------- nedtællingen til erik ----------------

  /* Tristan bad om "en countdown på 69 år" der hedder "tid til erik dør".
     Erik er en rolle på serveren og et gennemgående klassegag, ikke en
     udpeget person, og 69 år er 69 år.

     Regnet fra den dag der blev spurgt, så tallet er det samme for alle og
     ikke noget der starter forfra hver gang siden hentes. */

  var ERIK_AAR = 2095, ERIK_MD = 9, ERIK_DAG = 16;   // 2026-09-16 + 69 år
  var ERIK = tidspunkt(ERIK_AAR, ERIK_MD, ERIK_DAG, 10, 20);   // kagepausen, selvfølgelig

  function toCifre(n) { return (n < 10 ? "0" : "") + n; }

  function tilErik(nu) {
    if (nu >= ERIK) return "tiden er gået";

    var p = dele(new Date(nu));
    /* Hele kalenderår, ikke 365 dage: der er 17 skudår undervejs, og en
       nedtælling der springer en dag om året er ikke en nedtælling. Årsforskellen
       rammer plet på nær lige omkring den 16. september, så ét skridt tilbage
       er nok. */
    var aar = ERIK_AAR - p.year;
    var anker;
    do {
      anker = tidspunkt(p.year + aar, p.month, p.day, p.hour, p.minute) + p.second * 1000;
      if (anker <= ERIK) break;
      aar -= 1;
    } while (aar > 0);

    var rest = Math.max(0, ERIK - anker);
    var alt = Math.floor(rest / 1000);
    var dage = Math.floor(alt / 86400);
    var t = Math.floor((alt % 86400) / 3600);
    var m = Math.floor((alt % 3600) / 60);
    var sek = alt % 60;

    // "år" hedder det samme uanset hvor mange der er. "dag" gør ikke
    return aar + " år, " +
      dage + (dage === 1 ? " dag, " : " dage, ") +
      toCifre(t) + ":" + toCifre(m) + ":" + toCifre(sek);
  }

  var varKage = null;   // null = vi har ikke kigget endnu

  function tik() {
    var nu = Date.now();
    var p = dele(new Date(nu));
    var minutter = p.hour * 60 + p.minute;
    var wd = ugedag(p);
    var kage = wd >= 1 && wd <= 5 && minutter >= START && minutter < SLUT;

    /* Alarmen skal gå for dem der havde siden åben da den startede — ikke for
       dem der åbner siden klokken 10:24. Derfor kigger vi på skiftet, og
       første gennemløb sætter kun udgangspunktet. */
    if (varKage !== null && !varKage && kage && alarmTil()) alarm();
    varKage = kage;

    document.body.classList.toggle("kagepause", kage);
    id("verdict").textContent = kage ? "JA" : "NEJ";

    if (kage) {
      var rest = laenge(tidspunkt(p.year, p.month, p.day, 10, 30) - nu);
      id("detail").innerHTML = "<b>" + rest + "</b> tilbage";
      id("banner-tekst").textContent = "KAGEPAUSE. " + rest + " tilbage. løb.";
    } else {
      var indtil = laenge(naeste(p) - nu);
      id("detail").innerHTML = "om <b>" + indtil + "</b>";
      id("banner-tekst").textContent = "der er kagepause om " + indtil;
    }

    id("erik-ur").textContent = tilErik(nu);
  }

  alarmKnapper();
  tik();
  setInterval(tik, 1000);

  // ---------------- cookies ----------------

  /* Tristan bad om en cookie-boks hvor nej-knappen ikke virker.

     Den er bygget som der blev bedt om: man kommer ikke videre uden at trykke
     accepter, og "nej tak" gør ingenting andet end at sige at den ikke virker.
     Men den lyver ikke om noget. Siden bruger ingen cookies til andet end det
     her, der er ingen sporing at sige nej til, og det står i boksen.

     Den cookie den sætter, er den eneste på hele siden: den husker at du har
     trykket, så du ikke skal se boksen hver gang. Et år, SameSite=Lax, ikke
     andet end et tal.

     Tallet er UDGAVE. Ændrer teksten i boksen sig, tæller de gamle ja'er ikke
     længere, og så bliver alle spurgt igen — man har jo sagt ja til noget
     andet end det der står nu. Tæl den op når teksten bliver lavet om. */

  var COOKIE = "qr25-cookies";
  var UDGAVE = "2";   // 1: "siden bruger ingen cookies". 2: kina og israel

  function harAccepteret() {
    return document.cookie.split(";").some(function (c) {
      return c.trim() === COOKIE + "=" + UDGAVE;
    });
  }

  function cookies() {
    var boks = id("cookie");
    if (!boks) return;
    if (harAccepteret()) return;

    boks.hidden = false;
    var svar = id("cookie-svar");

    id("cookie-ja").addEventListener("click", function () {
      var et_aar = new Date(Date.now() + 365 * 24 * 3600 * 1000).toUTCString();
      // samme navn og sti, så et gammelt ja bliver skrevet over i stedet for
      // at blive liggende ved siden af
      document.cookie = COOKIE + "=" + UDGAVE + "; expires=" + et_aar + "; path=/; SameSite=Lax";
      boks.hidden = true;
    });

    // det er hele pointen. den siger det den gør, og gør ikke andet
    id("cookie-nej").addEventListener("click", function () {
      svar.textContent = "nej-knappen virker ikke";
    });

    id("cookie-ja").focus();
  }

  cookies();

  // ---------------- navne ----------------

  /* der står ingen navne i quotes.json. der står discord-id'er, og navnet
     bliver slået op her, hver gang siden åbnes. folk skifter kaldenavn tit,
     og så skal siden følge med uden at nogen skal køre en parser igen.

     navnene kommer fra data.qr25.dk, som henter dem fra discord hvert
     kvarter. svarer den ikke, bruger vi det vi så sidst, for en side fuld af
     "nogen" er værre end et navn der er en dag gammelt.

     et navn der står skrevet i hånden i citatet er ikke et id og bliver
     aldrig slået op. det er lærerne. */

  var PING = /<@!?(\d+)>/g;
  var ROLLEPING = /<@&(\d+)>/g;
  var NAVNE = { navne: {}, roller: {}, avatarer: {} };

  function huskNavne(opslag) {
    if (!opslag || !opslag.navne) return false;
    NAVNE = {
      navne: opslag.navne,
      roller: opslag.roller || {},
      // kun dem der selv har bedt om det står her. se AVATARER i build.py
      avatarer: opslag.avatarer || {},
    };
    return true;
  }

  function navn(uid) { return NAVNE.navne[uid] || "nogen"; }
  function rolle(rid) { return NAVNE.roller[rid] || "nogen"; }

  /* Ned i småt og uden accenter, så "Ångström" og "angstrom" er det samme ord
     når Mikkel leder. Tegnsætningen bliver stående — den skal bruges til at
     dele i ord bagefter. Det er ikke den samme barbering som blocklisten
     laver: den smider også mellemrum væk, og så kan man ikke se hvor et ord
     slutter. */
  function fladt(tekst) {
    return String(tekst)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function udskriv(tekst) {
    return String(tekst)
      .replace(ROLLEPING, function (_, rid) { return "@" + rolle(rid); })
      .replace(PING, function (_, uid) { return "@" + navn(uid); });
  }

  function afsender(linje) {
    if (linje.speakerId) return navn(linje.speakerId);
    if (linje.speakerRole) return rolle(linje.speakerRole);
    return linje.speaker || "";
  }

  function hentNavne() {
    try {
      huskNavne(JSON.parse(localStorage.getItem("qr25-navne")));
    } catch (e) {
      // ikke noget gemt, eller privat vindue. så venter vi på serveren
    }
    return fetch(DATA + "/navne.json", { cache: "no-cache" })
      .then(function (svar) {
        if (!svar.ok) throw new Error(svar.status);
        return svar.json();
      })
      .then(function (opslag) {
        if (!huskNavne(opslag)) return;
        try {
          localStorage.setItem("qr25-navne", JSON.stringify(opslag));
        } catch (e) {
          // pyt, så slår vi dem bare op igen næste gang
        }
      })
      .catch(function () {
        // så står der det vi havde i forvejen
      });
  }

  // ---------------- dagens citat ----------------

  /* lille frøbaseret tilfældighed, så rækkefølgen ligger fast men ikke er til
     at gætte. samme dag giver samme citat på alle maskiner. */
  function mulberry32(froe) {
    return function () {
      froe |= 0;
      froe = (froe + 0x6d2b79f5) | 0;
      var t = Math.imul(froe ^ (froe >>> 15), 1 | froe);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* bland hele bunken og tag ét kort om dagen. alle citater kommer op før
     nogen af dem gentages, og så blandes bunken forfra. */
  function citatTilDag(citater, dag) {
    var n = citater.length;
    if (!n) return null;
    var runde = Math.floor(dag / n);
    var plads = ((dag % n) + n) % n;

    var orden = [];
    for (var i = 0; i < n; i++) orden.push(i);
    var rnd = mulberry32(runde * 2654435761 + 12345);
    for (var j = n - 1; j > 0; j--) {
      var k = Math.floor(rnd() * (j + 1));
      var bytte = orden[j]; orden[j] = orden[k]; orden[k] = bytte;
    }
    return citater[orden[plads]];
  }

  function lav(tag, klasse, tekst) {
    var n = document.createElement(tag);
    if (klasse) n.className = klasse;
    if (tekst != null) n.textContent = tekst;
    return n;
  }

  /* Indi spurgte om at få de billeder med, der sad i samme besked som citatet.
     De ligger på data.qr25.dk: discords egne urler er signerede og dør inden
     for et døgn, så tools/fetch_quote_medie.py henter dem ned. Filnavnet er
     beskedens id, så det peger altid på det samme billede.

     Er billedet der ikke — det er lige kommet ind, og henteren er ikke kørt
     endnu — ryger elementet bare ud igen. Citatet står der stadig. */
  function tegnCitatBilleder(citat, i) {
    (citat.medie || []).forEach(function (m) {
      if (!m || !m.fil) return;
      var billede = document.createElement("img");
      billede.className = "quote-billede";
      billede.src = DATA + "/quote-medie/" + m.fil;
      billede.alt = "billedet der fulgte med citatet";
      billede.loading = "lazy";
      // målene står i quotes.json, så pladsen er der inden filen er hentet
      if (m.bredde) billede.width = m.bredde;
      if (m.hoejde) billede.height = m.hoejde;
      billede.onerror = function () {
        if (billede.parentNode) billede.parentNode.removeChild(billede);
      };
      i.appendChild(billede);
    });
  }

  function tegn(citat, i) {
    i.textContent = "";
    citat.lines.forEach(function (linje) {
      var blok = lav("div", "quote-line");
      blok.appendChild(lav("p", "quote-text", "»" + udskriv(linje.text) + "«"));
      var hvemDenneLinje = afsender(linje);
      if (hvemDenneLinje || linje.note) {
        var attr = lav("p", "quote-attr");
        attr.appendChild(lav("span", "who", hvemDenneLinje || "ukendt"));
        if (linje.note) attr.appendChild(lav("span", "note", " " + udskriv(linje.note)));
        blok.appendChild(attr);
      }
      i.appendChild(blok);
    });
    tegnCitatBilleder(citat, i);
  }

  function foerste(citat) {
    return "»" + udskriv(citat.lines[0].text) + "«" + (citat.lines.length > 1 ? " ..." : "");
  }

  function hvem(citat) {
    var set = [];
    citat.lines.forEach(function (l) {
      var n = afsender(l);
      if (n && set.indexOf(n) === -1) set.push(n);
    });
    return set.join(", ");
  }

  /* --- læs dagens citat højt ---

     Tristan bad om text to speech på dagens citat når man kommer ind på
     siden. Browsere lader ikke en side sige noget uden at man har rørt den
     først, så den prøver, og går det ikke, står knappen der i stedet. Trykker
     man stop, er det også et svar: så holder den op med at prøve af sig selv.

     SpeechSynthesis er indbygget. Der bliver ikke sendt noget nogen steder
     hen, og der er ikke hentet et bibliotek for det. */

  var TTS = window.speechSynthesis;
  var HUSK_TTS = "qr25-laesop";
  var taler = false;

  function maaTale() {
    try { return localStorage.getItem(HUSK_TTS) !== "nej"; } catch (e) { return true; }
  }

  function husk(svar) {
    try { localStorage.setItem(HUSK_TTS, svar); } catch (e) {}
  }

  // dansk hvis der er en dansk stemme på maskinen. ellers den browseren selv
  // vælger — en engelsk stemme der læser dansk er stadig sjovere end ingenting
  function dansk() {
    var stemmer = TTS.getVoices() || [];
    for (var i = 0; i < stemmer.length; i++) {
      if (String(stemmer[i].lang || "").toLowerCase().indexOf("da") === 0) return stemmer[i];
    }
    return null;
  }

  function oplaesning(citat) {
    var dele = [];
    citat.lines.forEach(function (linje) {
      var hvemDer = afsender(linje);
      dele.push(udskriv(linje.text) + (hvemDer ? ", sagde " + hvemDer : ""));
    });
    return dele.join(". ");
  }

  function stopTale() {
    taler = false;
    TTS.cancel();
    id("laesop").textContent = "læs op";
  }

  function talHoejt(citat) {
    var ord = oplaesning(citat);
    if (!ord) return;
    TTS.cancel();
    var sig = new SpeechSynthesisUtterance(ord);
    var stemme = dansk();
    if (stemme) sig.voice = stemme;
    sig.lang = stemme ? stemme.lang : "da-DK";
    sig.rate = 0.95;
    sig.onend = stopTale;
    sig.onerror = stopTale;
    taler = true;
    id("laesop").textContent = "stop";
    TTS.speak(sig);
  }

  Promise.all([
    fetch("/data/quotes.json", { cache: "no-cache" }).then(function (svar) {
      if (!svar.ok) throw new Error("HTTP " + svar.status);
      return svar.json();
    }),
    // navnene må gerne fejle. så står der "nogen", og citatet står der stadig.
    hentNavne(),
  ])
    .then(function (svar) {
      var data = svar[0];
      tegnAvatar();
      var citater = data.quotes || [];
      VIDEN.citater = citater;
      var idag = dagnr(dele(new Date()));
      var kasse = id("quote");

      var dagens = citatTilDag(citater, idag);
      if (!dagens) {
        kasse.textContent = "der ligger ingen citater i public/data/quotes.json.";
        return;
      }

      var kilde = id("kilde");
      var nu = dagens;
      function harBillede(c) { return !!(c && c.medie && c.medie.length); }

      function vis(citat) {
        var havde = harBillede(nu);
        nu = citat;
        tegn(citat, kasse);
        kilde.href = citat.url;
        // et nyt citat midt i en oplæsning: så skal den gamle tie stille
        if (taler) stopTale();
        /* et citat med billede er en hel del højere end et uden. kasserne blev
           målt op da siden kom ind, så når det skifter, skal der måles igen —
           ellers lægger den sig oven i naboen. målene står på img'et, så
           højden er kendt inden filen er hentet. */
        if (havde !== harBillede(citat)) spred();
      }

      vis(dagens);

      if (TTS && typeof SpeechSynthesisUtterance === "function") {
        var knap = id("laesop");
        knap.hidden = false;
        knap.addEventListener("click", function () {
          if (taler) { stopTale(); husk("nej"); return; }
          husk("ja");
          talHoejt(nu);
        });

        /* Stemmerne kommer først ind i chrome et øjeblik efter, og en side der
           lige er hentet har ingen der har rørt den. Så: prøv, og lad være
           igen hvis browseren ikke vil. Der kommer ingen fejl ud af det. */
        if (maaTale()) {
          var start = function () { if (!taler) talHoejt(nu); };
          if ((TTS.getVoices() || []).length) start();
          else TTS.addEventListener("voiceschanged", start, { once: true });
          setTimeout(start, 1200);
        }

        // ellers bliver den ved med at snakke efter man er gået videre
        window.addEventListener("pagehide", function () { TTS.cancel(); });
      }

      var rul = id("rul");
      var tilbage = id("tilbage");
      rul.addEventListener("click", function () {
        vis(citater[Math.floor(Math.random() * citater.length)]);
        tilbage.hidden = false;
      });
      tilbage.addEventListener("click", function () {
        vis(dagens);
        tilbage.hidden = true;
      });

      var liste = id("archive-list");
      for (var tilbageITid = 1; tilbageITid <= 7; tilbageITid++) {
        var gammelt = citatTilDag(citater, idag - tilbageITid);
        if (!gammelt) continue;
        var li = document.createElement("li");
        li.appendChild(lav("span", "what", foerste(gammelt)));
        var hvemDer = hvem(gammelt);
        if (hvemDer) {
          li.appendChild(document.createElement("br"));
          li.appendChild(lav("span", "who", "- " + hvemDer));
        }
        liste.appendChild(li);
      }

      // citatet er kommet ind og kassen er blevet højere, så mål op igen
      spred();
    })
    .catch(function (fejl) {
      id("quote").textContent = "kunne ikke hente citaterne (" + fejl.message + ")";
      tegnAvatar();
      spred();
    });


  // ---------------- vedtægter og afstemninger ----------------

  /* Begge dele kommer fra data.qr25.dk, som er nginx på VPS'en. qr25.dk er
     statiske filer på Cloudflare og kan ikke selv nå ind til DemokratiClanker,
     så /opt/qr25-data/build.py bygger to json-filer derovre: vedtægterne fra
     den nyeste pdf i #rules, og de åbne afstemninger fra bottens eget lager.

     Afstemningerne er til at kigge på. Man stemmer i discord. Der er ikke en
     eneste knap her nede der sender noget nogen steder hen, og det skal der
     heller ikke komme. */


  function hent(sti) {
    return fetch(DATA + sti, { cache: "no-cache" }).then(function (svar) {
      if (!svar.ok) throw new Error("HTTP " + svar.status);
      return svar.json();
    });
  }

  // --- vedtægter ---

  function tegnVedtaegter(data) {
    VIDEN.kapitler = data.kapitler || [];
    var kasse = id("vedtaegter");
    kasse.innerHTML = "";

    if (data.version || data.lagt_op) {
      id("vedt-version").textContent =
        (data.version || "") + (data.lagt_op ? ", " + data.lagt_op : "");
    }

    (data.kapitler || []).forEach(function (k) {
      var blok = lav("div", "kapitel");
      blok.appendChild(lav("h3", null, "kapitel " + k.nr + (k.titel ? ": " + k.titel : "")));

      k.paragraffer.forEach(function (p) {
        var afsnit = lav("p", "paragraf");
        afsnit.appendChild(lav("span", "nr", "\u00a7" + p.nr + " "));
        afsnit.appendChild(document.createTextNode(p.tekst));
        blok.appendChild(afsnit);

        if (p.punkter && p.punkter.length) {
          var ol = lav("ol", "punkter");
          p.punkter.forEach(function (pt) { ol.appendChild(lav("li", null, pt.tekst)); });
          blok.appendChild(ol);
        }
      });

      kasse.appendChild(blok);
    });
  }

  // --- afstemninger ---

  function omTil(ms) {
    var v = ms - Date.now();
    if (v <= 0) return "slutter når som helst";
    return "slutter om " + laenge(v);
  }

  function tegnPolls(data) {
    VIDEN.polls = (data && data.afstemninger) || [];
    var kasse = id("polls");
    kasse.innerHTML = "";

    var liste = (data && data.afstemninger) || [];
    if (!liste.length) {
      kasse.appendChild(lav("p", "tom", "ingen åbne afstemninger lige nu"));
      return liste.length;
    }

    liste.forEach(function (p) {
      var blok = lav("div", "poll" + (p.skjult ? " hemmelig" : ""));
      blok.appendChild(lav("h3", null, p.spoergsmaal));

      p.muligheder.forEach(function (m) {
        var valg = lav("div", "valg");
        var top = lav("div", "valg-top");
        top.appendChild(lav("span", "tekst", m.tekst));
        if (!p.skjult) {
          top.appendChild(lav("span", "antal", m.stemmer + (m.stemmer === 1 ? " stemme" : " stemmer")));
        }
        valg.appendChild(top);

        if (!p.skjult) {
          var bar = lav("div", "bar");
          var fyld = lav("span");
          fyld.style.width = Math.round((m.andel || 0) * 100) + "%";
          bar.appendChild(fyld);
          valg.appendChild(bar);
        }
        blok.appendChild(valg);
      });

      var dele = [];
      if (p.skjult) {
        dele.push("hemmelig, resultatet kommer når den lukker");
        dele.push(p.vaelgere + (p.vaelgere === 1 ? " har stemt" : " har stemt"));
      } else {
        dele.push(p.vaelgere + (p.vaelgere === 1 ? " vælger" : " vælgere"));
        if (p.flere_valg) dele.push("flere valg pr. person");
      }
      if (p.slutter) dele.push(omTil(p.slutter));
      dele.push("af " + p.oprettet_af);
      blok.appendChild(lav("p", "fod", dele.join(" \u00b7 ")));

      kasse.appendChild(blok);
    });

    return liste.length;
  }

  var antalPolls = null;

  function opdaterPolls(foerste) {
    return hent("/polls.json").then(function (data) {
      var n = tegnPolls(data);
      /* kassen ruller indeni, så højden ændrer sig ikke af sig selv. men går
         den fra ingen afstemninger til nogen, bliver den højere, og så skal
         kasserne lægges om, ellers ligger den oven i naboen. */
      if (!foerste && antalPolls !== null && (antalPolls === 0) !== (n === 0)) spred();
      antalPolls = n;
    });
  }

  // --- tristans nyeste gif ---

  /* Tristan bad om at få sin nyeste besked op at stå, og Dangus bad om den før
     ham. DemokratiClanker sidder på discords gateway, så den ved det i samme
     sekund han trykker enter, og skriver senest.json med det samme. Herfra er
     det bare en fil. Vi henter den igen hvert halve minut, for en side der
     står åben i en time skal ikke vise noget der er en time gammelt.

     Han bad selv om at få det han skriver ud af kassen igen, så der står kun
     gif'er tilbage. Skriver han noget uden billede, bliver den forrige gif
     stående — botten udgiver slet ikke beskeder uden medie. */

  var SENEST_ID = "692001336740413452";

  function siden(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    if (s < 90) return "lige nu";
    var m = Math.round(s / 60);
    if (m < 60) return "for " + m + " minutter siden";
    var t = Math.round(m / 60);
    if (t < 24) return "for " + t + (t === 1 ? " time siden" : " timer siden");
    var d = Math.round(t / 24);
    return "for " + d + (d === 1 ? " dag siden" : " dage siden");
  }

  // navnet står i html'en som det hed da filen blev skrevet. hedder han noget
  // andet i dag, ved navne.json det, og så er det den der gælder. det sker
  // også selvom selve beskeden ikke kan hentes.
  function senestNavn() {
    if (NAVNE.navne[SENEST_ID]) id("senest-hvem").textContent = NAVNE.navne[SENEST_ID];
  }

  function tegnSenest(data) {
    var kasse = id("senest");
    kasse.innerHTML = "";
    senestNavn();

    if (!data || !data.medie || !data.medie.url) {
      kasse.appendChild(lav("p", "tom", "han har ikke sendt en gif endnu"));
      return;
    }

    /* Sender han en gif, ligger selve filen på data.qr25.dk. Discord laver gif'er
       om til mp4 når de kommer udefra, og det er den vi får, så en "gif" er tit
       en video. Den skal opføre sig som en gif: kør, kør igen, ingen lyd, og
       ingen afspiller-knapper. */
    var m = data.medie;
    var er = String(m.type || "");
    var node;
    if (er.indexOf("video/") === 0) {
      node = document.createElement("video");
      node.autoplay = true;
      node.loop = true;
      node.muted = true;
      node.playsInline = true;
      node.setAttribute("muted", "");
      node.setAttribute("playsinline", "");
    } else {
      node = document.createElement("img");
      node.alt = "det han sendte";
      node.loading = "lazy";
    }
    node.className = "senest-medie";
    node.src = m.url;
    // så pladsen er der med det samme og kassen ikke hopper mens den henter
    if (m.bredde) node.width = m.bredde;
    if (m.hoejde) node.height = m.hoejde;
    kasse.appendChild(node);

    var naar = data.dato ? new Date(data.dato) : null;
    var dele = [];
    if (data.kanal) dele.push("#" + data.kanal);
    if (naar && !isNaN(naar.getTime())) dele.push(siden(Date.now() - naar.getTime()));

    var kilde = id("senest-kilde");
    kilde.textContent = dele.length ? dele.join(", ") : "discord";
    if (data.url) kilde.href = data.url;
  }

  hent("/vedtaegter.json")
    .then(function (data) { tegnVedtaegter(data); })
    .catch(function (fejl) {
      id("vedtaegter").textContent = "kunne ikke hente vedtægterne (" + fejl.message + ")";
    })
    .then(function () { return opdaterPolls(true); })
    .catch(function (fejl) {
      id("polls").textContent = "kunne ikke hente afstemningerne (" + fejl.message + ")";
    })
    .then(function () { return hent("/senest.json").then(tegnSenest); })
    .catch(function (fejl) {
      senestNavn();
      id("senest").textContent = "kunne ikke hente den (" + fejl.message + ")";
    })
    .then(function () { spred(); });

  // der bliver stemt mens folk kigger, så hent dem igen en gang imellem.
  // det samme med tristan: botten skriver filen i samme sekund han trykker
  // enter, så en side der står åben skal ikke vise noget en time gammelt.
  setInterval(function () {
    opdaterPolls(false).catch(function () {});
    hent("/senest.json").then(tegnSenest).catch(function () {});
  }, 30000);

  // --- dangus' profilbillede ---

  /* Han bad om at få sit nuværende profilbillede op at stå. Det står i
     navne.json sammen med navnene, for det er den samme tur ud til discord —
     og det er kun dem der selv har spurgt der er med i den liste.

     Urlen er discords egen og er ikke signeret, så den holder. Er hans billede
     animeret, er filen en gif, og så flytter den sig af sig selv. */

  var AVATAR_ID = "616609937535270912";

  function tegnAvatar() {
    var kasse = id("avatar");
    var url = NAVNE.avatarer[AVATAR_ID];
    var navnet = NAVNE.navne[AVATAR_ID];
    if (navnet) id("avatar-hvem").textContent = navnet;

    kasse.innerHTML = "";
    if (!url) {
      kasse.appendChild(lav("p", "tom", "han har ikke noget profilbillede"));
      return;
    }
    var img = document.createElement("img");
    img.className = "avatar-billede";
    img.src = url;
    img.width = 128;
    img.height = 128;
    img.alt = "profilbilledet " + (navnet || "han") + " har på discord lige nu";
    img.onerror = function () {
      kasse.innerHTML = "";
      kasse.appendChild(lav("p", "tom", "billedet ville ikke hentes"));
    };
    kasse.appendChild(img);
  }

  // --- flaget ---

  /* "indsæt en aktiv gif af et kinesisk flag der flager 24/7".

     Flaget er tegnet som svg i style.css. Her bliver det skåret i lodrette
     strimler, og hver strimmel får den samme bølge lidt senere end den til
     venstre for sig. Så løber bølgen hen over flaget, og der er ikke en fil
     nogen steder der kan holde op med at virke. */

  function tegnFlag() {
    var kasse = id("flag");
    if (!kasse) return;
    var BREDDE = 180, STRIMMEL = 6, TID = 1.9;
    var antal = BREDDE / STRIMMEL;
    for (var i = 0; i < antal; i++) {
      var s = document.createElement("i");
      s.style.backgroundPositionX = -(i * STRIMMEL) + "px";
      // en hel bølge fordelt over de to tredjedele af flaget der er længst
      // fra stangen. tættest på stangen sidder det fast, som et rigtigt flag
      s.style.animationDelay = (-(i / antal) * TID * 0.66).toFixed(3) + "s";
      kasse.appendChild(s);
    }
  }

  // --- sangen ---

  /* Indi bad om en sang der spiller fra 0:28 og om igen når man er inde på
     siden. En side må ikke selv sætte lyd i gang — browseren stopper den — så
     der er en knap i stedet.

     youtube bliver først spurgt når nogen trykker. Indtil da står der ikke
     andet end en knap, og der er ikke hentet en eneste byte derudefra. */

  var SANG = "LPFwrH1w468";
  var SANG_START = 28;

  function tegnSang() {
    var kasse = id("sang");
    if (!kasse) return;

    function knappen() {
      kasse.innerHTML = "";
      var knap = lav("button", null, "spil");
      knap.type = "button";
      knap.addEventListener("click", spil);
      kasse.appendChild(knap);
      kasse.appendChild(lav("p", "tom", "friendly father. den kommer fra youtube"));
    }

    function spil() {
      kasse.innerHTML = "";
      var ramme = document.createElement("iframe");
      /* loop=1 virker kun sammen med playlist på en enkelt video — sådan er
         youtubes afspiller skruet sammen. start=28 er der bedt om. */
      ramme.src = "https://www.youtube-nocookie.com/embed/" + SANG +
        "?autoplay=1&start=" + SANG_START + "&loop=1&playlist=" + SANG;
      ramme.title = "friendly father";
      ramme.allow = "autoplay; encrypted-media; picture-in-picture";
      ramme.referrerPolicy = "strict-origin-when-cross-origin";
      ramme.setAttribute("allowfullscreen", "");
      kasse.appendChild(ramme);

      var stop = lav("button", null, "stop");
      stop.type = "button";
      stop.addEventListener("click", knappen);   // rammen ryger ud, og så tier den
      kasse.appendChild(stop);
    }

    knappen();
  }

  // --- mikkel ai ---

  /* Tristan bad om "en ai service bot, så man kan stille spørgsmål om
     klassen", og Dangus bad om at den skulle hedde Mikkel.

     Han er ikke en model. Der er ikke noget endepunkt, ingen nøgle og ingen
     regning: han slår op i de filer siden allerede har hentet — citaterne,
     vedtægterne og de åbne afstemninger — og svarer med det han finder.
     Spørgsmålet forlader aldrig browseren. Det står også i kassen, for en
     kasse der hedder "ai" og lader som om der sidder en model bagved er en
     løgn, og siden lyver ikke om den slags.

     Skal han en dag have en rigtig model bagved, er det her stedet: svar()
     skal bare returnere noget andet. Resten af kassen kan blive som den er. */

  var MIKKEL_MAX = 200;
  // point er summen af længden på de ord der blev fundet. fire er et kort navn
  // som "erik", og det skal kunne slå igennem. lavere end det er rent støj.
  var MIN_POINT = 4;

  // samme barbering som blocklisten: ned i småt, uden accenter og tegn
  function ord(tekst) {
    return fladt(tekst).split(/[^a-z0-9]+/).filter(function (o) { return o.length > 2; });
  }

  // ord alle sætninger er fulde af. de siger ikke noget om hvad der spørges om
  var FYLD = ("hvad hvem hvor hvornår hvorfor hvordan kan skal vil man den det " +
    "der som med for til fra ikke jeg mig min vores klassen siger sagde har " +
    "havde var være bliver blev nogen noget alle").split(" ");

  function traef(soeg, hoestak) {
    var h = fladt(hoestak);
    var point = 0;
    soeg.forEach(function (o) {
      if (FYLD.indexOf(o) !== -1) return;
      if (h.indexOf(o) !== -1) point += o.length;
    });
    return point;
  }

  function citatTekst(c) {
    return c.lines.map(function (l) {
      return udskriv(l.text) + " " + (afsender(l) || "") + " " + udskriv(l.note || "");
    }).join(" ");
  }

  /* Et svar er en liste af {klasse, tekst}, så en paragraf og et citat kan se
     forskellige ud uden at der skal html ind i en streng. */
  function svar(spoergsmaal) {
    var soeg = ord(spoergsmaal);
    if (!soeg.length) return [{ tekst: "spørg om noget." }];

    var f = fladt(spoergsmaal);

    // "er det kagepause" skal have uret. "hvad siger vedtægterne om kagepause"
    // skal have vedtægterne, så genvejen viger for den slags spørgsmål
    var omReglerne = /vedtaegt|vedtægt|paragraf|regel|regler|§/.test(f);
    if (f.indexOf("kagepause") !== -1 && !omReglerne) {
      return [{ tekst: document.body.classList.contains("kagepause")
        ? "ja. løb." : "nej. der står hvor længe der er til oppe i kassen." }];
    }

    if (f.indexOf("stemme") !== -1 || f.indexOf("afstemning") !== -1) {
      if (!VIDEN.polls.length) return [{ tekst: "der er ingen åbne afstemninger lige nu." }];
      return [{ tekst: "der er " + VIDEN.polls.length + " åben" +
        (VIDEN.polls.length === 1 ? "" : "e") + ": " +
        VIDEN.polls.map(function (p) { return p.spoergsmaal; }).join(" — ") +
        ". du stemmer i discord, ikke her." }];
    }

    /* "hvem er X". Et navn er tit kort, og korte ord drukner i pointgivningen
       nedenfor, så det spørgsmål får sin egen vej: tæl hvor mange citater der
       overhovedet nævner navnet, og vis et af dem. */
    var hvemEr = f.match(/hvem\s+(?:er|var)\s+(.+?)[\s?.!]*$/);
    if (hvemEr) {
      var hvemNavn = hvemEr[1].trim();
      var deres = VIDEN.citater.filter(function (c) {
        return fladt(citatTekst(c)).indexOf(hvemNavn) !== -1;
      });
      if (deres.length) {
        var et = deres[deres.length - 1];
        return [
          { tekst: hvemNavn + " er nævnt i " + deres.length +
            (deres.length === 1 ? " citat. det er det her:" : " citater. det nyeste:") },
          { klasse: "mikkel-citat", tekst: foerste(et) },
          { tekst: (hvem(et) ? hvem(et) + ", " : "") + et.date },
        ];
      }
      return [{ tekst: hvemNavn + " står der ikke noget om." }];
    }

    // vedtægterne først: spørger nogen om en regel, er en paragraf et bedre
    // svar end et citat der tilfældigvis bruger de samme ord
    var bedstP = null, bedstPPoint = 0;
    VIDEN.kapitler.forEach(function (k) {
      (k.paragraffer || []).forEach(function (p) {
        var point = traef(soeg, p.tekst + " " + (k.titel || "") +
          (p.punkter || []).map(function (pt) { return " " + pt.tekst; }).join(""));
        if (point > bedstPPoint) { bedstPPoint = point; bedstP = p; }
      });
    });

    var bedstC = null, bedstCPoint = 0;
    VIDEN.citater.forEach(function (c) {
      var point = traef(soeg, citatTekst(c));
      if (point > bedstCPoint) { bedstCPoint = point; bedstC = c; }
    });

    if (bedstP && bedstPPoint >= bedstCPoint && bedstPPoint >= MIN_POINT) {
      return [
        { tekst: "vedtægterne siger:" },
        { klasse: "mikkel-citat", tekst: "\u00a7" + bedstP.nr + " " + bedstP.tekst },
      ];
    }

    if (bedstC && bedstCPoint >= MIN_POINT) {
      var hvemDer = hvem(bedstC);
      return [
        { tekst: "det nærmeste jeg har:" },
        { klasse: "mikkel-citat", tekst: foerste(bedstC) },
        { tekst: (hvemDer ? hvemDer + ", " : "") + bedstC.date },
      ];
    }

    var tilfaeldigt = VIDEN.citater.length
      ? VIDEN.citater[Math.floor(Math.random() * VIDEN.citater.length)] : null;
    if (!tilfaeldigt) return [{ tekst: "jeg har ikke hentet noget endnu. prøv om lidt." }];
    return [
      { tekst: "aner det ikke. her er et citat i stedet:" },
      { klasse: "mikkel-citat", tekst: foerste(tilfaeldigt) },
    ];
  }

  function mikkel() {
    var log = id("mikkel-log");
    var felt = id("mikkel-felt");
    if (!log || !felt) return;

    function sig(klasse, dele) {
      var tur = lav("p", "mikkel-tur " + klasse);
      dele.forEach(function (d, nr) {
        if (nr) tur.appendChild(document.createElement("br"));
        tur.appendChild(d.klasse ? lav("span", d.klasse, d.tekst)
                                 : document.createTextNode(d.tekst));
      });
      log.appendChild(tur);
      log.scrollTop = log.scrollHeight;
    }

    sig("mikkel-ham", [{ tekst: "spørg om klassen. jeg kigger i citaterne, " +
      "vedtægterne og afstemningerne, og jeg kigger ikke andre steder." }]);

    function spoerg() {
      var t = felt.value.trim().slice(0, MIKKEL_MAX);
      if (!t) return;
      felt.value = "";
      sig("mikkel-dig", [{ tekst: t }]);
      sig("mikkel-ham", svar(t));
    }

    id("mikkel-send").addEventListener("click", spoerg);
    // ingen <form>: der er ikke noget her der må kunne sende noget nogen steder
    felt.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); spoerg(); }
    });
  }

  tegnFlag();
  tegnSang();
  mikkel();

  // ---------------- smid kasserne ud på siden ----------------

  /* kasserne får en tilfældig plads hver gang siden hentes. de må ikke ligge
     oven i hinanden, så det er bare: vælg et tilfældigt sted, tjek om der er
     nogen der i forvejen, prøv igen hvis der er.

     under 700 px er der ikke plads til at rode med det, så der springer vi
     det over og lader dem stå under hinanden som css'en siger. */

  var GRÆNSE = 700;   // under det her står kasserne bare i en søjle
  var LUFT = 16;      // mindste afstand mellem to kasser
  var HÆLD = 2.6;     // hvor mange grader de må stå skævt

  var scene = id("scene");
  var kasser = [].slice.call(scene.querySelectorAll(".kasse"));
  var arkiv = id("arkiv");

  function overlapper(a, b) {
    return !(a.x + a.w + LUFT <= b.x || b.x + b.w + LUFT <= a.x ||
             a.y + a.h + LUFT <= b.y || b.y + b.h + LUFT <= a.y);
  }

  function spred() {
    // ryd op efter sidste gang, så vi altid måler på en frisk side
    scene.classList.remove("spredt");
    scene.style.height = "";
    kasser.forEach(function (k) {
      k.style.left = k.style.top = k.style.width = k.style.transform = k.style.zIndex = "";
    });

    if (window.innerWidth < GRÆNSE) return;

    /* #scene har en max-width så længe kasserne står i en søjle, så
       clientWidth er søjlens bredde og ikke skærmens. klassen skal på først,
       ellers måler vi 460 px og springer fra hver gang. */
    scene.classList.add("spredt");
    var bredde = scene.clientWidth;
    if (bredde < 640) { scene.classList.remove("spredt"); return; }

    var kassebredde = Math.round(Math.min(400, Math.max(300, bredde * 0.42)));

    scene.classList.add("spredt");
    kasser.forEach(function (k) { k.style.width = kassebredde + "px"; });

    /* arkivet kan foldes ud bagefter og gør kassen højere. mål med det åbent,
       så der er plads til det, og luk det igen. ellers lægger den sig oven i
       naboen første gang nogen trykker. */
    var varÅbent = arkiv ? arkiv.open : false;
    if (arkiv) arkiv.open = true;
    var mål = kasser.map(function (k) {
      return { w: k.offsetWidth, h: k.offsetHeight };
    });
    if (arkiv) arkiv.open = varÅbent;

    // et skævt rektangel fylder lidt mere end et lige et
    var skævt = Math.sin(HÆLD * Math.PI / 180);

    var samletHøjde = mål.reduce(function (sum, m) { return sum + m.h; }, 0);
    var lærred = Math.max(samletHøjde * 0.62, mål[0].h + 40);

    var lagt = [];
    var bund = 0;

    kasser.forEach(function (kasse, nr) {
      var m = mål[nr];
      var w = m.w + m.h * skævt;
      var h = m.h + m.w * skævt;
      var plads = null;

      for (var forsøg = 0; forsøg < 500 && !plads; forsøg++) {
        var bud = {
          x: Math.random() * Math.max(1, bredde - w),
          y: Math.random() * lærred,
          w: w, h: h,
        };
        var fri = true;
        for (var i = 0; i < lagt.length; i++) {
          if (overlapper(bud, lagt[i])) { fri = false; break; }
        }
        if (fri) plads = bud;
        // giv den mere plads at lege på hvis den har svært ved at finde noget
        if (forsøg % 100 === 99) lærred += m.h * 0.5;
      }

      if (!plads) {
        // opgav. så sætter vi den under det hele, det er stadig tilfældigt hvor
        plads = { x: Math.random() * Math.max(1, bredde - w), y: bund + LUFT, w: w, h: h };
      }

      lagt.push(plads);
      bund = Math.max(bund, plads.y + plads.h);
      kasse.style.transform = "rotate(" + (Math.random() * 2 * HÆLD - HÆLD).toFixed(2) + "deg)";
    });

    /* der er ikke nogen der siger at nogen af dem landede i toppen, så skub
       hele bunken op indtil den øverste rører kanten. ellers kan man komme til
       at scrolle forbi et halvt tomt skærmbillede først */
    var top = lagt.reduce(function (mindst, r) { return Math.min(mindst, r.y); }, Infinity);
    kasser.forEach(function (kasse, nr) {
      var m = mål[nr], r = lagt[nr];
      kasse.style.left = Math.round(r.x + (r.w - m.w) / 2) + "px";
      kasse.style.top = Math.round(r.y - top + (r.h - m.h) / 2) + "px";
    });

    scene.style.height = Math.ceil(bund - top + 24) + "px";
  }

  /* en kasse man rører ved skal ligge øverst. så kan den godt dække en anden
     når den bliver højere, og det ser ud som papir der ligger i en bunke */
  var øverst = 1;
  kasser.forEach(function (kasse) {
    kasse.addEventListener("pointerdown", function () {
      if (scene.classList.contains("spredt")) kasse.style.zIndex = ++øverst;
    });
  });

  spred();
  id("bland").addEventListener("click", spred);

  var vent;
  window.addEventListener("resize", function () {
    clearTimeout(vent);
    vent = setTimeout(spred, 150);
  });

  // ---------------- besøgstæller ----------------

  /* ét tal for alle. serveren lægger en til hver gang siden bliver hentet og
     sender det samlede antal tilbage, så det er ikke dit eget besøg du kigger
     på, det er alles. svarer serveren ikke, viser vi det sidste tal vi så, i
     stedet for at hoppe ned på nul og lade som om ingen har været her. */
  (function () {
    var felt = id("tal");

    function vis(n) {
      var tal = String(n);
      while (tal.length < 6) tal = "0" + tal;
      felt.textContent = tal;
    }

    var sidste = null;
    try {
      sidste = parseInt(localStorage.getItem("qr25-besog-sidst"), 10);
    } catch (e) {
      // privat vindue. så står der nuller indtil serveren svarer
    }
    if (sidste > 0) vis(sidste);

    fetch(DATA + "/tael", { method: "POST", cache: "no-store" })
      .then(function (svar) {
        if (!svar.ok) throw new Error(svar.status);
        return svar.json();
      })
      .then(function (data) {
        var n = parseInt(data.besog, 10);
        if (!(n > 0)) return;
        vis(n);
        try {
          localStorage.setItem("qr25-besog-sidst", String(n));
        } catch (e) {
          // ingen grund til at gøre mere ud af det
        }
      })
      .catch(function () {
        // tælleren er ikke vigtigere end resten af siden
      });
  })();
})();
