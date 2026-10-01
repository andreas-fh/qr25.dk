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
    "kasse-om": "Infotårnet",
  };

  var KORT_B = 1600, KORT_H = 1000;
  var FART = 3.4;          // hvor hurtigt pingvinen går, px pr. billede
  var NAER = 95;           // hvor tæt på et hus man skal være for at gå ind

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

      var b = lav("div", "bygning");
      b.style.left = (x - 70) + "px";
      b.style.top = (y - 48) + "px";
      b.style.width = "140px";
      b.appendChild(lav("div", "hus"));
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

  function skridt() {
    if (!verdenKoerer) return;
    if (!aabenHus) {
      var dx = 0, dy = 0;
      if (taster.op) dy -= 1;
      if (taster.ned) dy += 1;
      if (taster.ven) dx -= 1;
      if (taster.hoj) dx += 1;

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
  }

  // ---- opsætning af knapper og taster ----

  function saetOp() {
    // klik på kortet = gå derhen
    id("verden").addEventListener("pointerdown", function (e) {
      if (aabenHus || !verdenKoerer) return;
      if (e.target.closest(".bygning") || e.target.closest("#verden-vaerktoej")) return;
      var kort = id("verden-kort").getBoundingClientRect();
      maal = { x: e.clientX - kort.left, y: e.clientY - kort.top };
    });

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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", begynd);
  } else {
    begynd();
  }
})();
