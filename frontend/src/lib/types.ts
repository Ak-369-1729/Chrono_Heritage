/* Shapes returned by the v2 API (subset used by the web client). */

export type Role = "viewer" | "researcher" | "steward" | "reviewer" | "admin";
export type RequestableRole = "steward" | "reviewer";
export interface RoleRequest {
  id: string;
  requested_role: RequestableRole;
  status: "pending" | "approved" | "declined" | "withdrawn";
  statement: string | null;
  created_at: string;
  decided_at: string | null;
  decision_note: string | null;
}
export interface Preferences { motion?: "system" | "reduced" | "full"; landing?: "auto" | "3d" | "layers" | "static"; density?: "comfortable" | "compact" }
export interface User {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  status?: "active" | "pending_activation" | "suspended";
  is_active?: boolean;
  affiliation?: string | null;
  preferences?: Preferences;
  registered_via?: string;
  created_at?: string | null;
  last_login_at?: string | null;
  capabilities?: string[];
  pending_role_request?: RoleRequest | null;
}
export interface RoleInfo { key: "researcher" | RequestableRole; label: string; summary: string; can: string[]; requires_approval: boolean }
export interface RegistrationInfo { mode: "open" | "approval" | "closed"; open: boolean; requires_activation: boolean; password_min_length: number; roles: RoleInfo[]; note: string }
export interface SitePermissions { can_edit: boolean; can_archive: boolean; can_publish: boolean; can_review: boolean; is_owner: boolean; illustrative_locked: boolean }

export interface Eligibility {
  single_site_analysis: { eligible: boolean; reasons: string[] };
  cross_site_pooling: { eligible: boolean; reasons: string[] };
  phase0_qualified: boolean;
}

export interface SiteSummary {
  id: string;
  name: string;
  site_type: string | null;
  region: string | null;
  country: string | null;
  lat: number | null;
  lon: number | null;
  generalized: boolean;
  elevation_m: number | null;
  status: string;
  visibility: string;
  is_illustrative: boolean;
  sensitivity: string;
  stratum: string | null;
  provenance_score: number;
  critical_missing: string[];
  fully_qualified: boolean;
  orientation: null | {
    raw_bearing: number | null;
    bearing_unit: string;
    axis_mode: string | null;
    north_reference: string | null;
    uncertainty_deg: number | null;
    true_azimuth_deg: number | null;
    conversion_status: string | null;
  };
  chronology: null | { start_year: number | null; end_year: number | null; date_basis: string | null };
  horizon_kind: string | null;
  eligibility: Eligibility;
  updated_at: string | null;
}

export interface Source {
  id: string;
  citation: string;
  source_type: string;
  url: string | null;
  doi: string | null;
  publisher: string | null;
  accessed_at: string | null;
  licence: string | null;
  checksum: string | null;
  is_illustrative: boolean;
  roles?: string[];
}

export interface ProvenanceField { field: string; label: string; weight: number; critical: boolean; present: boolean; note: string }
export interface Provenance {
  score: number;
  formula_version: string;
  present: string[];
  missing: { field: string; label: string; critical: boolean }[];
  critical_missing: string[];
  fully_qualified: boolean;
  detail: ProvenanceField[];
  disclaimer: string;
}

export interface OrientationRecord {
  id: string; label: string; axis_definition: string | null; raw_bearing: number | null; bearing_unit: string;
  axis_mode: string | null; north_reference: string | null; magnetic_declination_deg: number | null;
  magnetic_declination_uncertainty_deg: number | null; magnetic_declination_source: string | null;
  grid_crs: string | null; method: string | null; uncertainty_deg: number | null; uncertainty_distribution: string;
  uncertainty_unavailable_reason: string | null; measured_at: string | null; source_id: string | null;
  status: string; is_primary: boolean; created_at: string;
}
export interface ChronologyRecord {
  id: string; start_year: number | null; end_year: number | null; calendar_basis: string | null;
  date_basis: string | null; model: string; central_year: number | null; sigma_years: number | null;
  uncertainty_note: string | null; source_id: string | null; status: string; created_at: string;
}
export interface HorizonRecord {
  id: string; kind: string; altitude_uncertainty_deg: number | null; resolution_note: string | null;
  observer_height_m: number | null; source_id: string | null; n_samples: number;
  azimuths_deg?: number[]; altitudes_deg?: number[];
}
export interface Transformation {
  status: string; true_azimuth_deg: number | null; combined_uncertainty_deg: number | null;
  steps: { op: string; [k: string]: unknown }[]; blocking_reasons: string[];
}

