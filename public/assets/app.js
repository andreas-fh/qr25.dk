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

  function tik() {
    var nu = Date.now();
    var p = dele(new Date(nu));
    var minutter = p.hour * 60 + p.minute;
    var wd = ugedag(p);
    var kage = wd >= 1 && wd <= 5 && minutter >= START && minutter < SLUT;

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
  }

  tik();
  setInterval(tik, 1000);

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
  var NAVNE = { navne: {}, roller: {} };

  function huskNavne(opslag) {
    if (!opslag || !opslag.navne) return false;
    NAVNE = { navne: opslag.navne, roller: opslag.roller || {} };
    return true;
  }

  function navn(uid) { return NAVNE.navne[uid] || "nogen"; }
  function rolle(rid) { return NAVNE.roller[rid] || "nogen"; }

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
      var citater = data.quotes || [];
      var idag = dagnr(dele(new Date()));
      var kasse = id("quote");

      var dagens = citatTilDag(citater, idag);
      if (!dagens) {
        kasse.textContent = "der ligger ingen citater i public/data/quotes.json.";
        return;
      }

      var kilde = id("kilde");
      function vis(citat) {
        tegn(citat, kasse);
        kilde.href = citat.url;
      }

      vis(dagens);

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

  // --- tristans nyeste besked ---

  /* Tristan bad om at få sin nyeste besked op at stå, og Dangus bad om den før
     ham. DemokratiClanker sidder på discords gateway, så den ved det i samme
     sekund han trykker enter, og skriver senest.json med det samme. Herfra er
     det bare en fil. Vi henter den igen hvert halve minut, for en side der
     står åben i en time skal ikke vise noget der er en time gammelt.

     Teksten står med pings i behold, præcis som citaterne, så den skal gennem
     udskriv() for at <@692...> bliver til et navn. */

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

    if (!data || !data.tekst) {
      kasse.appendChild(lav("p", "tom", "han har ikke sagt noget endnu"));
      return;
    }

    kasse.appendChild(lav("p", "senest-tekst", udskriv(data.tekst)));

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
