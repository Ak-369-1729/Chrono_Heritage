"""Pydantic request schemas (validation boundary for the v2 API)."""

from __future__ import annotations

import re
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

SourceType = Literal["primary", "peer_reviewed", "monograph", "excavation_report", "survey_report", "secondary",
                     "database", "field_notes", "illustrative"]
NorthRef = Literal["true", "astronomical", "magnetic", "grid", "unspecified"]
AxisModeT = Literal["directed", "bidirectional"]
Method = Literal["total_station", "theodolite_sun_sight", "gnss_baseline", "surveyed_plan", "prismatic_compass",
                 "compass", "satellite_imagery", "published_plan_estimate", "sketch"]
Unit = Literal["deg", "grad", "mil_nato"]
Calendar = Literal["julian", "gregorian_proleptic"]
SITE_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{2,62}$")


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class LoginIn(Strict):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=200)


RoleT = Literal["viewer", "researcher", "steward", "reviewer", "admin"]
RequestableRole = Literal["steward", "reviewer"]


class UserCreateIn(Strict):
    """Administrator-created account (trusted path: any role)."""

    email: str = Field(min_length=3, max_length=320)
    display_name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=12, max_length=200)
    role: RoleT = "researcher"
    affiliation: str | None = Field(None, max_length=300)


class RegisterIn(Strict):
    """Public self-registration. ``requested_role`` is a request only: steward and reviewer need an administrator.

    There is deliberately no ``role`` field; sending one is rejected (extra fields are forbidden).
    """

    email: str = Field(min_length=3, max_length=320)
    display_name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=1, max_length=200)
    requested_role: Literal["researcher", "steward", "reviewer"] = "researcher"
    affiliation: str | None = Field(None, max_length=300)
    statement: str | None = Field(None, max_length=2000, description="Why the privileged role is needed")


class ProfilePatch(Strict):
    display_name: str | None = Field(None, min_length=1, max_length=200)
    affiliation: str | None = Field(None, max_length=300)
    preferences: dict | None = None

    @field_validator("preferences")
    @classmethod
    def _prefs(cls, v):
        if v is None:
            return v
        allowed = {"motion": {"system", "reduced", "full"}, "landing": {"auto", "3d", "layers", "static"},
                   "density": {"comfortable", "compact"}}
        for k, val in v.items():
            if k not in allowed or val not in allowed[k]:
                raise ValueError(f"unsupported preference {k}={val!r}")
        return v


class PasswordChangeIn(Strict):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=1, max_length=200)


class RoleRequestIn(Strict):
    requested_role: RequestableRole
    statement: str | None = Field(None, max_length=2000)


class RoleDecisionIn(Strict):
    decision: Literal["approve", "decline"]
    note: str | None = Field(None, max_length=2000)


class AdminUserPatch(Strict):
    role: RoleT | None = None
    status: Literal["active", "suspended"] | None = None
    note: str | None = Field(None, max_length=2000)


class SourceIn(Strict):
    citation: str = Field(min_length=5, max_length=4000)
    source_type: SourceType
    url: str | None = Field(None, max_length=2000)
    doi: str | None = Field(None, max_length=200)
    publisher: str | None = Field(None, max_length=300)
    accessed_at: date | None = None
    licence: str | None = Field(None, max_length=300)
    checksum: str | None = Field(None, max_length=128)

    @field_validator("url")
    @classmethod
    def _url(cls, v):
        if v and not v.startswith(("http://", "https://")):
            raise ValueError("url must start with http:// or https://")
        return v


