"""
Henter klinikker fra Brønnøysundregistrene og genererer HTML-klinikkort.
Bruk: python scripts/hent_klinikker.py --kommune 3005 --kommunenavn Drammen
"""

import argparse
import json
import time
import urllib.request
import urllib.parse
from pathlib import Path

NACE_KODER = {
    "96.220": "Skjønnhetspleie",
    "96.230": "Spa og badstue",
    "86.210": "Legevirksomhet (estetikk)",
}

KOMMUNER = {
    "drammen":    "3005",
    "oslo":       "0301",
    "bergen":     "4601",
    "trondheim":  "5001",
    "stavanger":  "1103",
}

BASE_URL = "https://data.brreg.no/enhetsregisteret/api/enheter"


def hent_side(nace_kode: str, side: int, stoerrelse: int = 100) -> dict:
    params = urllib.parse.urlencode({
        "naeringskode": nace_kode,
        "size": stoerrelse,
        "page": side,
    })
    url = f"{BASE_URL}?{params}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


def hent_alle_for_nace(nace_kode: str, kommunenummer: str) -> list[dict]:
    """Henter alle aktive bedrifter for en NACE-kode og filtrerer på kommunenummer."""
    resultater = []
    side = 0

    print(f"  Henter NACE {nace_kode} ...", end="", flush=True)
    while True:
        data = hent_side(nace_kode, side)
        enheter = data.get("_embedded", {}).get("enheter", [])
        total_sider = data.get("page", {}).get("totalPages", 0)

        for enhet in enheter:
            if enhet.get("konkurs") or enhet.get("underAvvikling"):
                continue
            adresse = enhet.get("forretningsadresse", {})
            if adresse.get("kommunenummer") == kommunenummer:
                resultater.append(enhet)

        side += 1
        if side >= total_sider:
            break
        time.sleep(0.2)  # Ikke overbelast APIet

    print(f" {len(resultater)} treff")
    return resultater


def lag_initialer(navn: str) -> str:
    ord_liste = navn.replace('"', "").split()
    initialer = "".join(o[0] for o in ord_liste if o[0].isalpha())
    return initialer[:2].upper() if initialer else "??"


def format_adresse(adresse: dict) -> str:
    gate = ", ".join(adresse.get("adresse", []))
    postnr = adresse.get("postnummer", "")
    poststed = adresse.get("poststed", "")
    if gate:
        return f"{gate}, {postnr} {poststed}".strip(", ")
    return f"{postnr} {poststed}".strip()


def finn_tjenester(enhet: dict) -> list[str]:
    nace = enhet.get("naeringskode1", {}).get("kode", "")
    tjenester = list({
        "96.220": ["Hudpleie", "Ansiktsbehandling", "Kroppsbehandling"],
        "96.230": ["Spa", "Massasje", "Velvære"],
        "86.210": ["Medisinsk estetikk", "Botox", "Fillers"],
    }.get(nace, ["Skjønnhetspleie"]))
    aktiviteter = enhet.get("aktivitet", [])
    if aktiviteter:
        for akt in aktiviteter[:2]:
            kort = akt.rstrip(".").strip()
            if kort and kort not in tjenester:
                tjenester.append(kort)
    return tjenester[:4]


