#!/usr/bin/env python3
"""Download the 2 tabs of the public Natal-bairros Google Sheet and write two
normalized CSVs matching the schema expected by src/index.ts."""
import csv
import io
import os
import re
import urllib.request

SHEET_ID = "12EQIogWde6yLfqpXWp1aI-R_r3fGUik4vBvgXudGeQk"
GID_BAIRROS = "1717684106"
GID_ESGOTAMENTO = "1560455754"
CODE_RE = re.compile(r"^2408102\d{3}$")  # 10-digit bairro codes for Natal
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")


def fetch_rows(gid):
    url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={gid}"
    with urllib.request.urlopen(url) as resp:
        text = resp.read().decode("utf-8")
    rows = list(csv.reader(io.StringIO(text)))
    # keep only real data rows (first column is a Natal bairro code)
    return [r for r in rows if r and CODE_RE.match(r[0].strip())]


def parse_br(value):
    """Convert a BR-formatted number string to float. '7.416,8'->7416.8,
    '76.177'->76177, '10,27'->10.27, '17,2%'->0.172, ''->0."""
    s = value.strip().strip('"')
    is_pct = s.endswith("%")
    s = s.rstrip("%").strip()
    if s == "" or s == "-":
        return 0.0
    if "." in s and "," in s:        # dot = thousands, comma = decimal
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:                   # comma = decimal
        s = s.replace(",", ".")
    else:                            # only dots = thousands separators
        s = s.replace(".", "")
    num = float(s)
    return num / 100.0 if is_pct else num


def as_int(value):
    return str(int(round(parse_br(value))))


def main():
    os.makedirs(DATA_DIR, exist_ok=True)

    # --- bairros (demographics / housing) ---
    bairros = fetch_rows(GID_BAIRROS)
    bairros_out = os.path.join(DATA_DIR, "bairros_natal.csv")
    with open(bairros_out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow([
            "codigo_bairro", "bairro", "area_km2", "populacao_residente",
            "densidade_hab_km2", "domicilios_particulares_total",
            "domicilios_ocupados", "domicilios_uso_ocasional",
            "domicilios_vagos", "pct_nao_ocupados", "media_moradores_domicilio",
        ])
        for r in bairros:
            # cols: codigo, bairro, area, pop, densidade, dom_part, ocup, ocas, vagos, %nao_ocup, media
            w.writerow([
                r[0].strip(), r[1].strip(), parse_br(r[2]), as_int(r[3]),
                parse_br(r[4]), as_int(r[5]), as_int(r[6]), as_int(r[7]),
                as_int(r[8]), parse_br(r[9]), parse_br(r[10]),
            ])

    # --- esgotamento (sanitation) ---
    esg = fetch_rows(GID_ESGOTAMENTO)
    esg_out = os.path.join(DATA_DIR, "esgotamento_por_bairro_natal.csv")
    with open(esg_out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow([
            "codigo_bairro", "bairro", "rede_geral_ou_pluvial",
            "fossa_septica_ligada_rede", "fossa_septica_nao_ligada_rede",
            "fossa_rudimentar_ou_buraco", "vala", "rio_lago_corrego_mar",
            "outra_forma", "sem_banheiro_sanitario",
            "total_domicilios_esgotamento", "pct_adequado",
        ])
        for r in esg:
            # cols: codigo, bairro, rede, fossa_lig, fossa_nlig, fossa_rud, vala, rio, outra, sem, total, %adequado
            w.writerow([
                r[0].strip(), r[1].strip(), as_int(r[2]), as_int(r[3]),
                as_int(r[4]), as_int(r[5]), as_int(r[6]), as_int(r[7]),
                as_int(r[8]), as_int(r[9]), as_int(r[10]), parse_br(r[11]),
            ])

    print(f"Wrote {len(bairros)} bairros -> {bairros_out}")
    print(f"Wrote {len(esg)} esgotamento rows -> {esg_out}")


if __name__ == "__main__":
    main()
