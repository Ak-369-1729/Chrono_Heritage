"""JPL Horizons reference adapter (PRD §12.4, FR-28, FR-29, §16.3).

Queries the public Horizons API for the Sun's *airless apparent* topocentric
azimuth/elevation at explicit TT instants — the same quantity the candidate
engine produces before refraction.  Every call is logged (URL parameters,
retrieval timestamp, API version, response SHA-256).  If the service cannot be
reached the case is reported as **blocked**; a reference value is never
substituted or invented.

Attribution: NASA/JPL Horizons On-Line Ephemeris System, https://ssd.jpl.nasa.gov/horizons/.
Only the extracted numeric values and the response hash are retained.
"""

from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx

HORIZONS_URL = os.environ.get("CHRONO_HORIZONS_URL", "https://ssd.jpl.nasa.gov/api/horizons.api")
ATTRIBUTION = "NASA/JPL Horizons On-Line Ephemeris System (https://ssd.jpl.nasa.gov/horizons/)"
LICENCE_NOTE = (
    "Horizons output is provided by JPL/Caltech for public use; cite the Horizons system and "
    "retain request parameters. Only numeric extracts and a response hash are stored."
)


class ReferenceUnavailable(RuntimeError):
    pass


@dataclass
class HorizonsResult:
    rows: list[dict]           # [{tt_jd, az_deg, el_deg}]
    request_params: dict
    retrieved_at: str
    api_version: str | None
    response_sha256: str

    def as_dict(self):
        return self.__dict__.copy()


def build_params(*, lat: float, lon: float, elev_m: float, tt_jds: list[float]) -> dict:
    return {
        "format": "json",
        "COMMAND": "'10'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'coord@399'",
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon:.6f},{lat:.6f},{elev_m / 1000.0:.4f}'",
        "TLIST": "'" + "' '".join(f"{jd:.9f}" for jd in tt_jds) + "'",
        "TLIST_TYPE": "'JD'",
        "TIME_TYPE": "'TT'",
        "QUANTITIES": "'4'",
        "APPARENT": "'AIRLESS'",
        "ANG_FORMAT": "'DEG'",
        "CSV_FORMAT": "'YES'",
        "EXTRA_PREC": "'YES'",
        "CAL_FORMAT": "'JD'",
    }


def parse_result_text(text: str) -> list[dict]:
    if "$$SOE" not in text or "$$EOE" not in text:
        raise ReferenceUnavailable("Horizons response did not contain an ephemeris block ($$SOE/$$EOE).")
    block = text.split("$$SOE", 1)[1].split("$$EOE", 1)[0]
    rows = []
    for line in block.strip().splitlines():
        parts = [p.strip() for p in line.split(",")]
        nums = []
        for p in parts:
            try:
                nums.append(float(p))
            except ValueError:
                continue
        if len(nums) < 3:
            raise ReferenceUnavailable(f"Unparseable Horizons row: {line!r}")
        rows.append({"tt_jd": nums[0], "az_deg": nums[-2], "el_deg": nums[-1]})
    return rows


def fetch_sun_azel(*, lat: float, lon: float, elev_m: float, tt_jds: list[float],
                   timeout_s: float = 20.0, client: httpx.Client | None = None) -> HorizonsResult:
    params = build_params(lat=lat, lon=lon, elev_m=elev_m, tt_jds=tt_jds)
    retrieved_at = datetime.now(UTC).isoformat()
    try:
        c = client or httpx.Client(timeout=timeout_s)
        resp = c.get(HORIZONS_URL, params=params)
    except httpx.HTTPError as exc:
        raise ReferenceUnavailable(f"JPL Horizons unreachable: {type(exc).__name__}: {exc}") from exc
    if resp.status_code != 200:
        raise ReferenceUnavailable(f"JPL Horizons returned HTTP {resp.status_code}.")
    body = resp.text
    try:
        data = resp.json()
    except ValueError as exc:
        raise ReferenceUnavailable("JPL Horizons returned non-JSON content.") from exc
    if "error" in data:
        raise ReferenceUnavailable(f"JPL Horizons error: {data['error']}")
    rows = parse_result_text(data.get("result", ""))
    return HorizonsResult(
        rows=rows,
        request_params=params,
        retrieved_at=retrieved_at,
        api_version=(data.get("signature") or {}).get("version"),
        response_sha256=hashlib.sha256(body.encode()).hexdigest(),
    )