def generer_klinikkort(enhet: dict) -> str:
    navn = enhet.get("navn", "Ukjent")
    orgnr_raa = enhet.get("organisasjonsnummer", "")
    orgnr = f"{orgnr_raa[:3]} {orgnr_raa[3:6]} {orgnr_raa[6:]}" if len(orgnr_raa) == 9 else orgnr_raa
    initialer = lag_initialer(navn)
    adresse = format_adresse(enhet.get("forretningsadresse", {}))
    telefon = enhet.get("telefon", "") or enhet.get("mobil", "") or "Ikke oppgitt"
    nettside = enhet.get("hjemmeside", "") or "Ikke oppgitt"
    tjenester = finn_tjenester(enhet)

    tjeneste_tags = "\n            ".join(
        f'<span class="service-tag">{t}</span>' for t in tjenester
    )

    return f"""        <div class="clinic-card">
          <div class="card-header">
            <div class="clinic-initials">{initialer}</div>
            <span class="verified-badge">✓ Registrert</span>
          </div>
          <div class="clinic-name">{navn.title()}</div>
          <div class="clinic-orgnr">Org.nr: {orgnr}</div>
          <div class="card-details">
            <div class="detail-row">📍 <span>{adresse}</span></div>
            <div class="detail-row">📞 <span>{telefon}</span></div>
            <div class="detail-row">🌐 <span>{nettside}</span></div>
          </div>
          <div class="services-row">
            {tjeneste_tags}
          </div>
          <div class="card-footer">
            <button class="btn-primary">Se detaljer</button>
            <button class="btn-secondary">Kart</button>
          </div>
        </div>"""


def oppdater_html(html_fil: Path, klinikkort_html: str, antall: int) -> None:
    innhold = html_fil.read_text(encoding="utf-8")

    # Erstatt klinikkgrid-innholdet
    import re
    nytt_grid = (
        f'<div class="clinics-grid">\n{klinikkort_html}\n      </div>'
    )
    innhold = re.sub(
        r'<div class="clinics-grid">.*?</div>(?=\s*</section>)',
        nytt_grid,
        innhold,
        flags=re.DOTALL,
    )

    # Oppdater antall klinikker i hero-statistikk
    innhold = re.sub(
        r'(<span class="stat-number">)\d+(</span>\s*<span class="stat-label">Registrerte klinikker)',
        rf'\g<1>{antall}\2',
        innhold,
    )

    html_fil.write_text(innhold, encoding="utf-8")
    print(f"  Oppdatert: {html_fil}")


def main():
    parser = argparse.ArgumentParser(description="Hent klinikker fra Brønnøysund")
    parser.add_argument("--kommune", help="Kommunenummer, f.eks. 3005")
    parser.add_argument("--kommunenavn", help="Kommunenavn, f.eks. drammen", default=None)
    parser.add_argument("--kun-data", action="store_true", help="Skriv kun JSON, ikke HTML")
    args = parser.parse_args()

    kommunenummer = args.kommune
    if not kommunenummer and args.kommunenavn:
        kommunenummer = KOMMUNER.get(args.kommunenavn.lower())
    if not kommunenummer:
        print(f"Kjente kommuner: {', '.join(KOMMUNER)}")
        print("Bruk --kommune <nr> eller --kommunenavn <navn>")
        return

    kommunenavn = args.kommunenavn or kommunenummer
    print(f"\nHenter klinikker for kommune {kommunenummer} ({kommunenavn.title()})...")

    alle = []
    for nace in NACE_KODER:
        alle.extend(hent_alle_for_nace(nace, kommunenummer))

    # Dedupliser på org.nr
    sett = {}
    for e in alle:
        sett[e["organisasjonsnummer"]] = e
    unike = list(sett.values())
    unike.sort(key=lambda e: e.get("navn", ""))

    print(f"\nTotalt {len(unike)} unike klinikker funnet.")

    # Lagre rådata
    rot = Path(__file__).parent.parent
    data_mappe = rot / "scripts" / "data"
    data_mappe.mkdir(exist_ok=True)
    json_fil = data_mappe / f"klinikker_{kommunenavn.lower()}.json"
    json_fil.write_text(json.dumps(unike, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  Rådata lagret: {json_fil}")

    if args.kun_data:
        return

    # Generer HTML-klinikkort
    alle_kort = "\n".join(generer_klinikkort(e) for e in unike)

    # Finn og oppdater relevante HTML-filer
    for mappe in rot.iterdir():
        if not mappe.is_dir() or mappe.name.startswith("_") or mappe.name.startswith("."):
            continue
        if kommunenavn.lower() in mappe.name.lower():
            html_fil = mappe / "index.html"
            if html_fil.exists():
                oppdater_html(html_fil, alle_kort, len(unike))

    print("\nFerdig!")


if __name__ == "__main__":
    main()
