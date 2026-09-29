#!/usr/bin/env python3
"""Trækker et sæt genkendelige lande ud af Natural Earth (public domain) og
laver hvert til en SVG-sti, normaliseret til en 100x100-kasse.

Skriver lande.json (til repoet) og et kontaktark (til at kigge på)."""
import json
import math
import sys

VALGTE = [
    "DNK", "SWE", "NOR", "ITA", "FRA", "ESP", "PRT", "DEU", "GBR", "IRL",
    "ISL", "GRC", "TUR", "CHE", "POL", "FIN", "JPN", "AUS", "NZL",
    "BRA", "CHL", "ARG", "USA", "CAN", "MEX", "IND", "EGY", "ZAF", "MDG",
    "IDN", "KOR", "UKR",
]
DANSK = {
    "DNK": "Danmark", "SWE": "Sverige", "NOR": "Norge", "ITA": "Italien",
    "FRA": "Frankrig", "ESP": "Spanien", "PRT": "Portugal", "DEU": "Tyskland",
    "GBR": "Storbritannien", "IRL": "Irland", "ISL": "Island", "GRC": "Grækenland",
    "TUR": "Tyrkiet", "NLD": "Holland", "CHE": "Schweiz", "POL": "Polen",
    "FIN": "Finland", "JPN": "Japan", "AUS": "Australien", "NZL": "New Zealand",
    "BRA": "Brasilien", "CHL": "Chile", "ARG": "Argentina", "USA": "USA",
    "CAN": "Canada", "MEX": "Mexico", "IND": "Indien", "EGY": "Egypten",
    "ZAF": "Sydafrika", "MDG": "Madagaskar", "IDN": "Indonesien",
    "KOR": "Sydkorea", "UKR": "Ukraine",
}
BOKS = 100.0
KANT = 6.0


def ringe(geom):
    """Alle polygoners ydre ring, som lister af (lon, lat)."""
    ud = []
    if geom["type"] == "Polygon":
        ud.append(geom["coordinates"][0])
    elif geom["type"] == "MultiPolygon":
        for p in geom["coordinates"]:
            ud.append(p[0])
    return ud


def areal(ring):
    s = 0.0
    for i in range(len(ring)):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % len(ring)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2.0


def byg_sti(geom):
    rs = ringe(geom)
    if not rs:
        return None, None, None
    stoerst = max(rs, key=areal)
    lons = [p[0] for p in stoerst]
    lats = [p[1] for p in stoerst]
    lon0, lon1 = min(lons), max(lons)
    lat0, lat1 = min(lats), max(lats)
    # lidt luft, så et land der lige rammer bbox-kanten stadig kan ses
    dl = (lon1 - lon0) * 0.06 or 1
    dt = (lat1 - lat0) * 0.06 or 1
    lon0 -= dl; lon1 += dl; lat0 -= dt; lat1 += dt

    midlat = math.radians((lat0 + lat1) / 2)
    kx = math.cos(midlat)
    bredde = (lon1 - lon0) * kx
    hoejde = (lat1 - lat0)
    s = (BOKS - 2 * KANT) / max(bredde, hoejde)
    ox = KANT + (BOKS - 2 * KANT - bredde * s) / 2
    oy = KANT + (BOKS - 2 * KANT - hoejde * s) / 2

    def projekt(lon, lat):
        x = ox + (lon - lon0) * kx * s
        y = oy + (lat1 - lat) * s      # nord opad
        return x, y

    stier = []
    for r in rs:
        # spring ringe over der ligger helt uden for vinduet (fjerne øer mm.)
        if all(not (lon0 <= lon <= lon1 and lat0 <= lat <= lat1) for lon, lat in r):
            continue
        # tynd punkterne lidt ud, ellers bliver stien unødigt lang
        pts = r if len(r) <= 400 else r[::2]
        d = []
        for k, (lon, lat) in enumerate(pts):
            x, y = projekt(lon, lat)
            d.append(("M" if k == 0 else "L") + "%.1f %.1f" % (x, y))
        stier.append(" ".join(d) + " Z")
    return " ".join(stier), None, None


def main():
    d = json.load(open(sys.argv[1]))
    efter = {}
    for f in d["features"]:
        p = f["properties"]
        iso = p.get("ADM0_A3") or p.get("ISO_A3")
        if iso in VALGTE:
            efter[iso] = f

    lande = []
    for iso in VALGTE:
        if iso not in efter:
            print("mangler:", iso, file=sys.stderr)
            continue
        f = efter[iso]
        p = f["properties"]
        sti, _, _ = byg_sti(f["geometry"])
        if not sti:
            print("ingen sti:", iso, file=sys.stderr)
            continue
        lande.append({
            "iso": iso,
            "navn": DANSK.get(iso, p.get("NAME")),
            "sti": sti,
            "lat": round(float(p.get("LABEL_Y")), 3),
            "lon": round(float(p.get("LABEL_X")), 3),
        })

    json.dump({"lande": lande}, open("lande.json", "w"), ensure_ascii=False)
    print("skrev", len(lande), "lande,", sum(len(l["sti"]) for l in lande), "tegn sti i alt")

    # kontaktark: alle lande i et gitter
    kol = 6
    celle = 100
    raek = (len(lande) + kol - 1) // kol
    dele = []
    for i, l in enumerate(lande):
        cx = (i % kol) * celle
        cy = (i // kol) * celle
        dele.append(
            '<g transform="translate(%d,%d)">'
            '<rect width="100" height="100" fill="#dfe8f0"/>'
            '<path d="%s" fill="#3a7d3a" stroke="#1c4a1c" stroke-width="0.7"/>'
            '<text x="50" y="96" font-size="8" text-anchor="middle" fill="#333">%s</text>'
            "</g>" % (cx, cy, l["sti"], l["navn"])
        )
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d">'
           '<rect width="100%%" height="100%%" fill="#fff"/>%s</svg>'
           % (kol * celle, raek * celle, "".join(dele)))
    open("lande-ark.svg", "w").write(svg)
    print("kontaktark: lande-ark.svg")


if __name__ == "__main__":
    main()
