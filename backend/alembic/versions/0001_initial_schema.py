"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-10-18 06:34:36.151708
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geography

revision: str = '0001'
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.create_table('reference_retrievals',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('provider', sa.String(length=60), nullable=False),
    sa.Column('case_key', sa.String(length=60), nullable=True),
    sa.Column('request_params', sa.JSON(), nullable=False),
    sa.Column('retrieved_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('api_version', sa.String(length=40), nullable=True),
    sa.Column('response_sha256', sa.String(length=64), nullable=False),
    sa.Column('extracted', sa.JSON(), nullable=False),
    sa.Column('attribution', sa.Text(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('users',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('email', sa.String(length=320), nullable=False),
    sa.Column('display_name', sa.String(length=200), nullable=False),
    sa.Column('role', sa.String(length=20), nullable=False),
    sa.Column('password_hash', sa.String(length=400), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('email')
    )
    op.create_table('audit_events',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('entity_type', sa.String(length=60), nullable=False),
    sa.Column('entity_id', sa.String(length=64), nullable=False),
    sa.Column('action', sa.String(length=40), nullable=False),
    sa.Column('actor_id', sa.String(length=36), nullable=True),
    sa.Column('actor_label', sa.String(length=200), nullable=True),
    sa.Column('at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('changes', sa.JSON(), nullable=False),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('correlation_id', sa.String(length=64), nullable=True),
    sa.ForeignKeyConstraint(['actor_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_audit_events_entity_id'), 'audit_events', ['entity_id'], unique=False)
    op.create_index(op.f('ix_audit_events_entity_type'), 'audit_events', ['entity_type'], unique=False)
    op.create_table('benchmark_suites',
    sa.Column('id', sa.String(length=40), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('tolerances', sa.JSON(), nullable=False),
    sa.Column('tolerance_hash', sa.String(length=64), nullable=False),
    sa.Column('frozen_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('frozen_by', sa.String(length=300), nullable=False),
    sa.Column('tolerances_reviewed_by', sa.String(length=36), nullable=True),
    sa.Column('tolerances_reviewed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['tolerances_reviewed_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('dataset_feasibility_reports',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('dataset_version', sa.String(length=80), nullable=False),
    sa.Column('title', sa.String(length=300), nullable=False),
    sa.Column('site_ids', sa.JSON(), nullable=False),
    sa.Column('inventory', sa.JSON(), nullable=False),
    sa.Column('compatibility', sa.JSON(), nullable=False),
    sa.Column('qualified_count', sa.Integer(), nullable=False),
    sa.Column('eligible_count', sa.Integer(), nullable=False),
    sa.Column('exclusions', sa.JSON(), nullable=False),
    sa.Column('kill_worksheet', sa.JSON(), nullable=False),
    sa.Column('recommendation', sa.JSON(), nullable=False),
    sa.Column('formula_versions', sa.JSON(), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('is_illustrative', sa.Boolean(), nullable=False),
    sa.Column('created_by', sa.String(length=36), nullable=True),
    sa.Column('reviewed_by', sa.String(length=36), nullable=True),
    sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('review_note', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['reviewed_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('gate_signoffs',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('gate_key', sa.String(length=40), nullable=False),
    sa.Column('condition_key', sa.String(length=60), nullable=False),
    sa.Column('decision', sa.String(length=20), nullable=False),
    sa.Column('rationale', sa.Text(), nullable=False),
    sa.Column('evidence_refs', sa.JSON(), nullable=False),
    sa.Column('reviewer_id', sa.String(length=36), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['reviewer_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_gate_signoffs_gate_key'), 'gate_signoffs', ['gate_key'], unique=False)
    op.create_table('generated_reports',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('kind', sa.String(length=40), nullable=False),
    sa.Column('subject_id', sa.String(length=64), nullable=False),
    sa.Column('title', sa.String(length=300), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('files', sa.JSON(), nullable=False),
    sa.Column('params', sa.JSON(), nullable=False),
    sa.Column('is_illustrative', sa.Boolean(), nullable=False),
    sa.Column('visibility', sa.String(length=20), nullable=False),
    sa.Column('created_by', sa.String(length=36), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('jobs',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('kind', sa.String(length=40), nullable=False),
    sa.Column('idempotency_key', sa.String(length=120), nullable=True),
    sa.Column('payload', sa.JSON(), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('attempts', sa.Integer(), nullable=False),
    sa.Column('result', sa.JSON(), nullable=True),
    sa.Column('error', sa.Text(), nullable=True),
    sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_by', sa.String(length=36), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('idempotency_key')
    )
    op.create_index(op.f('ix_jobs_status'), 'jobs', ['status'], unique=False)
    op.create_table('sources',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('citation', sa.Text(), nullable=False),
    sa.Column('source_type', sa.String(length=40), nullable=False),
    sa.Column('url', sa.Text(), nullable=True),
    sa.Column('doi', sa.String(length=200), nullable=True),
    sa.Column('publisher', sa.String(length=300), nullable=True),
    sa.Column('accessed_at', sa.Date(), nullable=True),
    sa.Column('licence', sa.String(length=300), nullable=True),
    sa.Column('checksum', sa.String(length=128), nullable=True),
    sa.Column('is_illustrative', sa.Boolean(), nullable=False),
    sa.Column('created_by', sa.String(length=36), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('workflow_comparisons',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('case_label', sa.String(length=200), nullable=False),
    sa.Column('tool', sa.String(length=60), nullable=False),
    sa.Column('tool_version', sa.String(length=80), nullable=False),
    sa.Column('operator_label', sa.String(length=200), nullable=False),
    sa.Column('task_definition', sa.Text(), nullable=False),
    sa.Column('elapsed_seconds', sa.Float(), nullable=False),
    sa.Column('manual_steps', sa.Integer(), nullable=False),
    sa.Column('provenance_fields_preserved', sa.JSON(), nullable=False),
    sa.Column('provenance_score', sa.Float(), nullable=False),
    sa.Column('uncertainty_propagation', sa.String(length=20), nullable=False),
    sa.Column('reproducibility_steps', sa.Integer(), nullable=False),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('evidence_ref', sa.Text(), nullable=False),
    sa.Column('measured_at', sa.Date(), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('created_by', sa.String(length=36), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('benchmark_cases',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('suite_id', sa.String(length=40), nullable=False),
    sa.Column('case_key', sa.String(length=60), nullable=False),
    sa.Column('version', sa.Integer(), nullable=False),
    sa.Column('test_class', sa.String(length=30), nullable=False),
    sa.Column('title', sa.String(length=300), nullable=False),
    sa.Column('critical', sa.Boolean(), nullable=False),
    sa.Column('inputs', sa.JSON(), nullable=False),
    sa.Column('reference_kind', sa.String(length=60), nullable=False),
    sa.Column('independence_note', sa.Text(), nullable=False),
    sa.Column('tolerance_deg', sa.Float(), nullable=True),
    sa.Column('tolerance_rationale', sa.Text(), nullable=False),
    sa.Column('licence_note', sa.Text(), nullable=False),
    sa.Column('input_hash', sa.String(length=64), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['suite_id'], ['benchmark_suites.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('suite_id', 'case_key', 'version')
    )
    op.create_table('benchmark_runs',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('suite_id', sa.String(length=40), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('environment', sa.JSON(), nullable=False),
    sa.Column('summary', sa.JSON(), nullable=False),
    sa.Column('triggered_by', sa.String(length=36), nullable=True),
    sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['suite_id'], ['benchmark_suites.id'], ),
    sa.ForeignKeyConstraint(['triggered_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_geospatial_table('sites',
    sa.Column('id', sa.String(length=64), nullable=False),
    sa.Column('name', sa.String(length=300), nullable=False),
    sa.Column('site_type', sa.String(length=100), nullable=True),
    sa.Column('region', sa.String(length=200), nullable=True),
    sa.Column('country', sa.String(length=100), nullable=True),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('lat', sa.Float(), nullable=True),
    sa.Column('lon', sa.Float(), nullable=True),
    sa.Column('elevation_m', sa.Float(), nullable=True),
    sa.Column('crs', sa.String(length=50), nullable=True),
    sa.Column('geom', Geography(geometry_type='POINT', srid=4326, dimension=2, spatial_index=False, from_text='ST_GeogFromText', name='geography'), nullable=True),
    sa.Column('coordinates_source_id', sa.String(length=36), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('visibility', sa.String(length=20), nullable=False),
    sa.Column('sensitivity', sa.String(length=20), nullable=False),
    sa.Column('is_illustrative', sa.Boolean(), nullable=False),
    sa.Column('stratum', sa.String(length=120), nullable=True),
    sa.Column('created_by', sa.String(length=36), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['coordinates_source_id'], ['sources.id'], ),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_geospatial_index('idx_sites_geom', 'sites', ['geom'], unique=False, postgresql_using='gist', postgresql_ops={})
    op.create_table('analysis_runs',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('site_id', sa.String(length=64), nullable=True),
    sa.Column('kind', sa.String(length=20), nullable=False),
    sa.Column('tier', sa.String(length=40), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('hypothesis', sa.JSON(), nullable=False),
    sa.Column('parameters', sa.JSON(), nullable=False),
    sa.Column('input_snapshot', sa.JSON(), nullable=False),
    sa.Column('input_hash', sa.String(length=64), nullable=False),
    sa.Column('versions', sa.JSON(), nullable=False),
    sa.Column('seed', sa.Integer(), nullable=False),
    sa.Column('parent_run_id', sa.String(length=36), nullable=True),
    sa.Column('review_status', sa.String(length=20), nullable=False),
    sa.Column('reviewed_by', sa.String(length=36), nullable=True),
    sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('review_note', sa.Text(), nullable=True),
    sa.Column('visibility', sa.String(length=20), nullable=False),
    sa.Column('is_illustrative', sa.Boolean(), nullable=False),
    sa.Column('error', sa.JSON(), nullable=True),
    sa.Column('warnings', sa.JSON(), nullable=False),
    sa.Column('created_by', sa.String(length=36), nullable=True),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['parent_run_id'], ['analysis_runs.id'], ),
    sa.ForeignKeyConstraint(['reviewed_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['site_id'], ['sites.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_analysis_runs_input_hash'), 'analysis_runs', ['input_hash'], unique=False)
    op.create_index(op.f('ix_analysis_runs_site_id'), 'analysis_runs', ['site_id'], unique=False)
    op.create_table('benchmark_results',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('run_id', sa.String(length=36), nullable=False),
    sa.Column('case_id', sa.String(length=36), nullable=False),
    sa.Column('status', sa.String(length=10), nullable=False),
    sa.Column('candidate_output', sa.JSON(), nullable=True),
    sa.Column('reference_outputs', sa.JSON(), nullable=True),
    sa.Column('max_abs_difference_deg', sa.Float(), nullable=True),
    sa.Column('tolerance_deg', sa.Float(), nullable=True),
    sa.Column('explanation', sa.Text(), nullable=False),
    sa.Column('reference_metadata', sa.JSON(), nullable=False),
    sa.Column('log', sa.JSON(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['case_id'], ['benchmark_cases.id'], ),
    sa.ForeignKeyConstraint(['run_id'], ['benchmark_runs.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_benchmark_results_run_id'), 'benchmark_results', ['run_id'], unique=False)
    op.create_table('chronology_records',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('site_id', sa.String(length=64), nullable=False),
    sa.Column('start_year', sa.Integer(), nullable=True),
    sa.Column('end_year', sa.Integer(), nullable=True),
    sa.Column('calendar_basis', sa.String(length=40), nullable=True),
    sa.Column('date_basis', sa.String(length=200), nullable=True),
    sa.Column('model', sa.String(length=20), nullable=False),
    sa.Column('central_year', sa.Float(), nullable=True),
    sa.Column('sigma_years', sa.Float(), nullable=True),
    sa.Column('uncertainty_note', sa.Text(), nullable=True),
    sa.Column('source_id', sa.String(length=36), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('is_current', sa.Boolean(), nullable=False),
    sa.Column('created_by', sa.String(length=36), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['site_id'], ['sites.id'], ),
    sa.ForeignKeyConstraint(['source_id'], ['sources.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_chronology_records_site_id'), 'chronology_records', ['site_id'], unique=False)
    op.create_table('convention_compatibility_scores',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('report_id', sa.String(length=36), nullable=False),
    sa.Column('site_a', sa.String(length=64), nullable=False),
    sa.Column('site_b', sa.String(length=64), nullable=False),
    sa.Column('pair_score', sa.Float(), nullable=False),
    sa.Column('fields', sa.JSON(), nullable=False),
    sa.Column('critical_blockers', sa.JSON(), nullable=False),
    sa.Column('formula_version', sa.String(length=30), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['report_id'], ['dataset_feasibility_reports.id'], ),
    sa.ForeignKeyConstraint(['site_a'], ['sites.id'], ),
    sa.ForeignKeyConstraint(['site_b'], ['sites.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_convention_compatibility_scores_report_id'), 'convention_compatibility_scores', ['report_id'], unique=False)
    op.create_table('horizon_profiles',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('site_id', sa.String(length=64), nullable=False),
    sa.Column('kind', sa.String(length=20), nullable=False),
    sa.Column('azimuths_deg', sa.JSON(), nullable=False),
    sa.Column('altitudes_deg', sa.JSON(), nullable=False),
    sa.Column('altitude_uncertainty_deg', sa.Float(), nullable=True),
    sa.Column('resolution_note', sa.Text(), nullable=True),
    sa.Column('observer_height_m', sa.Float(), nullable=True),
    sa.Column('source_id', sa.String(length=36), nullable=True),
    sa.Column('is_current', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['site_id'], ['sites.id'], ),
    sa.ForeignKeyConstraint(['source_id'], ['sources.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_horizon_profiles_site_id'), 'horizon_profiles', ['site_id'], unique=False)
    op.create_table('observations',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('site_id', sa.String(length=64), nullable=False),
    sa.Column('observer_label', sa.String(length=200), nullable=False),
    sa.Column('observed_at', sa.Date(), nullable=True),
    sa.Column('method', sa.String(length=60), nullable=True),
    sa.Column('north_reference', sa.String(length=20), nullable=True),
    sa.Column('readings_deg', sa.JSON(), nullable=False),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('quality_flag', sa.String(length=20), nullable=False),
    sa.Column('visibility', sa.String(length=20), nullable=False),
    sa.Column('created_by', sa.String(length=36), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['site_id'], ['sites.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_observations_site_id'), 'observations', ['site_id'], unique=False)
    op.create_table('orientations',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('site_id', sa.String(length=64), nullable=False),
    sa.Column('label', sa.String(length=300), nullable=False),
    sa.Column('axis_definition', sa.Text(), nullable=True),
    sa.Column('raw_bearing', sa.Float(), nullable=True),
    sa.Column('bearing_unit', sa.String(length=20), nullable=False),
    sa.Column('axis_mode', sa.String(length=20), nullable=True),
    sa.Column('north_reference', sa.String(length=20), nullable=True),
    sa.Column('magnetic_declination_deg', sa.Float(), nullable=True),
    sa.Column('magnetic_declination_uncertainty_deg', sa.Float(), nullable=True),
    sa.Column('magnetic_declination_source', sa.Text(), nullable=True),
    sa.Column('grid_crs', sa.String(length=50), nullable=True),
    sa.Column('method', sa.String(length=60), nullable=True),
    sa.Column('uncertainty_deg', sa.Float(), nullable=True),
    sa.Column('uncertainty_distribution', sa.String(length=30), nullable=False),
    sa.Column('uncertainty_unavailable_reason', sa.Text(), nullable=True),
    sa.Column('measured_at', sa.Date(), nullable=True),
    sa.Column('source_id', sa.String(length=36), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('is_primary', sa.Boolean(), nullable=False),
    sa.Column('is_current', sa.Boolean(), nullable=False),
    sa.Column('created_by', sa.String(length=36), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['site_id'], ['sites.id'], ),
    sa.ForeignKeyConstraint(['source_id'], ['sources.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_orientations_site_id'), 'orientations', ['site_id'], unique=False)
    op.create_table('site_images',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('site_id', sa.String(length=64), nullable=False),
    sa.Column('storage_key', sa.String(length=300), nullable=False),
    sa.Column('content_type', sa.String(length=50), nullable=False),
    sa.Column('size_bytes', sa.Integer(), nullable=False),
    sa.Column('sha256', sa.String(length=64), nullable=False),
    sa.Column('attribution', sa.Text(), nullable=False),
    sa.Column('licence', sa.String(length=300), nullable=False),
    sa.Column('caption', sa.Text(), nullable=True),
    sa.Column('visibility', sa.String(length=20), nullable=False),
    sa.Column('created_by', sa.String(length=36), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['site_id'], ['sites.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_site_images_site_id'), 'site_images', ['site_id'], unique=False)
    op.create_table('site_sources',
    sa.Column('site_id', sa.String(length=64), nullable=False),
    sa.Column('source_id', sa.String(length=36), nullable=False),
    sa.Column('role', sa.String(length=40), nullable=False),
    sa.ForeignKeyConstraint(['site_id'], ['sites.id'], ),
    sa.ForeignKeyConstraint(['source_id'], ['sources.id'], ),
    sa.PrimaryKeyConstraint('site_id', 'source_id', 'role')
    )
    op.create_table('analysis_results',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('run_id', sa.String(length=36), nullable=False),
    sa.Column('kind', sa.String(length=30), nullable=False),
    sa.Column('predicted_azimuth_deg', sa.Float(), nullable=True),
    sa.Column('residual_signed_deg', sa.Float(), nullable=True),
    sa.Column('residual_abs_deg', sa.Float(), nullable=True),
    sa.Column('payload', sa.JSON(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['run_id'], ['analysis_runs.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_analysis_results_run_id'), 'analysis_results', ['run_id'], unique=False)
    op.create_table('behavioral_pilots',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('researcher_role', sa.String(length=200), nullable=False),
    sa.Column('consent_recorded', sa.Boolean(), nullable=False),
    sa.Column('hypothesis', sa.Text(), nullable=False),
    sa.Column('hypothesis_source', sa.Text(), nullable=True),
    sa.Column('run_date', sa.Date(), nullable=False),
    sa.Column('analysis_run_id', sa.String(length=36), nullable=True),
    sa.Column('steps', sa.JSON(), nullable=False),
    sa.Column('external_tools', sa.JSON(), nullable=False),
    sa.Column('elapsed_minutes', sa.Float(), nullable=False),
    sa.Column('friction', sa.JSON(), nullable=False),
    sa.Column('output_sections_used', sa.JSON(), nullable=False),
    sa.Column('limitations_noted', sa.Text(), nullable=True),
    sa.Column('would_return', sa.String(length=20), nullable=False),
    sa.Column('return_reason', sa.Text(), nullable=True),
    sa.Column('citation_commitment', sa.String(length=30), nullable=False),
    sa.Column('citation_venue', sa.String(length=300), nullable=True),
    sa.Column('evidence_note', sa.Text(), nullable=True),
    sa.Column('verified_by', sa.String(length=36), nullable=True),
    sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_by', sa.String(length=36), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['analysis_run_id'], ['analysis_runs.id'], ),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['verified_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('behavioral_pilots')
    op.drop_index(op.f('ix_analysis_results_run_id'), table_name='analysis_results')
    op.drop_table('analysis_results')
    op.drop_table('site_sources')
    op.drop_index(op.f('ix_site_images_site_id'), table_name='site_images')
    op.drop_table('site_images')
    op.drop_index(op.f('ix_orientations_site_id'), table_name='orientations')
    op.drop_table('orientations')
    op.drop_index(op.f('ix_observations_site_id'), table_name='observations')
    op.drop_table('observations')
    op.drop_index(op.f('ix_horizon_profiles_site_id'), table_name='horizon_profiles')
    op.drop_table('horizon_profiles')
    op.drop_index(op.f('ix_convention_compatibility_scores_report_id'), table_name='convention_compatibility_scores')
    op.drop_table('convention_compatibility_scores')
    op.drop_index(op.f('ix_chronology_records_site_id'), table_name='chronology_records')
    op.drop_table('chronology_records')
    op.drop_index(op.f('ix_benchmark_results_run_id'), table_name='benchmark_results')
    op.drop_table('benchmark_results')
    op.drop_index(op.f('ix_analysis_runs_site_id'), table_name='analysis_runs')
    op.drop_index(op.f('ix_analysis_runs_input_hash'), table_name='analysis_runs')
    op.drop_table('analysis_runs')
    op.drop_geospatial_index('idx_sites_geom', table_name='sites', postgresql_using='gist', column_name='geom')
    op.drop_geospatial_table('sites')
    op.drop_table('benchmark_runs')
    op.drop_table('benchmark_cases')
    op.drop_table('workflow_comparisons')
    op.drop_table('sources')
    op.drop_index(op.f('ix_jobs_status'), table_name='jobs')
    op.drop_table('jobs')
    op.drop_table('generated_reports')
    op.drop_index(op.f('ix_gate_signoffs_gate_key'), table_name='gate_signoffs')
    op.drop_table('gate_signoffs')
    op.drop_table('dataset_feasibility_reports')
    op.drop_table('benchmark_suites')
    op.drop_index(op.f('ix_audit_events_entity_type'), table_name='audit_events')
    op.drop_index(op.f('ix_audit_events_entity_id'), table_name='audit_events')
    op.drop_table('audit_events')
    op.drop_table('users')
    op.drop_table('reference_retrievals')