class SiteIn(Strict):
    id: str = Field(description="Stable slug, lowercase letters/digits/hyphens")
    name: str = Field(min_length=2, max_length=300)
    site_type: str | None = Field(None, max_length=100)
    region: str | None = Field(None, max_length=200)
    country: str | None = Field(None, max_length=100)
    description: str | None = Field(None, max_length=8000)
    lat: float | None = Field(None, ge=-90, le=90)
    lon: float | None = Field(None, ge=-180, le=180)
    elevation_m: float | None = Field(None, ge=-500, le=9000)
    crs: str | None = Field(None, max_length=50)
    coordinates_source_id: str | None = None
    visibility: Literal["public", "private"] = "private"
    sensitivity: Literal["normal", "restricted"] = "normal"
    stratum: str | None = Field(None, max_length=120)

    @field_validator("id")
    @classmethod
    def _id(cls, v):
        if not SITE_ID_RE.match(v):
            raise ValueError("id must be 3–63 chars of lowercase letters, digits and hyphens")
        return v

    @model_validator(mode="after")
    def _coords(self):
        if (self.lat is None) != (self.lon is None):
            raise ValueError("lat and lon must be provided together")
        if self.lat is not None and not self.crs:
            raise ValueError("crs is required when coordinates are given (e.g. EPSG:4326)")
        return self


class SitePatch(Strict):
    name: str | None = Field(None, min_length=2, max_length=300)
    site_type: str | None = None
    region: str | None = None
    country: str | None = None
    description: str | None = Field(None, max_length=8000)
    lat: float | None = Field(None, ge=-90, le=90)
    lon: float | None = Field(None, ge=-180, le=180)
    elevation_m: float | None = Field(None, ge=-500, le=9000)
    crs: str | None = None
    coordinates_source_id: str | None = None
    visibility: Literal["public", "private"] | None = None
    sensitivity: Literal["normal", "restricted"] | None = None
    stratum: str | None = None


class OrientationIn(Strict):
    label: str = Field(min_length=2, max_length=300)
    axis_definition: str | None = Field(None, max_length=2000)
    raw_bearing: float = Field(ge=-100000, le=100000)
    bearing_unit: Unit = "deg"
    axis_mode: AxisModeT
    north_reference: NorthRef
    magnetic_declination_deg: float | None = Field(None, ge=-90, le=90)
    magnetic_declination_uncertainty_deg: float | None = Field(None, ge=0, le=30)
    magnetic_declination_source: str | None = Field(None, max_length=2000)
    grid_crs: str | None = Field(None, max_length=50)
    method: Method | None = None
    uncertainty_deg: float | None = Field(None, gt=0, le=45)
    uncertainty_distribution: Literal["normal", "uniform_halfwidth"] = "normal"
    uncertainty_unavailable_reason: str | None = Field(None, max_length=2000)
    measured_at: date | None = None
    source_id: str | None = None
    is_primary: bool = True

    @model_validator(mode="after")
    def _rules(self):
        if self.uncertainty_deg is None and not self.uncertainty_unavailable_reason:
            raise ValueError("Provide uncertainty_deg or document uncertainty_unavailable_reason (no silent zero error).")
        if self.uncertainty_deg is not None and self.uncertainty_unavailable_reason:
            raise ValueError("Give either uncertainty_deg or uncertainty_unavailable_reason, not both.")
        return self


class ChronologyIn(Strict):
    start_year: int = Field(ge=-3000, le=3000, description="Astronomical year numbering (0 = 1 BCE)")
    end_year: int = Field(ge=-3000, le=3000)
    calendar_basis: Calendar | None = None
    date_basis: str | None = Field(None, max_length=200)
    model: Literal["uniform", "normal"] = "uniform"
    central_year: float | None = None
    sigma_years: float | None = Field(None, gt=0)
    uncertainty_note: str | None = Field(None, max_length=4000)
    source_id: str | None = None

    @model_validator(mode="after")
    def _rules(self):
        if self.start_year > self.end_year:
            raise ValueError("start_year must not be after end_year")
        if self.model == "normal" and (self.central_year is None or self.sigma_years is None):
            raise ValueError("normal model requires central_year and sigma_years from the source")
        if self.model == "normal" and not (self.start_year <= self.central_year <= self.end_year + 1):
            raise ValueError("central_year must lie within the documented range")
        return self


