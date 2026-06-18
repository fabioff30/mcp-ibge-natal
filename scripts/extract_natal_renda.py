#!/usr/bin/env python3
"""Download the IBGE 'Rendimento do Responsável' aggregated-by-neighborhood file
(Censo 2022) and write a normalized CSV with the income of the household head for
each of Natal's bairros.

Source: Censo 2022 / Agregados por Setores Censitários - Rendimento do Responsável
(file already aggregated by bairro for the whole country; we filter Natal = 2408102).

NOTE: This is the income of the *responsável pelo domicílio* (household head), a
different universe from the municipal get_average_income tool (all occupied persons
14+). The two are not directly comparable.
"""
import csv
import io
import os
import re
import urllib.request
import zipfile

BASE = ("https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022/"
        "Agregados_por_Setores_Censitarios_Rendimento_do_Responsavel")
ZIP_NAME = "Agregados_por_bairros_renda_responsavel_BR_20260508_csv.zip"
CSV_IN_ZIP = "Agregados_por_bairros_renda_responsavel_BR.csv"
CODE_RE = re.compile(r"^2408102\d{3}$")  # 10-digit Natal bairro codes
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")


def fetch_rows():
    url = f"{BASE}/{ZIP_NAME}"
    with urllib.request.urlopen(url) as resp:
        raw = resp.read()
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        # the source CSV is latin-1, semicolon-separated
        text = zf.read(CSV_IN_ZIP).decode("latin-1")
    rows = list(csv.reader(io.StringIO(text), delimiter=";"))
    return [r for r in rows if r and CODE_RE.match(r[0].strip())]


def parse_br(value):
    """'2157,56' -> 2157.56 ; '1562' -> 1562.0 ; '' -> 0."""
    s = value.strip().strip('"')
    if s == "" or s == "-":
        return 0.0
    if "." in s and "," in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    return float(s)


def as_int(value):
    return str(int(round(parse_br(value))))


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    rows = fetch_rows()
    out = os.path.join(DATA_DIR, "renda_por_bairro_natal.csv")
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow([
            "codigo_bairro", "bairro", "responsaveis", "moradores",
            "rendimento_medio_responsavel", "rendimento_mediano_responsavel",
        ])
        for r in rows:
            # cols: CD_BAIRRO, NM_BAIRRO, V06001, V06002, V06003, V06004, V06005, V06006
            w.writerow([
                r[0].strip(), r[1].strip(), as_int(r[2]), as_int(r[3]),
                parse_br(r[5]), parse_br(r[7]),
            ])
    print(f"Wrote {len(rows)} bairros -> {out}")


if __name__ == "__main__":
    main()
