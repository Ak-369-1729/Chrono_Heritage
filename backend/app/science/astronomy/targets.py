"""Registry of astronomical targets / events (PRD FR-07).

Only targets with a benchmarked computation path are ``supported``.  Others are
listed so the UI can show them *disabled* with the reason, rather than silently
computing something unvalidated.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Target:
    key: str
    label: str
    body: str
    kind: str                 # "solstice" | "equinox" | "date"
    phenomenon: str           # "rise" | "set"
    ecliptic_longitude_deg: float | None
    supported: bool
    note: str
    benchmark_classes: tuple[str, ...] = ()

    def as_dict(self):
        return {
            "key": self.key, "label": self.label, "body": self.body, "kind": self.kind,
            "phenomenon": self.phenomenon, "supported": self.supported, "note": self.note,
            "benchmark_classes": list(self.benchmark_classes),
        }


EQUINOX_NOTE = (
    "Defined as the sunrise/sunset nearest the instant the Sun's apparent ecliptic longitude is "
    "0° (March) or 180° (September). Historical 'equinox' concepts (equilux, mid-day between solstices) "
    "differ by up to ~2 days, i.e. up to ~1° in azimuth at mid-latitudes; declare which definition the "
    "hypothesis uses."
)
SOLSTICE_NOTE = (
    "Sunrise/sunset nearest the instant the Sun's apparent ecliptic longitude is 90° (June) or 270° "
    "(December). The solar declination is stationary, so the azimuth is insensitive to the exact day."
)

TARGETS: dict[str, Target] = {t.key: t for t in [
    Target("sun_june_solstice_rise", "Sun — June solstice rise", "sun", "solstice", "rise", 90.0, True,
           SOLSTICE_NOTE, ("historical", "modern", "horizon")),
    Target("sun_june_solstice_set", "Sun — June solstice set", "sun", "solstice", "set", 90.0, True,
           SOLSTICE_NOTE, ("historical", "modern", "horizon")),
    Target("sun_december_solstice_rise", "Sun — December solstice rise", "sun", "solstice", "rise", 270.0, True,
           SOLSTICE_NOTE, ("historical", "modern", "horizon")),
    Target("sun_december_solstice_set", "Sun — December solstice set", "sun", "solstice", "set", 270.0, True,
           SOLSTICE_NOTE, ("historical", "modern", "horizon")),
    Target("sun_march_equinox_rise", "Sun — March equinox rise", "sun", "equinox", "rise", 0.0, True,
           EQUINOX_NOTE, ("modern",)),
    Target("sun_march_equinox_set", "Sun — March equinox set", "sun", "equinox", "set", 0.0, True,
           EQUINOX_NOTE, ("modern",)),
    Target("sun_september_equinox_rise", "Sun — September equinox rise", "sun", "equinox", "rise", 180.0, True,
           EQUINOX_NOTE, ("modern",)),
    Target("sun_september_equinox_set", "Sun — September equinox set", "sun", "equinox", "set", 180.0, True,
           EQUINOX_NOTE, ("modern",)),
    Target("sun_rise_on_date", "Sun — rise on a stated calendar date", "sun", "date", "rise", None, True,
           "Requires an explicit calendar date and calendar basis (Julian or proleptic Gregorian).", ("modern",)),
    Target("sun_set_on_date", "Sun — set on a stated calendar date", "sun", "date", "set", None, True,
           "Requires an explicit calendar date and calendar basis (Julian or proleptic Gregorian).", ("modern",)),
    Target("moon_major_standstill", "Moon — major standstill limits", "moon", "standstill", "rise", None, False,
           "Not supported: lunar standstill limits need an 18.6-year extreme-declination model, parallax and "
           "limb handling that have not yet passed the benchmark gate."),
    Target("moon_minor_standstill", "Moon — minor standstill limits", "moon", "standstill", "rise", None, False,
           "Not supported: see major standstill."),
    Target("star_heliacal_rising", "Star — heliacal rising", "star", "heliacal", "rise", None, False,
           "Not supported: requires proper motion, extinction and arcus-visionis visibility models that are "
           "not benchmarked."),
    Target("sun_cross_quarter", "Sun — cross-quarter days", "sun", "cross_quarter", "rise", None, False,
           "Not supported: cross-quarter definitions are contested (calendar vs. solar-longitude); add a "
           "pre-registered definition before enabling."),
]}


def get_target(key: str) -> Target:
    if key not in TARGETS:
        raise KeyError(f"Unknown target '{key}'.")
    return TARGETS[key]