class HorizonIn(Strict):
    kind: Literal["measured", "dem", "none_declared"]
    azimuths_deg: list[float] = Field(default_factory=list, max_length=7200)
    altitudes_deg: list[float] = Field(default_factory=list, max_length=7200)
    altitude_uncertainty_deg: float | None = Field(None, gt=0, le=10)
    resolution_note: str | None = Field(None, max_length=2000)
    observer_height_m: float | None = Field(None, ge=0, le=100)
    source_id: str | None = None

    @model_validator(mode="after")
    def _rules(self):
        if self.kind in ("measured", "dem"):
            if len(self.azimuths_deg) < 2 or len(self.azimuths_deg) != len(self.altitudes_deg):
                raise ValueError("measured/dem profiles need ≥2 paired azimuth/altitude samples")
            if any(not (-5 <= a <= 45) for a in self.altitudes_deg):
                raise ValueError("horizon altitudes must lie within −5° … 45°")
            if not self.source_id:
                raise ValueError("measured/dem profiles require a source_id")
        elif self.azimuths_deg or self.altitudes_deg:
            raise ValueError("none_declared must not include samples")
        return self


class SiteSourceIn(Strict):
    source_id: str
    role: Literal["identity", "coordinates", "orientation", "chronology", "horizon", "general"] = "general"


class ReviewIn(Strict):
    decision: Literal["approve", "reject"]
    note: str = Field(min_length=5, max_length=4000)


class ObservationIn(Strict):
    observer_label: str = Field(min_length=1, max_length=200)
    observed_at: date | None = None
    method: Method | None = None
    north_reference: NorthRef | None = None
    readings_deg: list[float] = Field(min_length=1, max_length=200)
    notes: str | None = Field(None, max_length=8000)


class FeasibilityIn(Strict):
    title: str = Field(min_length=3, max_length=300)
    site_ids: list[str] = Field(min_length=1, max_length=50)


class AnalysisParamsIn(Strict):
    horizon_mode: Literal["site_profile", "flat"] = "site_profile"
    limb: Literal["upper_limb", "centre", "lower_limb"] = "upper_limb"
    atmosphere: dict | None = None
    n_samples: int = Field(10_000, ge=1000, le=100_000)
    windows_deg: list[float] = Field(default_factory=lambda: [0.5, 1.0, 2.0], min_length=1, max_length=6)
    seed: int | None = Field(None, ge=0, lt=2**31)


class HypothesisIn(Strict):
    target_key: str
    statement: str = Field(min_length=20, max_length=4000)
    rationale: str | None = Field(None, max_length=4000)
    mode: Literal["confirmatory", "exploratory"] = "confirmatory"


class AnalysisIn(Strict):
    site_id: str
    hypothesis: HypothesisIn
    parameters: AnalysisParamsIn = AnalysisParamsIn()
    visibility: Literal["private", "public"] = "private"


class RerunIn(Strict):
    seed: int | None = Field(None, ge=0, lt=2**31, description="Omit to reuse the parent seed")


class SkyIn(Strict):
    site_id: str | None = None
    lat: float | None = Field(None, ge=-90, le=90)
    lon: float | None = Field(None, ge=-180, le=180)
    elevation_m: float = Field(0.0, ge=-500, le=9000)
    target_key: str
    year: int | None = Field(None, ge=-2999, le=2999)
    year_end: int | None = Field(None, ge=-2999, le=2999)
    calendar_year: int | None = Field(None, ge=-2999, le=2999)
    calendar_month: int | None = Field(None, ge=1, le=12)
    calendar_day: int | None = Field(None, ge=1, le=31)
    calendar: Calendar = "julian"
    orientation_deg: float | None = Field(None, ge=-720, le=720)
    north_reference: NorthRef | None = None
    magnetic_declination_deg: float | None = Field(None, ge=-90, le=90)
    axis_mode: AxisModeT | None = None
    orientation_sigma_deg: float | None = Field(None, gt=0, le=45)
    horizon_mode: Literal["site_profile", "flat", "constant"] = "flat"
    horizon_constant_deg: float | None = Field(None, ge=-2, le=30)
    limb: Literal["upper_limb", "centre", "lower_limb"] = "upper_limb"
    refraction: Literal["bennett_1982", "none"] = "bennett_1982"
    pressure_hpa: float = Field(1010.0, ge=500, le=1100)
    temperature_c: float = Field(10.0, ge=-50, le=55)
    compare_reference: bool = False