export interface SiteDetail extends SiteSummary {
  description: string | null;
  crs: string | null;
  coordinates_source_id: string | null;
  created_at: string;
  archived_at: string | null;
  permissions?: SitePermissions;
  provenance: Provenance;
  orientation_record: OrientationRecord | null;
  orientation_transformation: Transformation | null;
  orientation_history: OrientationRecord[];
  chronology_record: ChronologyRecord | null;
  chronology_history: ChronologyRecord[];
  horizon: HorizonRecord | null;
  sources: Source[];
}

export interface AuditEvent { id: string; action: string; actor: string; at: string; changes: Record<string, unknown>; note: string | null }

export interface Target {
  key: string; label: string; body: string; kind: string; phenomenon: string; supported: boolean; note: string;
  benchmark_classes: string[];
}

export interface Warning { code: string; severity: "critical" | "warning" | "info"; message: string }

export interface Summ { median: number; mean: number; sd: number; q025: number; q16: number; q84: number; q975: number }

export interface AnalysisResultPayload {
  tier: string;
  caveat: string;
  status_labels: { evidence: string; inputs_review: string; validation: string; human_review: string };
  target: Target;
  observed: { raw_bearing: number; raw_unit: string; raw_north_reference: string; true_azimuth_deg: number;
    combined_uncertainty_deg: number | null; axis_mode: string; transformation_steps: { op: string; [k: string]: unknown }[] };
  chronology: { start_year: number; end_year: number; model: string; label: string };
  horizon: { kind: string; n_samples: number; coverage_deg: [number, number] | null; altitude_uncertainty_deg: number | null; source_label: string | null };
  atmosphere: { model: string; pressure_hpa: number; temperature_c: number };
  limb: string;
  prediction_grid: { years: number[]; azimuths_deg: number[]; max_interpolation_error_deg: number; horizon_sensitivity_deg_per_deg: number | null };
  range_bounds: { label: string; year: number; predicted_azimuth_deg: number; residual_signed_deg: number; compared_bearing_deg: number;
    event: Record<string, unknown> & { horizon_altitude_deg: number; refraction_at_horizon_deg: number; declination_deg: number; calendar_strings: Record<string, string> } }[];
  monte_carlo: {
    algorithm_version: string; rng: string; numpy_version: string; seed: number; n_samples: number;
    components_propagated: string[]; components_unavailable: string[];
    predicted_azimuth: Summ; residual_signed: Summ; residual_abs: Summ;
    within_window: Record<string, number>; within_window_note: string;
    histogram: { counts: number[]; edges: number[] }; straddles_cut: boolean;
  };
  sensitivity: { parameter: string; value: string; predicted_azimuth_deg?: number; residual_signed_deg?: number; delta_vs_baseline_deg?: number; error?: string }[];
  assumed_sigma_sweep: { assumed_sigma_deg: number; residual_abs_median: number; residual_signed_q025: number; residual_signed_q975: number; label: string }[] | null;
  statistics: { p_value: null; reason: string };
  day_path: { tt_jd: number; alt_deg: number; apparent_alt_deg: number; az_deg: number }[];
}

