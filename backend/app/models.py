"""SQLAlchemy models (PRD §11).

Design rules
* Raw measurement values are immutable columns; transformations are computed
  and stored inside analysis snapshots with their parameters (FR-27).
* Analysis runs are immutable once completed; a rerun creates a new row with
  ``parent_run_id`` (FR-15).
* Benchmark tables are independent of the site dataset (PRD Fig. 6).
* No ML tables: ML is omitted from this build (V3.0; PRD §13.4).
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from geoalchemy2 import Geography
from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(UTC)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class User(Base, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = (Index("ix_users_email_lower", func.lower(text("email")), unique=True),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="researcher")
    password_hash: Mapped[str] = mapped_column(String(400), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # V3: account lifecycle. ``is_active`` remains the gate checked on every request; ``status`` explains it
    # (active | pending_activation | suspended).
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active", server_default="active")
    affiliation: Mapped[str | None] = mapped_column(String(300))
    preferences: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default="{}")
    registered_via: Mapped[str] = mapped_column(String(20), nullable=False, default="admin", server_default="admin")
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RoleRequest(Base, TimestampMixin):
    """A request for a privileged role. Choosing a role at sign-up only *requests* it; an administrator decides."""

    __tablename__ = "role_requests"
    __table_args__ = (CheckConstraint("requested_role IN ('steward', 'reviewer')",
                                      name="ck_role_requests_privileged_only"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    requested_role: Mapped[str] = mapped_column(String(20), nullable=False)
    statement: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    decided_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decision_note: Mapped[str | None] = mapped_column(Text)


class AuthSession(Base, TimestampMixin):
    """Server-side record of an issued session token, so sign-out and password changes revoke it."""

    __tablename__ = "auth_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoke_reason: Mapped[str | None] = mapped_column(String(40))
    client: Mapped[str | None] = mapped_column(String(120))


class Source(Base, TimestampMixin):
    __tablename__ = "sources"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    citation: Mapped[str] = mapped_column(Text, nullable=False)
    source_type: Mapped[str] = mapped_column(String(40), nullable=False)
    url: Mapped[str | None] = mapped_column(Text)
    doi: Mapped[str | None] = mapped_column(String(200))
    publisher: Mapped[str | None] = mapped_column(String(300))
    accessed_at: Mapped[date | None] = mapped_column(Date)
    licence: Mapped[str | None] = mapped_column(String(300))
    checksum: Mapped[str | None] = mapped_column(String(128))
    is_illustrative: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))


class Site(Base, TimestampMixin):
    __tablename__ = "sites"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    site_type: Mapped[str | None] = mapped_column(String(100))
    region: Mapped[str | None] = mapped_column(String(200))
    country: Mapped[str | None] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text)
    lat: Mapped[float | None] = mapped_column(Float)
    lon: Mapped[float | None] = mapped_column(Float)
    elevation_m: Mapped[float | None] = mapped_column(Float)
    crs: Mapped[str | None] = mapped_column(String(50))
    geom = mapped_column(Geography(geometry_type="POINT", srid=4326, spatial_index=True), nullable=True)
    coordinates_source_id: Mapped[str | None] = mapped_column(ForeignKey("sources.id"))
    status: Mapped[str] = mapped_column(String(20), default="submitted", nullable=False)
    visibility: Mapped[str] = mapped_column(String(20), default="public", nullable=False)
    sensitivity: Mapped[str] = mapped_column(String(20), default="normal", nullable=False)
    is_illustrative: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    stratum: Mapped[str | None] = mapped_column(String(120))
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    orientations: Mapped[list[Orientation]] = relationship(back_populates="site", order_by="Orientation.created_at")
    chronologies: Mapped[list[ChronologyRecord]] = relationship(back_populates="site",
                                                                order_by="ChronologyRecord.created_at")
    horizons: Mapped[list[HorizonProfileRecord]] = relationship(back_populates="site")
    source_links: Mapped[list[SiteSource]] = relationship(back_populates="site", cascade="all, delete-orphan")


class SiteSource(Base):
    __tablename__ = "site_sources"
    site_id: Mapped[str] = mapped_column(ForeignKey("sites.id"), primary_key=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("sources.id"), primary_key=True)
    role: Mapped[str] = mapped_column(String(40), primary_key=True, default="general")
    site: Mapped[Site] = relationship(back_populates="source_links")
    source: Mapped[Source] = relationship()


class ChronologyRecord(Base, TimestampMixin):
    __tablename__ = "chronology_records"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    site_id: Mapped[str] = mapped_column(ForeignKey("sites.id"), nullable=False, index=True)
    start_year: Mapped[int | None] = mapped_column(Integer)
    end_year: Mapped[int | None] = mapped_column(Integer)
    calendar_basis: Mapped[str | None] = mapped_column(String(40))
    date_basis: Mapped[str | None] = mapped_column(String(200))
    model: Mapped[str] = mapped_column(String(20), default="uniform", nullable=False)
    central_year: Mapped[float | None] = mapped_column(Float)
    sigma_years: Mapped[float | None] = mapped_column(Float)
    uncertainty_note: Mapped[str | None] = mapped_column(Text)
    source_id: Mapped[str | None] = mapped_column(ForeignKey("sources.id"))
    status: Mapped[str] = mapped_column(String(20), default="submitted", nullable=False)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    site: Mapped[Site] = relationship(back_populates="chronologies")
    source: Mapped[Source | None] = relationship()


class Orientation(Base, TimestampMixin):
    __tablename__ = "orientations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    site_id: Mapped[str] = mapped_column(ForeignKey("sites.id"), nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(300), nullable=False)
    axis_definition: Mapped[str | None] = mapped_column(Text)
    raw_bearing: Mapped[float | None] = mapped_column(Float)
    bearing_unit: Mapped[str] = mapped_column(String(20), default="deg", nullable=False)
    axis_mode: Mapped[str | None] = mapped_column(String(20))
    north_reference: Mapped[str | None] = mapped_column(String(20))
    magnetic_declination_deg: Mapped[float | None] = mapped_column(Float)
    magnetic_declination_uncertainty_deg: Mapped[float | None] = mapped_column(Float)
    magnetic_declination_source: Mapped[str | None] = mapped_column(Text)
    grid_crs: Mapped[str | None] = mapped_column(String(50))
    method: Mapped[str | None] = mapped_column(String(60))
    uncertainty_deg: Mapped[float | None] = mapped_column(Float)
    uncertainty_distribution: Mapped[str] = mapped_column(String(30), default="normal", nullable=False)
    uncertainty_unavailable_reason: Mapped[str | None] = mapped_column(Text)
    measured_at: Mapped[date | None] = mapped_column(Date)
    source_id: Mapped[str | None] = mapped_column(ForeignKey("sources.id"))
    status: Mapped[str] = mapped_column(String(20), default="submitted", nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    site: Mapped[Site] = relationship(back_populates="orientations")
    source: Mapped[Source | None] = relationship()


class Observation(Base, TimestampMixin):
    __tablename__ = "observations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    site_id: Mapped[str] = mapped_column(ForeignKey("sites.id"), nullable=False, index=True)
    observer_label: Mapped[str] = mapped_column(String(200), nullable=False)
    observed_at: Mapped[date | None] = mapped_column(Date)
    method: Mapped[str | None] = mapped_column(String(60))
    north_reference: Mapped[str | None] = mapped_column(String(20))
    readings_deg: Mapped[list] = mapped_column(JSON, default=list)
    notes: Mapped[str | None] = mapped_column(Text)
    quality_flag: Mapped[str] = mapped_column(String(20), default="unreviewed")
    visibility: Mapped[str] = mapped_column(String(20), default="private", nullable=False)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))


class HorizonProfileRecord(Base, TimestampMixin):
    __tablename__ = "horizon_profiles"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    site_id: Mapped[str] = mapped_column(ForeignKey("sites.id"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    azimuths_deg: Mapped[list] = mapped_column(JSON, default=list)
    altitudes_deg: Mapped[list] = mapped_column(JSON, default=list)
    altitude_uncertainty_deg: Mapped[float | None] = mapped_column(Float)
    resolution_note: Mapped[str | None] = mapped_column(Text)
    observer_height_m: Mapped[float | None] = mapped_column(Float)
    source_id: Mapped[str | None] = mapped_column(ForeignKey("sources.id"))
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    site: Mapped[Site] = relationship(back_populates="horizons")
    source: Mapped[Source | None] = relationship()


class SiteImage(Base, TimestampMixin):
    __tablename__ = "site_images"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    site_id: Mapped[str] = mapped_column(ForeignKey("sites.id"), nullable=False, index=True)
    storage_key: Mapped[str] = mapped_column(String(300), nullable=False)
    content_type: Mapped[str] = mapped_column(String(50), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    attribution: Mapped[str] = mapped_column(Text, nullable=False)
    licence: Mapped[str] = mapped_column(String(300), nullable=False)
    caption: Mapped[str | None] = mapped_column(Text)
    visibility: Mapped[str] = mapped_column(String(20), default="private", nullable=False)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))


class AnalysisRun(Base, TimestampMixin):
    __tablename__ = "analysis_runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    site_id: Mapped[str | None] = mapped_column(ForeignKey("sites.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20), default="single_site", nullable=False)
    tier: Mapped[str] = mapped_column(String(40), default="published_case_study", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="queued", nullable=False)
    hypothesis: Mapped[dict] = mapped_column(JSON, nullable=False)
    parameters: Mapped[dict] = mapped_column(JSON, nullable=False)
    input_snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    input_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    versions: Mapped[dict] = mapped_column(JSON, default=dict)
    seed: Mapped[int] = mapped_column(Integer, nullable=False)
    parent_run_id: Mapped[str | None] = mapped_column(ForeignKey("analysis_runs.id"))
    review_status: Mapped[str] = mapped_column(String(20), default="unreviewed", nullable=False)
    reviewed_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    review_note: Mapped[str | None] = mapped_column(Text)
    visibility: Mapped[str] = mapped_column(String(20), default="private", nullable=False)
    is_illustrative: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    error: Mapped[dict | None] = mapped_column(JSON)
    warnings: Mapped[list] = mapped_column(JSON, default=list)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    results: Mapped[list[AnalysisResult]] = relationship(back_populates="run", order_by="AnalysisResult.created_at")


class AnalysisResult(Base, TimestampMixin):
    __tablename__ = "analysis_results"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    run_id: Mapped[str] = mapped_column(ForeignKey("analysis_runs.id"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(30), nullable=False)
    predicted_azimuth_deg: Mapped[float | None] = mapped_column(Float)
    residual_signed_deg: Mapped[float | None] = mapped_column(Float)
    residual_abs_deg: Mapped[float | None] = mapped_column(Float)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    run: Mapped[AnalysisRun] = relationship(back_populates="results")


class BenchmarkSuite(Base, TimestampMixin):
    __tablename__ = "benchmark_suites"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    tolerances: Mapped[dict] = mapped_column(JSON, nullable=False)
    tolerance_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    frozen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    frozen_by: Mapped[str] = mapped_column(String(300), nullable=False)
    tolerances_reviewed_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    tolerances_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cases: Mapped[list[BenchmarkCase]] = relationship(back_populates="suite", order_by="BenchmarkCase.case_key")


class BenchmarkCase(Base, TimestampMixin):
    __tablename__ = "benchmark_cases"
    __table_args__ = (UniqueConstraint("suite_id", "case_key", "version"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    suite_id: Mapped[str] = mapped_column(ForeignKey("benchmark_suites.id"), nullable=False)
    case_key: Mapped[str] = mapped_column(String(60), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    test_class: Mapped[str] = mapped_column(String(30), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    critical: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    inputs: Mapped[dict] = mapped_column(JSON, nullable=False)
    reference_kind: Mapped[str] = mapped_column(String(60), nullable=False)
    independence_note: Mapped[str] = mapped_column(Text, nullable=False)
    tolerance_deg: Mapped[float | None] = mapped_column(Float)
    tolerance_rationale: Mapped[str] = mapped_column(Text, nullable=False)
    licence_note: Mapped[str] = mapped_column(Text, nullable=False)
    input_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    suite: Mapped[BenchmarkSuite] = relationship(back_populates="cases")


class BenchmarkRun(Base, TimestampMixin):
    __tablename__ = "benchmark_runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    suite_id: Mapped[str] = mapped_column(ForeignKey("benchmark_suites.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="running", nullable=False)
    environment: Mapped[dict] = mapped_column(JSON, default=dict)
    summary: Mapped[dict] = mapped_column(JSON, default=dict)
    triggered_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    results: Mapped[list[BenchmarkResult]] = relationship(back_populates="run")


class BenchmarkResult(Base, TimestampMixin):
    __tablename__ = "benchmark_results"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    run_id: Mapped[str] = mapped_column(ForeignKey("benchmark_runs.id"), nullable=False, index=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("benchmark_cases.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False)  # pass | fail | blocked
    candidate_output: Mapped[dict | None] = mapped_column(JSON)
    reference_outputs: Mapped[dict | None] = mapped_column(JSON)
    max_abs_difference_deg: Mapped[float | None] = mapped_column(Float)
    tolerance_deg: Mapped[float | None] = mapped_column(Float)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    reference_metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    log: Mapped[list] = mapped_column(JSON, default=list)
    run: Mapped[BenchmarkRun] = relationship(back_populates="results")
    case: Mapped[BenchmarkCase] = relationship()


class ReferenceRetrieval(Base):
    __tablename__ = "reference_retrievals"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    provider: Mapped[str] = mapped_column(String(60), nullable=False)
    case_key: Mapped[str | None] = mapped_column(String(60))
    request_params: Mapped[dict] = mapped_column(JSON, nullable=False)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    api_version: Mapped[str | None] = mapped_column(String(40))
    response_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    extracted: Mapped[dict] = mapped_column(JSON, nullable=False)
    attribution: Mapped[str] = mapped_column(Text, nullable=False)


class ConventionCompatibilityScore(Base, TimestampMixin):
    __tablename__ = "convention_compatibility_scores"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    report_id: Mapped[str] = mapped_column(ForeignKey("dataset_feasibility_reports.id"), nullable=False, index=True)
    site_a: Mapped[str] = mapped_column(ForeignKey("sites.id"), nullable=False)
    site_b: Mapped[str] = mapped_column(ForeignKey("sites.id"), nullable=False)
    pair_score: Mapped[float] = mapped_column(Float, nullable=False)
    fields: Mapped[list] = mapped_column(JSON, nullable=False)
    critical_blockers: Mapped[list] = mapped_column(JSON, default=list)
    formula_version: Mapped[str] = mapped_column(String(30), nullable=False)


class DatasetFeasibilityReport(Base, TimestampMixin):
    __tablename__ = "dataset_feasibility_reports"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    dataset_version: Mapped[str] = mapped_column(String(80), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    site_ids: Mapped[list] = mapped_column(JSON, nullable=False)
    inventory: Mapped[list] = mapped_column(JSON, nullable=False)
    compatibility: Mapped[dict] = mapped_column(JSON, nullable=False)
    qualified_count: Mapped[int] = mapped_column(Integer, nullable=False)
    eligible_count: Mapped[int] = mapped_column(Integer, nullable=False)
    exclusions: Mapped[list] = mapped_column(JSON, default=list)
    kill_worksheet: Mapped[dict] = mapped_column(JSON, nullable=False)
    recommendation: Mapped[dict] = mapped_column(JSON, nullable=False)
    formula_versions: Mapped[dict] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="proposed", nullable=False)
    is_illustrative: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    reviewed_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    review_note: Mapped[str | None] = mapped_column(Text)


class WorkflowComparison(Base, TimestampMixin):
    __tablename__ = "workflow_comparisons"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    case_label: Mapped[str] = mapped_column(String(200), nullable=False)
    tool: Mapped[str] = mapped_column(String(60), nullable=False)
    tool_version: Mapped[str] = mapped_column(String(80), nullable=False)
    operator_label: Mapped[str] = mapped_column(String(200), nullable=False)
    task_definition: Mapped[str] = mapped_column(Text, nullable=False)
    elapsed_seconds: Mapped[float] = mapped_column(Float, nullable=False)
    manual_steps: Mapped[int] = mapped_column(Integer, nullable=False)
    provenance_fields_preserved: Mapped[list] = mapped_column(JSON, default=list)
    provenance_score: Mapped[float] = mapped_column(Float, nullable=False)
    uncertainty_propagation: Mapped[str] = mapped_column(String(20), nullable=False)
    reproducibility_steps: Mapped[int] = mapped_column(Integer, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    evidence_ref: Mapped[str] = mapped_column(Text, nullable=False)
    measured_at: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="recorded", nullable=False)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))


class BehavioralPilot(Base, TimestampMixin):
    __tablename__ = "behavioral_pilots"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    researcher_role: Mapped[str] = mapped_column(String(200), nullable=False)
    consent_recorded: Mapped[bool] = mapped_column(Boolean, nullable=False)
    hypothesis: Mapped[str] = mapped_column(Text, nullable=False)
    hypothesis_source: Mapped[str | None] = mapped_column(Text)
    run_date: Mapped[date] = mapped_column(Date, nullable=False)
    analysis_run_id: Mapped[str | None] = mapped_column(ForeignKey("analysis_runs.id"))
    steps: Mapped[list] = mapped_column(JSON, default=list)
    external_tools: Mapped[list] = mapped_column(JSON, default=list)
    elapsed_minutes: Mapped[float] = mapped_column(Float, nullable=False)
    friction: Mapped[list] = mapped_column(JSON, default=list)
    output_sections_used: Mapped[list] = mapped_column(JSON, default=list)
    limitations_noted: Mapped[str | None] = mapped_column(Text)
    would_return: Mapped[str] = mapped_column(String(20), nullable=False)
    return_reason: Mapped[str | None] = mapped_column(Text)
    citation_commitment: Mapped[str] = mapped_column(String(30), nullable=False)
    citation_venue: Mapped[str | None] = mapped_column(String(300))
    evidence_note: Mapped[str | None] = mapped_column(Text)
    verified_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))


class GateSignoff(Base, TimestampMixin):
    __tablename__ = "gate_signoffs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    gate_key: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    condition_key: Mapped[str] = mapped_column(String(60), nullable=False)
    decision: Mapped[str] = mapped_column(String(20), nullable=False)  # approve | reject
    rationale: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_refs: Mapped[list] = mapped_column(JSON, default=list)
    reviewer_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    entity_type: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    entity_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    actor_label: Mapped[str | None] = mapped_column(String(200))
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    changes: Mapped[dict] = mapped_column(JSON, default=dict)
    note: Mapped[str | None] = mapped_column(Text)
    correlation_id: Mapped[str | None] = mapped_column(String(64))


class GeneratedReport(Base, TimestampMixin):
    __tablename__ = "generated_reports"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    subject_id: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="ready", nullable=False)
    files: Mapped[dict] = mapped_column(JSON, default=dict)  # fmt -> {storage_key, sha256, size}
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    is_illustrative: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    visibility: Mapped[str] = mapped_column(String(20), default="private", nullable=False)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))


class Job(Base, TimestampMixin):
    __tablename__ = "jobs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    idempotency_key: Mapped[str | None] = mapped_column(String(120), unique=True)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="queued", nullable=False, index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    result: Mapped[dict | None] = mapped_column(JSON)
    error: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