class CrossSiteIn(Strict):
    target_key: str
    statement: str = Field(min_length=20, max_length=4000)
    null_model: Literal["empirical_reference", "sector_uniform", "uniform_circular"]
    null_justification: str = Field(min_length=80, max_length=8000)
    statistic: Literal["count_within_window", "mean_abs_residual"] = "count_within_window"
    window_deg: float = Field(1.0, gt=0, le=10)
    n_null: int = Field(10_000, ge=1000, le=200_000)
    seed: int | None = Field(None, ge=0, lt=2**31)
    reference_orientations: dict[str, list[float]] = Field(default_factory=dict)
    sectors: dict[str, tuple[float, float]] = Field(default_factory=dict)
    correction: Literal["holm", "bh", "max_statistic", "none"] = "holm"


class ComparisonIn(Strict):
    case_label: str = Field(min_length=2, max_length=200)
    tool: Literal["ArchaeoSky", "Gestirne", "Stellarium", "QGIS + plugin/equivalent", "ChronoHeritage"]
    tool_version: str = Field(min_length=1, max_length=80)
    operator_label: str = Field(min_length=1, max_length=200)
    task_definition: str = Field(min_length=10, max_length=4000)
    elapsed_seconds: float = Field(gt=0, le=60 * 60 * 24 * 14)
    manual_steps: int = Field(ge=0, le=10_000)
    provenance_fields_preserved: list[str] = Field(default_factory=list)
    uncertainty_propagation: Literal["none", "manual", "partial", "automated"]
    reproducibility_steps: int = Field(ge=0, le=10_000)
    notes: str | None = Field(None, max_length=8000)
    evidence_ref: str = Field(min_length=3, max_length=2000, description="Screen recording, log file, or notebook ref")
    measured_at: date


class PilotIn(Strict):
    researcher_role: str = Field(min_length=2, max_length=200)
    consent_recorded: bool
    hypothesis: str = Field(min_length=10, max_length=4000)
    hypothesis_source: str | None = Field(None, max_length=2000)
    run_date: date
    analysis_run_id: str | None = None
    steps: list[str] = Field(default_factory=list, max_length=200)
    external_tools: list[str] = Field(default_factory=list, max_length=50)
    elapsed_minutes: float = Field(gt=0, le=60 * 24 * 30)
    friction: list[str] = Field(default_factory=list, max_length=200)
    output_sections_used: list[str] = Field(default_factory=list, max_length=50)
    limitations_noted: str | None = Field(None, max_length=4000)
    would_return: Literal["yes", "no", "unsure"]
    return_reason: str | None = Field(None, max_length=4000)
    citation_commitment: Literal["none", "stated_interest", "explicit_agreement"]
    citation_venue: str | None = Field(None, max_length=300)
    evidence_note: str | None = Field(None, max_length=4000)

    @model_validator(mode="after")
    def _consent(self):
        if not self.consent_recorded:
            raise ValueError("A pilot can only be recorded with the researcher's consent.")
        if self.citation_commitment == "explicit_agreement" and not self.citation_venue:
            raise ValueError("Record the venue (paper, thesis or grant) for an explicit citation agreement.")
        return self


class SignoffIn(Strict):
    condition_key: str = Field(min_length=2, max_length=60)
    decision: Literal["approve", "reject"]
    rationale: str = Field(min_length=20, max_length=8000)
    evidence_refs: list[str] = Field(default_factory=list, max_length=50)


class ReportIn(Strict):
    kind: Literal["analysis", "feasibility", "benchmark", "comparison", "cross_site"]
    subject_id: str | None = None