export interface AnalysisRun {
  id: string; site_id: string | null; kind: string; tier: string;
  status: "queued" | "running" | "succeeded" | "failed" | "blocked";
  hypothesis: { target_key: string; statement: string; mode: string; rationale?: string | null; registered_at: string };
  parameters: Record<string, unknown> & { seed: number; n_samples: number; horizon_mode: string; limb: string; windows_deg: number[] };
  input_hash: string; versions: Record<string, string>; seed: number; parent_run_id: string | null;
  review_status: string; review_note: string | null; reviewed_at: string | null; visibility: string;
  is_illustrative: boolean; error: { code: string; message: string } | null; warnings: Warning[];
  created_at: string; completed_at: string | null; site_name: string | null;
  summary: null | { predicted_azimuth_median_deg: number | null; residual_signed_median_deg: number | null; residual_abs_median_deg: number | null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- snapshot is an open JSON document
  input_snapshot?: Record<string, any>;
  result?: AnalysisResultPayload | null;
}

export interface GateCondition { key: string; label: string; met: boolean | null; detail: string }
export interface Gate {
  key: string; title: string; status: "passed" | "failed" | "pending" | "not_evaluated" | "omitted";
  conditions: GateCondition[]; fail_action: string; kill_criterion: string | null; gates_version: string;
  evidence?: Record<string, unknown>;
}
export type Gates = Record<"phase0" | "phase0_5" | "differentiation" | "behavioral" | "cross_site" | "ml", Gate>;

export interface CompatField { field: string; status: "matched" | "convertible" | "uncertain" | "incompatible"; reason: string; critical: boolean }
export interface CompatPair { a: string; b: string; a_label: string; b_label: string; score: number; fields: CompatField[]; critical_blockers: string[] }
export interface Compatibility {
  formula_version: string; threshold: number; dataset_score: number | null; pairs: CompatPair[];
  critical_blockers: string[]; pooling_allowed: boolean; n_records: number;
}

export interface InventoryRow {
  site_id: string; name: string; site_type: string | null; region: string | null; is_illustrative: boolean; status: string;
  sources: (Source & { role: string })[];
  orientation: { raw_bearing: number | null; bearing_unit: string | null; axis_mode: string | null; axis_definition: string | null;
    north_reference: string | null; method: string | null; uncertainty_deg: number | null; uncertainty_unavailable_reason: string | null };
  chronology: { start_year: number | null; end_year: number | null; calendar_basis: string | null; date_basis: string | null; uncertainty_note: string | null };
  transformation: Transformation | null;
  provenance: Provenance;
  eligibility: Eligibility;
}

export interface FeasibilityReport {
  id: string; title: string; dataset_version: string; created_at: string; status: string; is_illustrative: boolean;
  site_ids: string[]; qualified_count: number; eligible_count: number; inventory_count: number;
  compatibility_score: number | null; pooling_allowed: boolean; critical_blockers: string[];
  recommendation: { decision: string; label: string; rationale: string; mechanics_output_if_real?: string };
  reviewed_at: string | null; review_note: string | null;
  inventory?: InventoryRow[]; compatibility?: Compatibility; exclusions?: { site_id: string; name: string; reasons: string[] }[];
  kill_worksheet?: Record<string, { criterion: string; record?: string; rule?: string; outcome?: string; note?: string }>;
  formula_versions?: Record<string, unknown>;
}

export interface BenchmarkCaseResult {
  case_key: string; title: string; test_class: string; critical: boolean; status: "pass" | "fail" | "blocked";
  candidate_output: Record<string, unknown> | null; reference_outputs: Record<string, unknown> | null;
  max_abs_difference_deg: number | null; tolerance_deg: number | null; tolerance_rationale: string; explanation: string;
  reference_kind: string; independence_note: string; licence_note: string; reference_metadata: Record<string, unknown>;
  log: string[]; inputs: Record<string, unknown>; input_hash: string;
}
export interface BenchmarkRun {
  id: string; suite_id: string; status: string; created_at: string; finished_at: string | null;
  summary: { classes: Record<string, { pass: number; fail: number; blocked: number }>; required_classes: string[]; tolerance_hash: string; started_at?: string; finished_at?: string };
  environment: { python?: string; platform?: string; packages?: Record<string, string | null>; requirements_lock_sha256?: string | null; git_sha?: string | null };
  results?: BenchmarkCaseResult[];
  gate?: Gate;
}

export interface Comparison {
  id: string; case_label: string; tool: string; tool_version: string; operator_label: string; task_definition: string;
  elapsed_seconds: number; manual_steps: number; provenance_fields_preserved: string[]; provenance_score: number;
  uncertainty_propagation: string; reproducibility_steps: number; notes: string | null; evidence_ref: string;
  measured_at: string; status: string; created_at: string;
}

export interface ReportRow {
  id: string; kind: string; subject_id: string; title: string; status: string; is_illustrative: boolean; created_at: string;
  files: Record<string, { sha256: string; size: number; url: string }>;
}

export interface SkyEvent {
  year: number | null; target: string; azimuth_deg: number; event_tt_jd: number; event_ut1_jd: number;
  reference_instant_tt_jd: number | null; declination_deg: number; target_centre_altitude_deg: number;
  horizon_altitude_deg: number; refraction_at_horizon_deg: number; semidiameter_deg: number; distance_au: number;
  delta_t_seconds: number; calendar_strings: Record<string, string>; warnings: string[];
}
export interface SkyResult {
  label: string; target: Target; site: { id: string; name: string; is_illustrative: boolean } | null;
  location: { lat: number; lon: number; elevation_m: number }; inputs_provenance: Record<string, string>;
  events: SkyEvent[];
  orientation: (Transformation & { source: string; axis_mode: string | null }) | null;
  comparison: null | { observed_true_azimuth_deg: number; axis_mode: string; sigma_deg: number | null;
    rows: { year: number | null; label: string | null; predicted_azimuth_deg: number; residual_signed_deg: number; compared_bearing_deg: number }[];
    residual_span_deg: [number, number]; approx_envelope_2sigma_deg: [number, number] | null; envelope_note: string };
  reference_check: null | { year?: number; candidate_deg?: number; path_a_astropy_deg?: number; path_b_laskar_deg?: number; max_abs_difference_deg?: number; error?: string };
  horizon: { kind: string; source_label: string | null; azimuths_deg: number[]; altitudes_deg: number[] };
  atmosphere: { model: string; pressure_hpa: number; temperature_c: number }; limb: string;
  day_path: { tt_jd: number; alt_deg: number; apparent_alt_deg: number; az_deg: number }[];
  versions: Record<string, string>; warnings: Warning[];
}
