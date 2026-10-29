/* qr25-verdenen.
 *
 * En lille Club Penguin-agtig verden oven på siden: et kort med huse, en
 * pingvin man går rundt med, og de andre online som deres egne pingviner. Hvert
 * hus hører til en af de kasser siden allerede har — går man ind, åbner den
 * kasse i et vindue, med alt hvad den kan, præcis som før.
 *
 * Alt det levende (konti, pingviner, hvem er online) ligger på data.qr25.dk.
 * Siden er statiske filer og kan ikke selv huske noget. Står javascript af,
 * er der ingen verden, og kasserne står bare under hinanden som altid.
 */
(function () {
  "use strict";

  var DATA = "https://data.qr25.dk";
  var GEM_TOKEN = "qr25-konto-token";

  function id(n) { return document.getElementById(n); }
  function lav(tag, klasse, tekst) {
    var e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (tekst != null) e.textContent = tekst;
    return e;
  }

  /* Hvilke kasser der bliver til huse, og hvad husene hedder. En kasse der
     ikke står her, får stadig et hus med sit eget navn — så nye kasser kommer
     med helt af sig selv. */
  var HUSNAVNE = {
    "kasse-kage": "Kagehuset",
    "kasse-citat": "Citathuset",
    "kasse-vedtaegter": "Rådhuset",
    "kasse-polls": "Afstemningsteltet",
    "kasse-senest": "Gif-biografen",
    "kasse-senest-solo": "Tristans biograf",
    "kasse-avatar": "Portrætgalleriet",
    "kasse-flag": "Flagpladsen",
    "kasse-sang": "Musikhuset",
    "kasse-mikkel": "Mikkels kontor",
    "kasse-erik": "Uret",
    "kasse-fredag": "Fredagsbaren",
    "kasse-vejr": "Vejrstationen",
    "kasse-bakke": "Bakken",
    "kasse-lande": "Geografihuset",
    "kasse-kryds": "Spilhallen",
    "kasse-vroevl": "Vrøvlehuset",
    "kasse-denne-dag": "Arkivet",
    "kasse-tal": "Statistikhuset",
    "kasse-hent": "Kagekøen",
    "kasse-femboy": "Navnebutikken",
    "kasse-normalside": "Skriverstuen",
    "kasse-dagensbillede": "Fotohuset",
    "kasse-om": "Infotårnet",
  };

  /* Hvert hus sit eget udseende ud fra hvad det er: vægfarve, tagfarve og et
     lille skilt. Et hus uden en post her får standardfarver og intet skilt, så
     nye kasser stadig virker. Ikonerne er små svg'er, ingen filer. */
  var IKON = {
    kage: '<path d="M4 20 h16 v-7 a8 4 0 0 0 -16 0 z" fill="#e8467f"/><rect x="4" y="18" width="16" height="3" fill="#d9a441"/><rect x="11" y="3" width="2" height="6" fill="#fff"/><circle cx="12" cy="2.5" r="1.6" fill="#ff9d1f"/>',
    bog: '<path d="M4 4 h7 v16 h-7 z" fill="#f4f0e2" stroke="#5a3a20"/><path d="M13 4 h7 v16 h-7 z" fill="#f4f0e2" stroke="#5a3a20"/><rect x="11" y="4" width="2" height="16" fill="#5a3a20"/>',
    lov: '<rect x="5" y="3" width="14" height="18" fill="#f4f0e2" stroke="#5a3a20"/><rect x="7" y="7" width="10" height="1.6" fill="#5a3a20"/><rect x="7" y="11" width="10" height="1.6" fill="#5a3a20"/><rect x="7" y="15" width="7" height="1.6" fill="#5a3a20"/>',
    bars: '<rect x="4" y="12" width="4" height="8" fill="#1a1aa8"/><rect x="10" y="7" width="4" height="13" fill="#1a1aa8"/><rect x="16" y="10" width="4" height="10" fill="#1a1aa8"/>',
    film: '<rect x="4" y="5" width="16" height="12" rx="1" fill="#222"/><path d="M10 8 l5 3 l-5 3 z" fill="#fff"/>',
    portraet: '<circle cx="12" cy="9" r="4" fill="#ef7d28"/><path d="M5 20 a7 6 0 0 1 14 0 z" fill="#2d7dd2"/>',
    flag: '<rect x="6" y="3" width="1.6" height="18" fill="#5a3a20"/><path d="M7.6 4 h11 v7 h-11 z" fill="#de2910"/>',
    node: '<circle cx="8" cy="17" r="2.4" fill="#111"/><circle cx="17" cy="15" r="2.4" fill="#111"/><rect x="10" y="6" width="1.6" height="11" fill="#111"/><rect x="19" y="4" width="1.6" height="11" fill="#111"/><rect x="10" y="6" width="11" height="2" fill="#111"/>',
    robot: '<rect x="6" y="7" width="12" height="10" rx="2" fill="#8aa0b0" stroke="#445"/><circle cx="9.5" cy="12" r="1.4" fill="#111"/><circle cx="14.5" cy="12" r="1.4" fill="#111"/><rect x="11" y="2" width="2" height="4" fill="#445"/>',
    ur: '<circle cx="12" cy="12" r="8" fill="#fff" stroke="#111"/><rect x="11.4" y="7" width="1.2" height="6" fill="#111"/><rect x="12" y="11.4" width="5" height="1.2" fill="#111"/>',
    oel: '<rect x="7" y="6" width="8" height="13" rx="1" fill="#f4c430"/><rect x="7" y="6" width="8" height="3" fill="#fff"/><rect x="15" y="9" width="3" height="6" rx="1" fill="none" stroke="#f4c430" stroke-width="1.6"/>',
    vejr: '<circle cx="12" cy="12" r="5" fill="#f4c430"/><g stroke="#f4c430" stroke-width="1.6"><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></g>',
    bakke: '<path d="M3 20 L21 6 L21 20 z" fill="#3a7d3a"/><circle cx="8" cy="16" r="2.4" fill="#ffe22e" stroke="#111"/>',
    klode: '<circle cx="12" cy="12" r="8" fill="#2d7dd2" stroke="#1c4a6a"/><path d="M4 12 h16 M12 4 a8 10 0 0 1 0 16 a8 10 0 0 1 0 -16" fill="none" stroke="#bfe9ff"/>',
    spil: '<rect x="3" y="8" width="18" height="9" rx="4" fill="#444"/><rect x="6" y="11" width="2" height="4" fill="#fff"/><rect x="5" y="12" width="4" height="2" fill="#fff"/><circle cx="16" cy="11.5" r="1.3" fill="#e23b2e"/><circle cx="18" cy="14" r="1.3" fill="#36a845"/>',
    navn: '<path d="M4 6 h12 l4 6 l-4 6 h-12 z" fill="#e86aa6"/><circle cx="16" cy="12" r="1.4" fill="#fff"/>',
    info: '<circle cx="12" cy="12" r="8" fill="#2d7dd2"/><rect x="11" y="10" width="2" height="7" fill="#fff"/><rect x="11" y="6.5" width="2" height="2" fill="#fff"/>',
    foto: '<rect x="3" y="7" width="18" height="12" rx="1" fill="#333"/><circle cx="12" cy="13" r="3.5" fill="#8fd3ff" stroke="#fff"/><rect x="7" y="5" width="5" height="2" fill="#333"/>',
  };

  var BYGNINGSDESIGN = {
    "kasse-kage": { vaeg: "#f7c6a0", tag: "#c0392b", ikon: "kage" },
    "kasse-citat": { vaeg: "#e8dfc0", tag: "#8a6d2f", ikon: "bog" },
    "kasse-vedtaegter": { vaeg: "#d8d2c0", tag: "#555", ikon: "lov" },
    "kasse-polls": { vaeg: "#cdd9ea", tag: "#2b4a8a", ikon: "bars" },
    "kasse-senest": { vaeg: "#c9c2d6", tag: "#4b2ecf", ikon: "film" },
    "kasse-senest-solo": { vaeg: "#c9c2d6", tag: "#6a3ecf", ikon: "film" },
    "kasse-avatar": { vaeg: "#e6cdbb", tag: "#a0622f", ikon: "portraet" },
    "kasse-flag": { vaeg: "#e9d7d7", tag: "#b33", ikon: "flag" },
    "kasse-sang": { vaeg: "#d3c9e6", tag: "#5a2ecf", ikon: "node" },
    "kasse-mikkel": { vaeg: "#c7d2d8", tag: "#45606e", ikon: "robot" },
    "kasse-erik": { vaeg: "#e8e2d2", tag: "#7a6a3a", ikon: "ur" },
    "kasse-fredag": { vaeg: "#f2e4b0", tag: "#c08a1a", ikon: "oel" },
    "kasse-vejr": { vaeg: "#cde7f7", tag: "#2b7fa8", ikon: "vejr" },
    "kasse-bakke": { vaeg: "#cfe8cf", tag: "#2a7a2e", ikon: "bakke" },
    "kasse-lande": { vaeg: "#cfe0ea", tag: "#2b6c8a", ikon: "klode" },
    "kasse-kryds": { vaeg: "#d8d8d8", tag: "#444", ikon: "spil" },
    "kasse-vroevl": { vaeg: "#e8dfc0", tag: "#8a6d2f", ikon: "bog" },
    "kasse-denne-dag": { vaeg: "#e0dac8", tag: "#7a5a2a", ikon: "bog" },
    "kasse-tal": { vaeg: "#cdd9ea", tag: "#2b4a8a", ikon: "bars" },
    "kasse-hent": { vaeg: "#f7c6a0", tag: "#c0392b", ikon: "kage" },
    "kasse-femboy": { vaeg: "#f2d2e4", tag: "#b3348a", ikon: "navn" },
    "kasse-normalside": { vaeg: "#e8e2d2", tag: "#6a5a3a", ikon: "bog" },
    "kasse-dagensbillede": { vaeg: "#cfd6de", tag: "#445", ikon: "foto" },
    "kasse-om": { vaeg: "#cdd9ea", tag: "#2b5a8a", ikon: "info" },
  };

  var KORT_B = 1600, KORT_H = 1000;
  var FART = 4.3;          // hvor hurtigt pingvinen går, px pr. billede
  var NAER = 95;           // hvor tæt på et hus man skal være for at gå ind
  var VEJ_Y = 500;         // midten af vejen (css: 460-540)

  var biler = [];          // {el, x, y, vx, w}
  var doedIndtil = 0;      // mens man er "død"/lige genoplivet, kører man ikke

  var FARVE_HEX = {
    bla: "#2d7dd2", roed: "#e23b2e", groen: "#36a845", gul: "#f4c430",
    lilla: "#8a4fc4", pink: "#e86aa6", sort: "#333333", orange: "#ef7d28",
  };

  // ---- pingvin-tegning ----

  function pingvinSVG(pingvin) {
    var krop = FARVE_HEX[pingvin.farve] || FARVE_HEX.bla;
    var hat = pingvin.hat || "ingen";
    var hatdele = "";
    if (hat === "nisse") {
      hatdele = '<path d="M11 15 L22 1 L33 15 Z" fill="#c22"/>' +
        '<circle cx="22" cy="1" r="3" fill="#fff"/>' +
        '<rect x="9" y="14" width="26" height="4" fill="#fff"/>';
    } else if (hat === "krone") {
      hatdele = '<path d="M12 15 L12 5 L17 10 L22 3 L27 10 L32 5 L32 15 Z" fill="#f4c430" stroke="#b8901a"/>';
    } else if (hat === "kasket") {
      hatdele = '<path d="M11 14 a11 7 0 0 1 22 0 Z" fill="#2b6cb0"/>' +
        '<rect x="9" y="13" width="18" height="4" rx="2" fill="#2b6cb0"/>';
    } else if (hat === "cylinder") {
      hatdele = '<rect x="14" y="2" width="16" height="13" fill="#222"/>' +
        '<rect x="9" y="14" width="26" height="4" fill="#222"/>';
    } else if (hat === "pandebaand") {
      hatdele = '<rect x="10" y="12" width="24" height="4" fill="#e23b2e"/>';
    }
    return '<svg viewBox="0 0 44 54" xmlns="http://www.w3.org/2000/svg">' +
      '<ellipse cx="22" cy="50" rx="13" ry="4" fill="rgba(0,0,0,0.15)"/>' +
      '<path d="M10 34 L6 48 L13 48 Z" fill="#ef7d28"/>' +
      '<path d="M34 34 L38 48 L31 48 Z" fill="#ef7d28"/>' +
      '<ellipse cx="22" cy="30" rx="15" ry="19" fill="' + krop + '"/>' +
      '<ellipse cx="22" cy="33" rx="9" ry="13" fill="#fff"/>' +
      '<circle cx="17" cy="22" r="2.2" fill="#111"/>' +
      '<circle cx="27" cy="22" r="2.2" fill="#111"/>' +
      '<path d="M19 26 L25 26 L22 30 Z" fill="#ef7d28"/>' +
      hatdele +
      '</svg>';
  }

  // ---- netværk ----

  function kald(sti, krop) {
    return fetch(DATA + "/konto/" + sti, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(krop || {}),
    }).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) throw new Error(d && d.fejl ? d.fejl : "fejl " + r.status);
        return d;
      });
    });
  }

  // ---- tilstand ----

  var token = null;
  var bruger = null;
  var pingvin = { farve: "bla", hat: "ingen" };
  var mig = { x: 800, y: 500 };
  var maal = null;          // {x, y, husId} når man er på vej et sted hen
  var retningVenstre = false;
  var taster = {};
  var huse = [];            // {id, navn, x, y, el}
  var andrePing = {};       // bruger -> DOM-node
  var aabenHus = null;      // kasse-id der er åbent lige nu
  var verdenKoerer = false;

  try { token = localStorage.getItem(GEM_TOKEN); } catch (e) {}

  // ---- opbygning af kortet ----

  function placerHuse() {
    var kasser = [].slice.call(document.querySelectorAll("#scene .kasse"));
    // rækker over og under vejen (vejen ligger ved y 460-540)
    var raekker = [160, 320, 640, 820];
    var perRaekke = Math.ceil(kasser.length / raekker.length);
    var margin = 130, brugbar = KORT_B - margin * 2;
    var kort = id("verden-kort");

    kasser.forEach(function (kasse, i) {
      var r = Math.floor(i / perRaekke);
      var kol = i % perRaekke;
      var x = margin + (perRaekke === 1 ? brugbar / 2 : (brugbar / (perRaekke - 1)) * kol);
      var y = raekker[Math.min(r, raekker.length - 1)];
      var navn = HUSNAVNE[kasse.id] || "Hus";

      var d = BYGNINGSDESIGN[kasse.id] || { vaeg: "#d98b45", tag: "#a33", ikon: null };
      var b = lav("div", "bygning");
      b.style.left = (x - 70) + "px";
      b.style.top = (y - 48) + "px";
      b.style.width = "140px";
      b.style.setProperty("--vaeg", d.vaeg);
      b.style.setProperty("--tag", d.tag);
      var hus = lav("div", "hus");
      if (d.ikon && IKON[d.ikon]) {
        var skilt = document.createElement("div");
        skilt.className = "hus-skilt";
        skilt.innerHTML = '<svg viewBox="0 0 24 24">' + IKON[d.ikon] + "</svg>";
        hus.appendChild(skilt);
      }
      b.appendChild(hus);
      b.appendChild(lav("div", "navn", navn));
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        maal = { x: x, y: y + 60, husId: kasse.id };  // gå hen til døren
      });
      kort.appendChild(b);
      huse.push({ id: kasse.id, navn: navn, x: x, y: y + 60, el: b });
    });
  }

  function tegnMig() {
    var p = id("verden-mig");
    p.innerHTML = pingvinSVG(pingvin);
    p.classList.toggle("spejl", retningVenstre);
  }

  function placerMig() {
    var p = id("verden-mig");
    p.style.left = mig.x + "px";
    p.style.top = mig.y + "px";
    var gaar = !!maal || taster.op || taster.ned || taster.ven || taster.hoj;
    p.classList.toggle("gaar", gaar);
  }

  // skub kortet så pingvinen bliver ved at være nogenlunde i midten
  function kamera() {
    var vb = window.innerWidth, vh = window.innerHeight;
    var cx = Math.max(0, Math.min(KORT_B - vb, mig.x - vb / 2));
    var cy = Math.max(0, Math.min(KORT_H - vh, mig.y - vh / 2));
    id("verden-kort").style.transform = "translate(" + (-cx) + "px," + (-cy) + "px)";
  }

  function naermesteHus() {
    var bedst = null, bedstAfstand = NAER;
    huse.forEach(function (h) {
      var d = Math.hypot(h.x - mig.x, h.y - mig.y);
      if (d < bedstAfstand) { bedstAfstand = d; bedst = h; }
    });
    return bedst;
  }

  // ---- biler på vejen ----

  function bilSVG() {
    // simpel side-bil: karrosseri, tag, ruder, hjul. kører mod højre som udgangspunkt
    var f = ["#e23b2e", "#2d7dd2", "#f4c430", "#36a845", "#8a4fc4", "#333"][
      Math.floor(Math.random() * 6)];
    return '<svg viewBox="0 0 68 30" xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="2" y="14" width="64" height="11" rx="3" fill="' + f + '"/>' +
      '<path d="M14 14 l8 -8 h20 l6 8 z" fill="' + f + '"/>' +
      '<rect x="20" y="8" width="12" height="6" fill="#bfe9ff"/>' +
      '<rect x="34" y="8" width="9" height="6" fill="#bfe9ff"/>' +
      '<circle cx="18" cy="26" r="4" fill="#111"/>' +
      '<circle cx="50" cy="26" r="4" fill="#111"/>' +
      '<circle cx="64" cy="19" r="2" fill="#ffec8a"/>' +
      '</svg>';
  }

  function spawnBil() {
    if (!verdenKoerer || aabenHus || biler.length > 6) return;
    var modHoejre = Math.random() < 0.5;
    var el = lav("div", "bil" + (modHoejre ? "" : " venstre"));
    el.innerHTML = bilSVG();
    var bil = {
      el: el,
      x: modHoejre ? -60 : KORT_B + 60,
      y: VEJ_Y + (Math.random() * 40 - 20),
      vx: (modHoejre ? 1 : -1) * (2.4 + Math.random() * 2.6),
      w: 68,
    };
    el.style.top = bil.y + "px";
    id("verden-kort").appendChild(el);
    biler.push(bil);
  }

  function koerBiler() {
    for (var i = biler.length - 1; i >= 0; i--) {
      var b = biler[i];
      b.x += b.vx;
      b.el.style.left = b.x + "px";
      // ude af kortet? væk med den
      if (b.x < -120 || b.x > KORT_B + 120) {
        if (b.el.parentNode) b.el.parentNode.removeChild(b.el);
        biler.splice(i, 1);
        continue;
      }
      // ramte den mig? kun når jeg går på vejen og ikke lige er blevet ramt
      if (Date.now() > doedIndtil &&
          Math.abs(mig.x - b.x) < b.w / 2 + 10 &&
          Math.abs(mig.y - b.y) < 24) {
        paakoert();
      }
    }
  }

  function paakoert() {
    doedIndtil = Date.now() + 1600;   // kort usårlighed, så man ikke mases
    // blodsprøjt hvor man stod
    var blod = lav("div", "blod");
    blod.style.left = mig.x + "px";
    blod.style.top = mig.y + "px";
    blod.innerHTML = '<svg viewBox="0 0 90 90" xmlns="http://www.w3.org/2000/svg">' +
      '<g fill="#b40d0d">' +
      '<circle cx="45" cy="48" r="20"/>' +
      '<circle cx="24" cy="40" r="7"/><circle cx="66" cy="38" r="9"/>' +
      '<circle cx="30" cy="66" r="6"/><circle cx="62" cy="64" r="8"/>' +
      '<circle cx="45" cy="22" r="5"/><circle cx="72" cy="56" r="5"/>' +
      '<circle cx="16" cy="54" r="4"/><circle cx="50" cy="72" r="4"/>' +
      '</g><g fill="#7a0000">' +
      '<circle cx="45" cy="48" r="9"/><circle cx="60" cy="42" r="3"/>' +
      '</g></svg>';
    id("verden-kort").appendChild(blod);
    setTimeout(function () { if (blod.parentNode) blod.parentNode.removeChild(blod); }, 2200);

    id("verden").classList.remove("doed");
    void id("verden").offsetWidth;        // genstart animationen
    id("verden").classList.add("doed");
    id("verden-paakoert").hidden = false;

    // forsvind et øjeblik, genoplive væk fra vejen
    id("verden-mig").style.visibility = "hidden";
    maal = null; taster = {};
    setTimeout(function () {
      mig.x = Math.max(60, Math.min(KORT_B - 60, mig.x));
      mig.y = 180;                        // oppe over vejen igen
      id("verden-mig").style.visibility = "";
      id("verden-paakoert").hidden = true;
      placerMig(); kamera();
    }, 900);
  }

  function skridt() {
    if (!verdenKoerer) return;
    if (!aabenHus) {
      koerBiler();
      var levende = Date.now() > doedIndtil;
      var dx = 0, dy = 0;
      if (taster.op) dy -= 1;
      if (taster.ned) dy += 1;
      if (taster.ven) dx -= 1;
      if (taster.hoj) dx += 1;

      if (!levende) { dx = 0; dy = 0; maal = null; }

      if (dx || dy) {
        maal = null;   // taster afbryder et klik-mål
        var l = Math.hypot(dx, dy) || 1;
        mig.x += (dx / l) * FART * 2.2;
        mig.y += (dy / l) * FART * 2.2;
        if (dx) retningVenstre = dx < 0;
      } else if (maal) {
        var mx = maal.x - mig.x, my = maal.y - mig.y;
        var afst = Math.hypot(mx, my);
        if (afst < FART * 2.4) {
          mig.x = maal.x; mig.y = maal.y;
          var gik = maal;
          maal = null;
          if (gik.husId) aabnHus(gik.husId);
        } else {
          mig.x += (mx / afst) * FART * 2.2;
          mig.y += (my / afst) * FART * 2.2;
          if (Math.abs(mx) > 1) retningVenstre = mx < 0;
        }
      }

      mig.x = Math.max(20, Math.min(KORT_B - 20, mig.x));
      mig.y = Math.max(60, Math.min(KORT_H - 10, mig.y));

      var naer = naermesteHus();
      huse.forEach(function (h) { h.el.classList.toggle("naer", h === naer); });

      placerMig();
      kamera();
    }
    requestAnimationFrame(skridt);
  }

  // ---- gå ind i et hus ----

  function aabnHus(husId) {
    var kasse = id(husId);
    if (!kasse || aabenHus) return;
    aabenHus = husId;
    var holder = id("verden-rum-indhold");
    holder.innerHTML = "";
    // selve kassen flyttes ind (ikke kopieres), så alle dens knapper virker
    kasse._hjem = kasse.nextSibling;
    kasse._scene = kasse.parentNode;
    // ryd de styles app.js' spred() kan have sat, så kassen ikke står skæv
    // eller fastlåst i bredden inde i rummet
    kasse.style.left = kasse.style.top = kasse.style.width = "";
    kasse.style.transform = kasse.style.zIndex = kasse.style.position = "";
    holder.appendChild(kasse);
    id("verden-rum").hidden = false;
  }

  function lukHus() {
    if (!aabenHus) return;
    var kasse = id(aabenHus);
    if (kasse && kasse._scene) {
      kasse._scene.insertBefore(kasse, kasse._hjem || null);
    }
    id("verden-rum").hidden = true;
    aabenHus = null;
  }

  // ---- de andre online ----

  function tegnAndre(liste) {
    var set = {};
    liste.forEach(function (o) {
      if (o.bruger === bruger) return;   // mig selv tegner jeg allerede
      set[o.bruger] = true;
      var node = andrePing[o.bruger];
      if (!node) {
        node = lav("div", "pingvin");
        node.appendChild(lav("div", "navn", o.bruger));
        node._krop = lav("div");
        node.appendChild(node._krop);
        id("verden-kort").appendChild(node);
        andrePing[o.bruger] = node;
      }
      node._krop.innerHTML = pingvinSVG(o.pingvin || {});
      node.classList.toggle("spejl", o.retning === "v");
      node.style.left = o.x + "px";
      node.style.top = o.y + "px";
      node.style.display = o.bygning ? "none" : "";   // inde i et hus = ikke på kortet
    });
    // dem der er gået, fjernes
    Object.keys(andrePing).forEach(function (navn) {
      if (!set[navn]) {
        var n = andrePing[navn];
        if (n.parentNode) n.parentNode.removeChild(n);
        delete andrePing[navn];
      }
    });
  }

  function melding() {
    if (!token) return Promise.resolve();
    return kald("her", {
      token: token,
      x: Math.round(mig.x),
      y: Math.round(mig.y),
      bygning: aabenHus || "",
      retning: retningVenstre ? "v" : "h",
      pingvin: pingvin,
    }).then(function (svar) {
      tegnAndre(svar.online || []);
      var antal = (svar.online || []).length;
      id("verden-online").textContent = antal + (antal === 1 ? " online" : " online");
    }).catch(function () {});
  }

  // ---- customize ----

  function visCustomize() {
    var panel = id("verden-customize");
    panel.hidden = false;
    var forhaand = id("customize-forhaand");

    function opdater() {
      forhaand.innerHTML = '<div class="pingvin" style="position:static;margin:0">'
        + pingvinSVG(pingvin) + "</div>";
      panel.querySelectorAll(".farve-proeve").forEach(function (b) {
        b.classList.toggle("valgt", b.dataset.farve === pingvin.farve);
      });
      panel.querySelectorAll(".hat-knap").forEach(function (b) {
        b.classList.toggle("valgt", b.dataset.hat === pingvin.hat);
      });
    }
    opdater();
    panel._opdater = opdater;
  }

  // ---- login ----

  function visLogin() {
    id("verden-login").hidden = false;
  }

  function efterLogin(d) {
    token = d.token;
    bruger = d.brugernavn;
    pingvin = d.pingvin || pingvin;
    try { localStorage.setItem(GEM_TOKEN, token); } catch (e) {}
    id("verden-login").hidden = true;
    start();
  }

  function start() {
    if (verdenKoerer) { tegnMig(); return; }
    verdenKoerer = true;
    document.body.classList.add("verden-paa");
    id("verden").hidden = false;
    placerHuse();
    // min pingvin skal ligge PÅ kortet, så den følger med når kameraet scroller
    id("verden-kort").appendChild(id("verden-mig"));
    tegnMig();
    placerMig();
    kamera();
    requestAnimationFrame(skridt);
    melding();
    setInterval(melding, 800);
    // biler ruller forbi med mellemrum. indi bad om at kunne blive kørt ned
    setInterval(spawnBil, 1500);
  }

  // ---- opsætning af knapper og taster ----

  function saetOp() {
    /* Styring: klik eller træk på kortet, så går pingvinen derhen. Holder man
       museknappen/fingeren nede og bevæger sig, følger målet med, så man kan
       "lede" pingvinen rundt — det er nemmere end at klikke sig frem på pc. */
    var holdt = false;
    function sigMaal(e) {
      var kort = id("verden-kort").getBoundingClientRect();
      maal = { x: e.clientX - kort.left, y: e.clientY - kort.top };
    }
    id("verden").addEventListener("pointerdown", function (e) {
      if (aabenHus || !verdenKoerer) return;
      if (e.target.closest(".bygning") || e.target.closest("#verden-vaerktoej")
          || e.target.closest("#til-hovedside")) return;
      holdt = true;
      sigMaal(e);
    });
    id("verden").addEventListener("pointermove", function (e) {
      if (holdt && !aabenHus) sigMaal(e);
    });
    function slip() { holdt = false; }
    id("verden").addEventListener("pointerup", slip);
    id("verden").addEventListener("pointercancel", slip);
    id("verden").addEventListener("pointerleave", slip);

    var KEY = { ArrowUp: "op", ArrowDown: "ned", ArrowLeft: "ven", ArrowRight: "hoj",
                w: "op", s: "ned", a: "ven", d: "hoj", W: "op", S: "ned", A: "ven", D: "hoj" };

    /* Capture-fasen kører før app.js' egne genveje. Så længe man går rundt i
       verdenen (ikke inde i et hus, ikke i et felt), sluger vi tastetrykkene,
       så et "s" bliver til et skridt og ikke åbner app.js' søgefelt. Inde i et
       hus lader vi alt passere, så husets eget indhold virker som før. */
    document.addEventListener("keydown", function (e) {
      if (!verdenKoerer || aabenHus) return;
      var t = (e.target.tagName || "").toLowerCase();
      if (t === "input" || t === "textarea" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Enter") {
        var h = naermesteHus();
        if (h) { aabnHus(h.id); e.preventDefault(); e.stopPropagation(); }
        return;
      }
      if (KEY[e.key]) {
        taster[KEY[e.key]] = true;
        e.preventDefault();
        e.stopPropagation();   // app.js skal ikke også se tasten
      }
    }, true);
    document.addEventListener("keyup", function (e) {
      if (KEY[e.key]) taster[KEY[e.key]] = false;
    }, true);

    id("verden-luk").addEventListener("click", lukHus);
    id("verden-rum").addEventListener("click", function (e) {
      if (e.target === id("verden-rum")) lukHus();   // klik udenfor lukker
    });

    id("knap-customize").addEventListener("click", visCustomize);
    id("knap-logud").addEventListener("click", function () {
      try { localStorage.removeItem(GEM_TOKEN); } catch (e) {}
      location.reload();
    });

    // login/opret-panelet
    var faneLogin = id("fane-login"), faneOpret = id("fane-opret");
    var titel = id("login-titel"), knap = id("login-knap"), fejl = id("login-fejl");
    var tilstand = "login";
    function saetFane(hvad) {
      tilstand = hvad;
      faneLogin.classList.toggle("valgt", hvad === "login");
      faneOpret.classList.toggle("valgt", hvad === "opret");
      titel.textContent = hvad === "login" ? "log ind" : "lav en konto";
      knap.textContent = hvad === "login" ? "log ind" : "opret";
      fejl.textContent = "";
    }
    faneLogin.addEventListener("click", function () { saetFane("login"); });
    faneOpret.addEventListener("click", function () { saetFane("opret"); });

    function send() {
      var b = id("login-bruger").value.trim();
      var k = id("login-kode").value;
      if (!b || !k) { fejl.textContent = "udfyld begge felter"; return; }
      knap.disabled = true;
      fejl.textContent = "";
      kald(tilstand === "login" ? "login" : "opret", { brugernavn: b, kode: k })
        .then(efterLogin)
        .catch(function (e) { fejl.textContent = e.message; knap.disabled = false; });
    }
    knap.addEventListener("click", send);
    id("login-kode").addEventListener("keydown", function (e) {
      if (e.key === "Enter") send();
    });

    // customize-panelet
    var cpanel = id("verden-customize");
    cpanel.querySelectorAll(".farve-proeve").forEach(function (b) {
      b.addEventListener("click", function () {
        pingvin.farve = b.dataset.farve;
        tegnMig();
        if (cpanel._opdater) cpanel._opdater();
      });
    });
    cpanel.querySelectorAll(".hat-knap").forEach(function (b) {
      b.addEventListener("click", function () {
        pingvin.hat = b.dataset.hat;
        tegnMig();
        if (cpanel._opdater) cpanel._opdater();
      });
    });
    id("customize-gem").addEventListener("click", function () {
      if (!token) { cpanel.hidden = true; return; }
      kald("gem", { token: token, pingvin: pingvin }).catch(function () {});
      cpanel.hidden = true;
      melding();
    });

    window.addEventListener("resize", kamera);
  }

  // ---- i gang ----

  function begynd() {
    saetOp();
    if (token) {
      // vi har et token fra sidst — tjek at det stadig gælder
      kald("mig", { token: token }).then(function (d) {
        bruger = d.brugernavn;
        pingvin = d.pingvin || pingvin;
        start();
      }).catch(function () {
        try { localStorage.removeItem(GEM_TOKEN); } catch (e) {}
        token = null;
        visLogin();
      });
    } else {
      visLogin();
    }
  }

  /* Verdenen bor på sit eget subdomain, ikke på hovedsiden. Der blev bedt om
     at qr25.dk bliver ved med at være den almindelige side, og at pingvin-
     verdenen kun er club.qr25.dk. Begge serveres af de samme filer; det er
     kun værtsnavnet der afgør hvad der tændes.

     club.* → verden. localhost eller #verden i adressen → verden, så man kan
     teste den lokalt. Alt andet (altså qr25.dk selv) → ingen verden, og siden
     er præcis som før. */
  function verdenHer() {
    var v = location.hostname || "";
    if (v.indexOf("club.") === 0 || v.indexOf("pingvin.") === 0) return true;
    if (location.hash.indexOf("verden") !== -1) return true;
    return false;
  }

  if (!verdenHer()) return;   // på hovedsiden gør verden.js ingenting

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", begynd);
  } else {
    begynd();
  }
})();
