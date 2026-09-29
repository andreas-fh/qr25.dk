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

  // ---------------- de små kasser omkring citaterne ----------------

  /* Alt herunder lever af quotes.json, som browseren alligevel har hentet.
     Der bliver ikke spurgt nogen steder hen for at regne det ud.

     De får citaterne og vis() med ind, så de kan hente et citat op i den
     store kasse når man trykker på det. */

  // ord der ikke siger noget om hvad der bliver talt om
  var FYLDORD = ("og i jeg det at en den til er som på de med han af for ikke " +
    "der var mig sig men et har om vi min havde ham hun nu over da fra du ud " +
    "sin man så når være dem skal hvis din nogle hos blive mange ad bliver " +
    "hvad end eller lige bare helt meget mere kan vil ved her hvor jo altså " +
    "godt ja nej okay hvorfor hvordan hvem noget alle selv"
  ).split(" ");

  function ordtaelling(citater, hvormange) {
    var tal = {};
    citater.forEach(function (c) {
      c.lines.forEach(function (l) {
        fladt(udskriv(l.text || "")).split(/[^a-zæøå0-9]+/).forEach(function (o) {
          if (o.length < 3 || FYLDORD.indexOf(o) !== -1) return;
          tal[o] = (tal[o] || 0) + 1;
        });
      });
    });
    return Object.keys(tal)
      .map(function (o) { return { ord: o, antal: tal[o] }; })
      .sort(function (a, b) { return b.antal - a.antal || a.ord.localeCompare(b.ord, "da"); })
      .slice(0, hvormange);
  }

  /* De sidste tolv måneder, nyeste til højre. Datoerne i quotes.json er
     ÅÅÅÅ-MM-DD som tekst, så der skal ikke laves Date-objekter for at tælle. */
  function maanedstal(citater, nu) {
    var noegler = [], tal = {}, navne = [];
    var MDR = ["jan", "feb", "mar", "apr", "maj", "jun",
               "jul", "aug", "sep", "okt", "nov", "dec"];
    for (var i = 11; i >= 0; i--) {
      var d = new Date(Date.UTC(nu.year, nu.month - 1 - i, 1));
      var n = d.getUTCFullYear() + "-" + ("0" + (d.getUTCMonth() + 1)).slice(-2);
      noegler.push(n);
      tal[n] = 0;
      navne.push(MDR[d.getUTCMonth()]);
    }
    citater.forEach(function (c) {
      var n = (c.date || "").slice(0, 7);
      if (n in tal) tal[n] += 1;
    });
    return { navne: navne, tal: noegler.map(function (n) { return tal[n]; }) };
  }

  function ekstraKasser(citater, vis) {
    var iDag = dele(new Date());

    // --- 1: link direkte til det citat man kigger på ---
    var kopier = id("kopier");
    kopier.addEventListener("click", function () {
      var url = location.origin + location.pathname + "#citat=" + kopier.dataset.id;
      function sagt(t) {
        var gammel = kopier.textContent;
        kopier.textContent = t;
        setTimeout(function () { kopier.textContent = gammel; }, 1600);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () { sagt("kopieret"); },
                                                function () { sagt(url); });
      } else {
        // ingen clipboard (gammel browser, eller ikke https). så vis den bare
        sagt(url);
      }
    });

    // --- 2: søg ---
    var soeg = id("soeg");
    var soegSvar = id("soeg-svar");

    function citatKnap(c, efterfølger) {
      var li = document.createElement("li");
      var knap = lav("button", "hvem-citat", foerste(c));
      knap.type = "button";
      knap.addEventListener("click", function () { vis(c); });
      li.appendChild(knap);
      li.appendChild(lav("span", "hvem-mrk", " " + (efterfølger || c.date)));
      return li;
    }

    function soegEfter() {
      var q = fladt(soeg.value).trim();
      soegSvar.innerHTML = "";
      if (q.length < 2) {
        soegSvar.appendChild(lav("p", "tom", "skriv mindst to tegn"));
        return;
      }
      var fundet = citater.filter(function (c) {
        return fladt(citatTekst(c) + " " + c.date).indexOf(q) !== -1;
      });
      if (!fundet.length) {
        soegSvar.appendChild(lav("p", "tom", "ingenting"));
        return;
      }
      soegSvar.appendChild(lav("p", "hvem-top-linje",
        fundet.length + (fundet.length === 1 ? " træffer" : " træffere")));
      var ol = lav("ol", "hvem-citater");
      // nyeste først, og der er en grænse: ingen grund til at tegne 300 knapper
      fundet.slice(-40).reverse().forEach(function (c) { ol.appendChild(citatKnap(c)); });
      soegSvar.appendChild(ol);
    }

    soeg.addEventListener("input", soegEfter);
    soegEfter();

    // --- 3: denne dag ---
    var iDagMD = ("0" + iDag.month).slice(-2) + "-" + ("0" + iDag.day).slice(-2);
    var denneDag = citater.filter(function (c) { return (c.date || "").slice(5) === iDagMD; });
    var dd = id("denne-dag");
    dd.innerHTML = "";
    if (!denneDag.length) {
      dd.appendChild(lav("p", "tom", "der er ikke sagt noget den " +
        iDag.day + "." + iDag.month + " før"));
    } else {
      var aar = {};
      denneDag.forEach(function (c) {
        var a = (c.date || "").slice(0, 4);
        (aar[a] = aar[a] || []).push(c);
      });
      Object.keys(aar).sort().reverse().forEach(function (a) {
        var blok = lav("div", "aargang");
        blok.appendChild(lav("p", "aar", a === String(iDag.year) ? a + " (i år)" : a));
        var ol = lav("ol", "hvem-citater");
        aar[a].forEach(function (c) { ol.appendChild(citatKnap(c, hvem(c) || "")); });
        blok.appendChild(ol);
        dd.appendChild(blok);
      });
    }

    // --- 4: klassen i tal ---
    var ti = id("tal-indhold");
    ti.innerHTML = "";
    ti.appendChild(lav("p", "hvem-top-linje", citater.length + " citater i alt"));

    var ord = ordtaelling(citater, 5);
    if (ord.length) {
      ti.appendChild(lav("p", "aar", "mest brugte ord"));
      var ol2 = lav("ol", "ord-liste");
      ord.forEach(function (o) {
        var li = document.createElement("li");
        li.appendChild(lav("b", null, o.ord));
        li.appendChild(document.createTextNode(" " + o.antal));
        ol2.appendChild(li);
      });
      ti.appendChild(ol2);
    }

    var md = maanedstal(citater, iDag);
    var top = Math.max.apply(null, md.tal.concat([1]));
    ti.appendChild(lav("p", "aar", "citater per måned"));
    var graf = lav("div", "maaned");
    md.tal.forEach(function (n, i) {
      var b = document.createElement("span");
      b.style.height = Math.max(2, Math.round((n / top) * 54)) + "px";
      b.title = md.navne[i] + ": " + n;
      graf.appendChild(b);
    });
    ti.appendChild(graf);
    var navnerad = lav("div", "maaned-navne");
    md.navne.forEach(function (n) { navnerad.appendChild(lav("span", null, n)); });
    ti.appendChild(navnerad);

    // --- 6: vrøvlemaskinen ---
    var vr = id("vroevl");

    function halvdele(tekst) {
      var ord = tekst.split(/\s+/).filter(Boolean);
      if (ord.length < 4) return null;
      var midt = Math.max(2, Math.round(ord.length / 2));
      return [ord.slice(0, midt).join(" "), ord.slice(midt).join(" ")];
    }

    function vroevl() {
      vr.innerHTML = "";
      // prøv et par gange: ikke alle citater er lange nok til at deles
      for (var forsøg = 0; forsøg < 20; forsøg++) {
        var a = citater[Math.floor(Math.random() * citater.length)];
        var b = citater[Math.floor(Math.random() * citater.length)];
        if (a === b) continue;
        var ha = halvdele(udskriv(a.lines[0].text));
        var hb = halvdele(udskriv(b.lines[0].text));
        if (!ha || !hb) continue;
        vr.appendChild(lav("p", "quote-text", "»" + ha[0] + " " + hb[1] + "«"));
        var hvemA = afsender(a.lines[0]), hvemB = afsender(b.lines[0]);
        vr.appendChild(lav("p", "quote-attr",
          "- " + (hvemA || "nogen") + " og " + (hvemB || "nogen")));
        return;
      }
      vr.appendChild(lav("p", "tom", "citaterne er for korte til at blande"));
    }

    id("vroevl-igen").addEventListener("click", vroevl);
    vroevl();

    // --- 1 igen: kom nogen med #citat=<id> i adressen, så er det det citat ---
    var fraAdressen = null;
    var m = /(?:^|[#&])citat=(\d+)/.exec(location.hash || "");
    if (m) {
      citater.forEach(function (c) { if (c.id === m[1]) fraAdressen = c; });
    }
    return { fraAdressen: fraAdressen, soegFelt: soeg };
  }

  // ---------------- ned ad bakke ----------------

  /* Der blev bedt om et bakkespil. Det her er vores eget, skrevet herinde:
     en kugle der triller ned ad en vej der bliver ved, indtil man rammer en
     klods eller kører ud over kanten.

     Vejen er tegnet med den gamle falske 3D: hvert stykke vej ligger i en
     afstand z, og alt bliver delt med z inden det tegnes. Så bliver stykker
     langt væk små og tæt på store, og det ligner dybde uden at der er nogen.
     Stykkerne tegnes bagfra og frem, så de nære dækker de fjerne.

     Banen ligger ikke i en liste. Hvert stykke får sin sving og sin klods ud
     af sit eget nummer, så den er den samme hver gang man kommer forbi, og
     den kan blive ved i det uendelige uden at bruge mere hukommelse. */

  var B_BREDDE = 320, B_HOEJDE = 210;
  var B_HORISONT = 80;
  var B_DYBDE = 60;       // hvor mange stykker vej der tegnes
  var B_Y = 130;          // højde/z. sat så det nærmeste stykke rammer bunden
  var B_X = 150;          // vejens halve bredde ved z = 1
  var B_START = 7.5;      // stykker i sekundet til at begynde med
  var B_TOP = 19;         // og det hurtigste den bliver
  var B_STYR = 1.45;      // hvor hurtigt kuglen flytter sig på tværs
  var B_HUSK = "qr25-bakke";

  // samme tal hver gang for det samme stykke. det er hele banen
  function bStoej(i) {
    var x = Math.sin(i * 12.9898 + 4.1) * 43758.5453;
    return x - Math.floor(x);
  }

  // hvor vejen ligger på tværs ved stykke i. to bølger oven i hinanden, så
  // svingene ikke kommer i takt
  function bSving(i) {
    return Math.sin(i / 27) * 1.15 + Math.sin(i / 68) * 0.75;
  }

  // en klods hvert syvende-ottende stykke, aldrig på de første
  function bKlods(i) {
    if (i < 45 || bStoej(i) > 0.13) return null;
    return bStoej(i + 1000) * 1.5 - 0.75;   // hvor på vejen den står
  }

  function bakken() {
    var lae = id("bakke");
    if (!lae || !lae.getContext) return;
    var c = lae.getContext("2d");
    var knap = id("bakke-start");
    var tal = id("bakke-tal");

    var koerer = false, pos = 0, x = 0, fart = B_START, doed = false;
    var taster = {};
    var styr = 0;        // -1, 0 eller 1. sat af tastatur eller finger
    var sidst = 0;
    var rekord = 0;
    try { rekord = parseInt(localStorage.getItem(B_HUSK), 10) || 0; } catch (e) {}

    function meter() { return Math.floor(pos * 10); }

    function skriv() {
      tal.textContent = meter() + " m" + (rekord ? "  ·  bedste " + rekord + " m" : "");
    }

    /* Hvor et punkt på vejen havner på skærmen. verdenX er i vejbredder:
       -1 og 1 er kanterne. z er afstanden, og alt bliver delt med den. */
    function projekt(verdenX, z) {
      return {
        x: B_BREDDE / 2 + (verdenX * B_X) / z,
        y: B_HORISONT + B_Y / z,
        b: B_X / z,
      };
    }

    /* Vejens midte ved stykket i, set fra kuglen. x er kuglens plads i
       verden, så når vejen svinger og x bliver stående, glider kuglen ud mod
       kanten — og så skal der styres. Det er hele spillet. */
    var B_SVINGKRAFT = 0.55;

    function midte(i) {
      return bSving(i) * B_SVINGKRAFT - x;
    }

    // hvor langt kuglen er fra vejens midte. 0 er lige på, 1 er kanten
    function afvig() {
      return x - bSving(pos) * B_SVINGKRAFT;
    }

    function tegn() {
      c.fillStyle = "#6ec7ff";
      c.fillRect(0, 0, B_BREDDE, B_HOEJDE);
      c.fillStyle = "#3f8f3a";
      c.fillRect(0, B_HORISONT, B_BREDDE, B_HOEJDE - B_HORISONT);

      var foerste = Math.floor(pos);
      var brok = pos - foerste;

      // bagfra og frem, så det nære dækker det fjerne
      for (var i = B_DYBDE; i >= 1; i--) {
        var zBag = i - brok + 1;
        var zFor = i - brok;
        if (zFor <= 0.35) continue;

        var nr = foerste + i;
        var bag = projekt(midte(nr), zBag);
        var forr = projekt(midte(nr - 1), zFor);

        // hver andet stykke lysere, så man kan se farten
        c.fillStyle = (nr % 2) ? "#e6e2d2" : "#d6d2c0";
        c.beginPath();
        c.moveTo(bag.x - bag.b, bag.y);
        c.lineTo(bag.x + bag.b, bag.y);
        c.lineTo(forr.x + forr.b, forr.y);
        c.lineTo(forr.x - forr.b, forr.y);
        c.closePath();
        c.fill();

        var k = bKlods(nr);
        if (k !== null) {
          var p = projekt(midte(nr) + k, zBag);
          var bred = p.b * 0.3;
          var hoej = (B_Y / zBag) * 0.42;
          c.fillStyle = "#c22a1c";
          c.fillRect(p.x - bred, p.y - hoej, bred * 2, hoej);
          c.fillStyle = "#8a1d13";
          c.fillRect(p.x - bred, p.y - hoej, bred * 2, hoej * 0.3);
        }
      }

      // kuglen. den ligger fast lige over bunden; det er vejen der flytter sig
      var ky = B_HOEJDE - 34;
      c.fillStyle = "#111";
      c.beginPath();
      c.ellipse(B_BREDDE / 2, ky + 13, 15, 5, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = doed ? "#8a8a8a" : "#ffe22e";
      c.beginPath();
      c.arc(B_BREDDE / 2, ky, 13, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = "#111";
      c.lineWidth = 2.5;
      c.stroke();

      if (doed) {
        c.fillStyle = "rgba(17,17,17,0.72)";
        c.fillRect(0, 70, B_BREDDE, 66);
        c.fillStyle = "#fff";
        c.font = "bold 26px Impact, sans-serif";
        c.textAlign = "center";
        c.fillText("DU VÆLTEDE", B_BREDDE / 2, 100);
        c.font = "13px Verdana, sans-serif";
        c.fillText(meter() + " meter", B_BREDDE / 2, 122);
      }
    }

    function slut() {
      koerer = false;
      doed = true;
      if (meter() > rekord) {
        rekord = meter();
        try { localStorage.setItem(B_HUSK, String(rekord)); } catch (e) {}
      }
      knap.textContent = "igen";
      skriv();
      tegn();
      // kørte man overhovedet, må man gerne skrive sig på listen
      if (meter() > 0) {
        gemRad.hidden = false;
        gemKnap.disabled = false;
        gemKnap.textContent = "gem " + meter() + " m";
      }
    }

    function skridt(naa) {
      if (!koerer) return;
      var dt = Math.min(0.05, (naa - sidst) / 1000 || 0);
      sidst = naa;

      var vil = styr;
      if (taster.venstre) vil -= 1;
      if (taster.hoejre) vil += 1;
      x += Math.max(-1, Math.min(1, vil)) * B_STYR * dt;

      fart = Math.min(B_TOP, fart + dt * 0.55);
      pos += fart * dt;

      // ude over kanten?
      var af = afvig();
      if (Math.abs(af) > 1.02) return slut();

      // ramt en klods? kun den der står på det stykke kuglen er på
      var k = bKlods(Math.floor(pos));
      if (k !== null && Math.abs(af - k) < 0.3) return slut();

      skriv();
      tegn();
      requestAnimationFrame(skridt);
    }

    function start() {
      pos = 0; x = 0; fart = B_START; doed = false; koerer = true;
      knap.textContent = "stop";
      sidst = performance.now();
      requestAnimationFrame(skridt);
    }

    knap.addEventListener("click", function () {
      if (koerer) { koerer = false; knap.textContent = "start"; return; }
      start();
    });

    document.addEventListener("keydown", function (e) {
      if (skriverNogen(e.target)) return;
      var t = e.key.toLowerCase();
      if (t === "arrowleft" || t === "a") taster.venstre = true;
      else if (t === "arrowright" || t === "d") taster.hoejre = true;
      else return;
      // kun når der bliver spillet. ellers skal piletasterne rulle siden
      if (koerer) e.preventDefault();
    });

    document.addEventListener("keyup", function (e) {
      var t = e.key.toLowerCase();
      if (t === "arrowleft" || t === "a") taster.venstre = false;
      if (t === "arrowright" || t === "d") taster.hoejre = false;
    });

    // på en telefon: hold på den halvdel du vil dreje mod
    function finger(e) {
      if (!koerer) return;
      var r = lae.getBoundingClientRect();
      var px = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
      styr = px < r.width / 2 ? -1 : 1;
      e.preventDefault();
    }
    lae.addEventListener("pointerdown", finger);
    lae.addEventListener("pointermove", finger);
    lae.addEventListener("pointerup", function () { styr = 0; });
    lae.addEventListener("pointercancel", function () { styr = 0; });

    // skifter man faneblad, skal den ikke køre videre i baggrunden
    document.addEventListener("visibilitychange", function () {
      if (document.hidden && koerer) { koerer = false; knap.textContent = "start"; }
    });

    /* --- resultatlisten ---

       Ligger på VPS'en, for en liste kun du kan se er ikke en liste. Der er
       ingen konto og ingen cookie: man skriver et navn når man har noget at
       gemme, og det er alt der bliver sendt. Navnet går gennem den samme
       blocklist som citaterne, ovre på serveren. */

    var gemRad = id("bakke-gem");
    var gemKnap = id("bakke-send");
    var navneFelt = id("bakke-navn");
    var listeKasse = id("bakke-liste");

    // navnet huskes lokalt, så man ikke skal skrive det hver gang
    try {
      var husket = localStorage.getItem("qr25-bakke-navn");
      if (husket) navneFelt.value = husket;
    } catch (e) {}

    function tegnListe(liste) {
      listeKasse.innerHTML = "";
      if (!liste || !liste.length) {
        listeKasse.appendChild(lav("p", "tom", "ingen har kørt endnu"));
        return;
      }
      var ol = lav("ol", "bakke-top");
      liste.forEach(function (r) {
        var li = document.createElement("li");
        li.appendChild(lav("span", "who", r.navn));
        li.appendChild(lav("span", "hvem-tal", " " + r.meter + " m"));
        ol.appendChild(li);
      });
      listeKasse.appendChild(ol);
    }

    function hentListe() {
      fetch(DATA + "/bakke", { cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (svar) { if (svar) tegnListe(svar.liste); })
        .catch(function () {
          listeKasse.innerHTML = "";
          listeKasse.appendChild(lav("p", "tom", "kunne ikke hente listen"));
        });
    }

    gemKnap.addEventListener("click", function () {
      var navn = navneFelt.value.trim();
      if (!navn) { navneFelt.focus(); return; }
      try { localStorage.setItem("qr25-bakke-navn", navn); } catch (e) {}
      gemKnap.disabled = true;
      gemKnap.textContent = "gemmer";
      fetch(DATA + "/bakke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ navn: navn, meter: meter() }),
      })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (svar) {
          if (svar) tegnListe(svar.liste);
          gemRad.hidden = true;
          id("bakke-liste-boks").open = true;
        })
        .catch(function () {
          gemKnap.disabled = false;
          gemKnap.textContent = "prøv igen";
        });
    });

    navneFelt.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); gemKnap.click(); }
    });

    hentListe();
    skriv();
    tegn();
  }

  // ---------------- hvem henter kage ----------------

  /* Trækker en tilfældig fra serveren. Folk der har bedt om ikke at blive
     nævnt ved navn står som "nogen" i navne.json og bliver ikke trukket —
     man skal kunne være med i klassen uden at stå på en offentlig forside. */

  function hvemHenter() {
    var svar = id("hent-svar");
    var knap = id("hent-traek");
    if (!svar || !knap) return;

    function folk() {
      return Object.keys(NAVNE.navne)
        .filter(function (uid) { return NAVNE.botter.indexOf(uid) === -1; })
        .map(function (uid) { return NAVNE.navne[uid]; })
        .filter(function (n) { return n && n !== "nogen"; });
    }

    knap.addEventListener("click", function () {
      var liste = folk();
      if (!liste.length) { svar.textContent = "ingen navne endnu"; return; }
      /* Rul lidt inden den lander. Uden det ser det ud som om svaret stod
         fast i forvejen, og så tror ingen på det. */
      var tilbage = 12;
      knap.disabled = true;
      (function rul() {
        svar.textContent = liste[Math.floor(Math.random() * liste.length)];
        tilbage -= 1;
        if (tilbage > 0) setTimeout(rul, 60 + (12 - tilbage) * 18);
        else knap.disabled = false;
      })();
    });
  }

  // ---------------- en tilfældig paragraf ----------------

  /* Ingen læser vedtægter frivilligt, men én ad gangen kan man overkomme.
     Knappen ruller ned til en tilfældig og blinker den. Paragrafferne findes
     først når vedtaegter.json er hentet, så de bliver slået op ved klikket og
     ikke på forhånd. */

  function tilfaeldigParagraf() {
    var knap = id("tilfaeldig-paragraf");
    if (!knap) return;
    knap.addEventListener("click", function () {
      var kasse = id("vedtaegter");
      var alle = [].slice.call(kasse.querySelectorAll(".paragraf"));
      if (!alle.length) return;
      alle.forEach(function (p) { p.classList.remove("blinker"); });
      var p = alle[Math.floor(Math.random() * alle.length)];
      // kassen ruller indeni, så det er den der skal flytte sig, ikke siden
      kasse.scrollTop = p.offsetTop - kasse.offsetTop - 8;
      // tving animationen til at starte forfra selvom klassen lige er fjernet
      void p.offsetWidth;
      p.classList.add("blinker");
    });
  }

  // ---------------- tastaturet ----------------

  /* Genveje. De må ikke gå af mens nogen skriver til Mikkel eller søger, så
     alt der kommer fra et felt bliver sluppet igennem. */

  function skriverNogen(mål) {
    if (!mål) return false;
    var t = (mål.tagName || "").toLowerCase();
    return t === "input" || t === "textarea" || t === "select" || mål.isContentEditable;
  }

  function genveje(nytCitat, soegFelt) {
    var linje = id("genveje");
    linje.innerHTML = "<kbd>c</kbd> nyt citat &nbsp; <kbd>b</kbd> bland kasserne" +
      " &nbsp; <kbd>s</kbd> søg &nbsp; <kbd>k</kbd> kagealarm &nbsp; <kbd>?</kbd> den her linje";

    id("vis-genveje").addEventListener("click", function () {
      linje.hidden = !linje.hidden;
    });

    document.addEventListener("keydown", function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey || skriverNogen(e.target)) return;
      var t = e.key.toLowerCase();
      if (t === "c") { nytCitat(); }
      else if (t === "b") { spred(); }
      else if (t === "k") { alarm(); }
      else if (t === "s") {
        var boks = id("soeg-boks");
        boks.open = true;
        soegFelt.focus();
        e.preventDefault();   // ellers ryger s'et ned i feltet bagefter
      } else if (e.key === "?") { linje.hidden = !linje.hidden; }
      else return;
      if (t !== "s") e.preventDefault();
    });
  }

  // ---------------- konami ----------------

  /* Den gamle kode. Hele siden skifter farve i et kvarters minut. Filteret
     rammer alt, også kasserne, og det er pointen. */

  var KONAMI = ["arrowup", "arrowup", "arrowdown", "arrowdown",
                "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"];

  function konami() {
    var naaet = 0;
    document.addEventListener("keydown", function (e) {
      if (skriverNogen(e.target)) return;
      var t = (e.key || "").toLowerCase();
      naaet = (t === KONAMI[naaet]) ? naaet + 1 : (t === KONAMI[0] ? 1 : 0);
      if (naaet < KONAMI.length) return;
      naaet = 0;
      document.body.classList.add("disco");
      setTimeout(function () { document.body.classList.remove("disco"); }, 15000);
    });
  }

  // ---------------- skoleåret ----------------

  /* Hvor langt vi er. Et dansk gymnasieår går fra august til slutningen af
     juni; i juli er der ingen bjælke, for så er der ikke noget at gøre ved
     det. Datoerne er sat i hånden — ret dem her hvis skolen siger noget
     andet. */

  var AAR_START = [8, 1];    // 1. august
  var AAR_SLUT = [6, 30];    // 30. juni

  var sidsteSkoledag = null;

  function skoleaar(p) {
    var dag = dagnr(p);
    if (dag === sidsteSkoledag) return;
    sidsteSkoledag = dag;

    var tekst = id("skoleaar-tekst");
    var fyld = id("skoleaar-fyld");
    if (!tekst || !fyld) return;

    // hvilket skoleår er vi i? efter 1. august er det et nyt
    var startAar = (p.month > AAR_START[0] ||
      (p.month === AAR_START[0] && p.day >= AAR_START[1])) ? p.year : p.year - 1;
    var start = Date.UTC(startAar, AAR_START[0] - 1, AAR_START[1]);
    var slut = Date.UTC(startAar + 1, AAR_SLUT[0] - 1, AAR_SLUT[1]);
    var nu = Date.UTC(p.year, p.month - 1, p.day);

    if (nu > slut) {
      tekst.textContent = "sommerferie";
      fyld.style.width = "100%";
      return;
    }

    var andel = Math.max(0, Math.min(1, (nu - start) / (slut - start)));
    var dageIgen = Math.round((slut - nu) / 86400000);
    tekst.textContent = "skoleåret " + startAar + "/" + String(startAar + 1).slice(2) +
      ": " + Math.round(andel * 100) + "%, " + dageIgen +
      (dageIgen === 1 ? " dag igen" : " dage igen");
    fyld.style.width = (andel * 100).toFixed(1) + "%";
  }

  // ---------------- kagevejret ----------------

  /* Under kagepausen regner det med kager. Ti minutter om dagen, og så er det
     væk igen.

     Der bliver lavet et fast antal, ikke nye hele tiden: hver kage falder i
     ring med sin egen fart og sin egen forsinkelse, så det ser tilfældigt ud
     uden at der kommer flere og flere elementer ind i siden imens.

     Kagerne er tegnet i hånden. Favicon'et bliver ikke rørt: det skal kunne
     læses i 16 px inde i en fane, og en lagkage med lys på kan det ikke. */

  var KAGER = 24;
  /* Fem forskellige, så det ikke er den samme firkant fireogtyve gange.
     Tegnet i hånden i samme stil som resten af siden — flade farver, ingen
     overgange, ingen skygger. */
  var KAGESLAGS = ["lagkage", "lagkagestykke", "muffin", "snegl", "donut"];
  var kagerFalder = false;

  function kagevejr(taend) {
    var lag = id("kagevejr");
    if (!lag) return;
    lag.innerHTML = "";
    if (!taend) return;

    for (var i = 0; i < KAGER; i++) {
      var k = document.createElement("img");
      k.src = "/assets/kager/" +
        KAGESLAGS[Math.floor(Math.random() * KAGESLAGS.length)] + ".svg";
      k.alt = "";
      var stoer = 20 + Math.round(Math.random() * 28);
      k.width = stoer;
      k.height = stoer;
      k.style.left = (Math.random() * 98).toFixed(2) + "%";
      k.style.animationDuration = (4.5 + Math.random() * 5).toFixed(2) + "s";
      // negativ forsinkelse: så er de allerede undervejs når pausen begynder,
      // i stedet for at de alle sammen starter på én linje i toppen
      k.style.animationDelay = (-Math.random() * 9).toFixed(2) + "s";
      k.style.setProperty("--drej", (Math.random() < 0.5 ? -1 : 1) *
        (180 + Math.round(Math.random() * 540)) + "deg");
      lag.appendChild(k);
    }
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

    // laget skal kun bygges om når det skifter, ikke hvert sekund. åbner man
    // siden midt i pausen, regner det med det samme — modsat alarmen, som er
    // en begivenhed og ikke en tilstand
    if (kage !== kagerFalder) { kagevejr(kage); kagerFalder = kage; }

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
    skoleaar(p);
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
  var NAVNE = { navne: {}, roller: {}, avatarer: {}, botter: [] };

  function huskNavne(opslag) {
    if (!opslag || !opslag.navne) return false;
    NAVNE = {
      navne: opslag.navne,
      roller: opslag.roller || {},
      // kun dem der selv har bedt om det står her. se AVATARER i build.py
      avatarer: opslag.avatarer || {},
      // botternes navne skal med — en ping på botten skal kunne skrives ud —
      // men siden skal kunne lade være med at behandle dem som mennesker
      botter: opslag.botter || [],
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
      hvemHenter();
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
        id("kopier").dataset.id = citat.id;
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

      /* --- hvem har sagt hvad ---

         Der blev bedt om at kunne se alt hvad én person har sagt, og alt hvor
         de bliver nævnt, med folk rangeret efter hvor meget de fylder.

         Et citat tæller én gang per person, også selvom de siger noget to
         gange i den samme dialog. Er man både taler og nævnt i det samme
         citat, tæller det i begge kolonner, men kun én gang i alt — ellers
         ville man kunne rykke op ved at tagge sig selv.

         Folk der har bedt om ikke at blive nævnt ved navn, står som "nogen" i
         navne.json, og dem kommer der ikke en liste over. */

      function samlFolk(alle) {
        var folk = {};

        function faa(noegle, navn) {
          if (!folk[noegle]) {
            folk[noegle] = { navn: navn, sagt: 0, naevnt: 0, ialt: 0, deres: [] };
          }
          return folk[noegle];
        }

        alle.forEach(function (c) {
          var talere = {}, naevnte = {};
          c.lines.forEach(function (l) {
            if (l.speakerId) talere[l.speakerId] = true;
            else if (l.speaker) talere["n:" + l.speaker] = true;
            // eget regexp: PING er global og deles med udskriv()
            var ping = /<@!?(\d+)>/g, m;
            var tekst = (l.text || "") + " " + (l.note || "");
            while ((m = ping.exec(tekst))) naevnte[m[1]] = true;
          });

          Object.keys(talere).forEach(function (n) {
            var p = faa(n, n.indexOf("n:") === 0 ? n.slice(2) : navn(n));
            p.sagt += 1;
          });
          Object.keys(naevnte).forEach(function (uid) {
            faa(uid, navn(uid)).naevnt += 1;
          });

          // én gang i alt, uanset hvor mange roller man har i citatet
          var iAlt = {};
          Object.keys(talere).forEach(function (n) { iAlt[n] = true; });
          Object.keys(naevnte).forEach(function (n) { iAlt[n] = true; });
          Object.keys(iAlt).forEach(function (n) {
            folk[n].ialt += 1;
            folk[n].deres.push({ citat: c, sagde: !!talere[n], naevnt: !!naevnte[n] });
          });
        });

        return Object.keys(folk)
          .map(function (n) { folk[n].noegle = n; return folk[n]; })
          .filter(function (p) { return p.navn && p.navn !== "nogen"; })
          .sort(function (a, b) {
            return b.ialt - a.ialt || a.navn.localeCompare(b.navn, "da");
          });
      }

      var folk = samlFolk(citater);
      var vaelger = id("hvem");
      var hvemListe = id("hvem-liste");

      folk.forEach(function (p) {
        var o = document.createElement("option");
        o.value = p.noegle;
        o.textContent = p.navn + " — " + p.ialt;
        vaelger.appendChild(o);
      });

      function raekke(tekst, klasse) { return lav("li", klasse, tekst); }

      function visTopliste() {
        hvemListe.innerHTML = "";
        if (!folk.length) {
          hvemListe.appendChild(lav("p", "tom", "ingen navne at tælle på endnu"));
          return;
        }
        var ol = lav("ol", "hvem-top");
        folk.forEach(function (p) {
          var li = document.createElement("li");
          li.appendChild(lav("span", "who", p.navn));
          li.appendChild(lav("span", "hvem-tal",
            " " + p.ialt + " (" + p.sagt + " sagt, " + p.naevnt + " nævnt)"));
          ol.appendChild(li);
        });
        hvemListe.appendChild(ol);
      }

      function visPerson(noegle) {
        var p = null;
        folk.forEach(function (q) { if (q.noegle === noegle) p = q; });
        if (!p) return visTopliste();

        hvemListe.innerHTML = "";
        hvemListe.appendChild(lav("p", "hvem-top-linje",
          p.navn + ": " + p.sagt + " sagt, " + p.naevnt + " nævnt, " +
          p.ialt + " i alt"));

        var ol = lav("ol", "hvem-citater");
        // nyeste først. det er dem folk kan huske
        p.deres.slice().reverse().forEach(function (d) {
          var li = document.createElement("li");
          var knap = lav("button", "hvem-citat", foerste(d.citat));
          knap.type = "button";
          // vis det i selve kassen, så man kan læse det hele og høre det højt
          knap.addEventListener("click", function () { vis(d.citat); });
          li.appendChild(knap);
          li.appendChild(lav("span", "hvem-mrk",
            " " + d.citat.date + (d.sagde ? "" : ", nævnt")));
          ol.appendChild(li);
        });
        hvemListe.appendChild(ol);
      }

      vaelger.addEventListener("change", function () {
        if (vaelger.value) visPerson(vaelger.value);
        else visTopliste();
      });
      visTopliste();

      var ekstra = ekstraKasser(citater, vis);
      if (ekstra.fraAdressen) {
        vis(ekstra.fraAdressen);
        tilbage.hidden = false;
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

  /* Gif'en kan komme fra hvem som helst på serveren, så navnet står ikke
     fast. Det kommer med i senest.json som et id og bliver slået op i
     navne.json, præcis som pingene i citaterne — så følger et navneskift med
     uden at nogen skal gøre noget.

     Kender vi ikke id'et, står der "nogen". Det er også hvad der står om dem
     der har bedt om ikke at blive nævnt ved navn. */
  function senestNavn(uid) {
    id("senest-hvem").textContent = (uid && NAVNE.navne[uid]) || "nogen";
  }

  function tegnSenest(data) {
    var kasse = id("senest");
    kasse.innerHTML = "";
    senestNavn(data && data.bruger);

    if (!data || !data.medie || !data.medie.url) {
      kasse.appendChild(lav("p", "tom", "der er ikke sendt nogen gif endnu"));
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
      node.alt = "gif'en der blev sendt";
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

  // ---------------- live-styring ----------------

  /* En kanal til at få harmløse ting til at ske på de sider der er åbne lige
     nu: vend siden, rist, regn med kager. Hver side melder sig hvert par
     sekunder til en lille service på VPS'en og henter det der ligger til den.

     To halvdele:

       - MODTAGEREN kører alle steder. Den henter kommandoer og udfører dem.
         Den læser aldrig noget fra siden og sender aldrig andet end "jeg er
         her". Effekterne er en fast liste, forsvinder ved en genindlæsning,
         og teksten i en besked sættes med textContent — der bliver aldrig
         kørt kode fra serveren.

       - PANELET kan sende kommandoer. Det kræver en nøgle, som kun findes i
         den browser der har fået den, og som serveren tjekker på hvert kald.
         Der er ingen knap til det: har man ikke nøglen, er panelet der ikke.
         Man får nøglen ved at åbne siden med #noegle=... én gang; så gemmes
         den lokalt og forsvinder ud af adressen igen. */

  var KONTROL = DATA + "/kontrol";

  // et id per faneblad, væk når fanen lukkes. intet navn, ingenting om hvem
  function sessionsId() {
    try {
      var s = sessionStorage.getItem("qr25-session");
      if (s) return s;
      s = (Date.now().toString(36) + Math.random().toString(36).slice(2, 10))
        .replace(/[^a-z0-9]/g, "").slice(0, 32);
      sessionStorage.setItem("qr25-session", s);
      return s;
    } catch (e) {
      return "flygtig" + Math.random().toString(36).slice(2, 10);
    }
  }

  // ryd alt hvad en effekt kan have sat, så en genindlæsning ikke er nødvendig
  function trollNulstil() {
    document.body.className = document.body.className
      .replace(/\btroll-\S+/g, "").replace(/\bdisco\b/g, "").trim();
    var o = id("troll-besked");
    if (o) o.parentNode.removeChild(o);
    kagevejr(false);
  }

  function trollKlasse(navn, ms) {
    document.body.classList.add(navn);
    setTimeout(function () { document.body.classList.remove(navn); }, ms);
  }

  function trollBesked(tekst) {
    var o = id("troll-besked");
    if (o) o.parentNode.removeChild(o);
    o = document.createElement("div");
    o.id = "troll-besked";
    // textContent, aldrig innerHTML: serveren skal ikke kunne skrive html ind
    o.textContent = String(tekst || "").slice(0, 120);
    document.body.appendChild(o);
    setTimeout(function () {
      if (o.parentNode) o.parentNode.removeChild(o);
    }, 6500);
  }

  function udfoerEffekt(k) {
    switch (k && k.effekt) {
      case "kage":
        kagevejr(true);
        setTimeout(function () { kagevejr(false); }, 12000);
        break;
      case "sirene": alarm(); break;
      case "flip": trollKlasse("troll-flip", 6000); break;
      case "spejl": trollKlasse("troll-spejl", 6000); break;
      case "rist": trollKlasse("troll-rist", 2500); break;
      case "zoom": trollKlasse("troll-zoom", 5000); break;
      case "lille": trollKlasse("troll-lille", 5000); break;
      case "disco": trollKlasse("disco", 15000); break;
      case "besked": trollBesked(k.tekst); break;
      case "nulstil": trollNulstil(); break;
      // ukendt: gør ingenting. der bliver aldrig kørt kode herfra
    }
  }

  function modtager() {
    var mig = sessionsId();
    var side = (location.pathname === "/" || location.pathname === "/index.html")
      ? "forsiden" : location.pathname.slice(1, 40);

    function bank() {
      fetch(KONTROL + "/hej", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: mig, side: side }),
      })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (svar) {
          if (svar && svar.kommandoer) svar.kommandoer.forEach(udfoerEffekt);
        })
        .catch(function () { /* servicen er nede. siden kører videre uden */ });
    }

    bank();
    setInterval(bank, 5000);
    return mig;
  }

  /* Panelet. Det tegnes kun hvis der ligger en nøgle. Serveren tjekker nøglen
     på hvert kald, så koden her er ikke det der beskytter noget — nøglen er.
     Alle kan læse den her funktion; ingen kan bruge den uden nøglen. */
  function panel(migSelv) {
    var noegle = null;
    try { noegle = localStorage.getItem("qr25-kontrol-noegle"); } catch (e) {}

    // kom man med #noegle=... i adressen, så gem den og tør adressen af
    var m = /(?:^|[#&])noegle=([a-f0-9]{16,80})/.exec(location.hash || "");
    if (m) {
      noegle = m[1];
      try { localStorage.setItem("qr25-kontrol-noegle", noegle); } catch (e) {}
      if (history.replaceState) {
        history.replaceState(null, "", location.pathname + location.search);
      } else { location.hash = ""; }
    }
    if (!noegle) return;

    var EFFEKTER = [
      ["kage", "kager"], ["sirene", "sirene"], ["flip", "på hovedet"],
      ["spejl", "spejl"], ["rist", "ryst"], ["disco", "disco"],
      ["zoom", "zoom ind"], ["lille", "zoom ud"], ["besked", "besked"],
      ["nulstil", "nulstil"],
    ];

    var boks = document.createElement("div");
    boks.id = "troll-panel";
    boks.innerHTML =
      '<p class="tp-top">styring <button type="button" id="tp-luk">×</button></p>' +
      '<p class="tp-linje"><label>mål: <select id="tp-maal"></select></label>' +
      ' <button type="button" id="tp-oppdater">↻</button></p>' +
      '<p class="tp-linje"><input type="text" id="tp-tekst" placeholder="tekst til besked" maxlength="120"></p>' +
      '<div id="tp-knapper"></div>' +
      '<p class="tp-fod" id="tp-status"></p>';
    document.body.appendChild(boks);

    var maal = id("tp-maal");
    var status = id("tp-status");

    function kald(sti, krop) {
      return fetch(KONTROL + sti, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({ noegle: noegle }, krop)),
      }).then(function (r) {
        if (r.status === 403) throw new Error("nøgle afvist");
        if (!r.ok) throw new Error("fejl " + r.status);
        return r.json();
      });
    }

    function opdaterListe() {
      kald("/liste", {}).then(function (svar) {
        var valgt = maal.value;
        maal.innerHTML = '<option value="alle">alle (' + svar.antal + ")</option>";
        svar.sessioner.forEach(function (s) {
          var o = document.createElement("option");
          o.value = s.id;
          var mig = s.id === migSelv ? " (dig)" : "";
          o.textContent = s.id.slice(0, 6) + " · " + s.side + " · " + s.alder + "s" + mig;
          maal.appendChild(o);
        });
        if (valgt) maal.value = valgt;
        status.textContent = svar.antal + " åbne";
      }).catch(function (e) {
        status.textContent = e.message;
      });
    }

    function send(effekt) {
      var krop = { maal: maal.value || "alle", effekt: effekt };
      if (effekt === "besked") krop.tekst = id("tp-tekst").value;
      kald("/styr", krop).then(function (svar) {
        status.textContent = effekt + " → " + svar.sendt;
      }).catch(function (e) {
        status.textContent = e.message;
      });
    }

    var knapper = id("tp-knapper");
    EFFEKTER.forEach(function (e) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = e[1];
      b.addEventListener("click", function () { send(e[0]); });
      knapper.appendChild(b);
    });

    id("tp-oppdater").addEventListener("click", opdaterListe);
    id("tp-luk").addEventListener("click", function () {
      // luk for i dag. nøglen bliver liggende, så panelet er der næste gang
      boks.parentNode.removeChild(boks);
    });

    opdaterListe();
    setInterval(opdaterListe, 4000);
  }

  var minSession = modtager();
  panel(minSession);

  tegnFlag();
  tegnSang();
  mikkel();
  tilfaeldigParagraf();
  konami();
  bakken();
  // bindes her og ikke inde i citatblokken: genvejene skal virke selvom
  // quotes.json ikke kom ind
  genveje(function () { id("rul").click(); }, id("soeg"));

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
  var foldbare = [].slice.call(scene.querySelectorAll("details"));

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

    /* de foldbare kan åbnes bagefter og gør kassen højere. mål med dem åbne,
       så der er plads til det, og luk dem igen. ellers lægger kassen sig oven
       i naboen første gang nogen trykker. */
    var varÅbne = foldbare.map(function (d) { return d.open; });
    foldbare.forEach(function (d) { d.open = true; });
    var mål = kasser.map(function (k) {
      return { w: k.offsetWidth, h: k.offsetHeight };
    });
    foldbare.forEach(function (d, nr) { d.open = varÅbne[nr]; });

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
