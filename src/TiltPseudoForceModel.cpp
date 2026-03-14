#include "haptics/TiltPseudoForceModel.hpp"

#include <algorithm>
#include <cmath>

namespace haptics {
namespace {

constexpr float kGravityMs2 = 9.80665f;
constexpr float kPi = 3.14159265358979323846f;

float clampf(float value, float lo, float hi) {
  return std::max(lo, std::min(value, hi));
}

float clamp01(float value) {
  return clampf(value, 0.0f, 1.0f);
}

float degToRad(float degrees) {
  return degrees * (kPi / 180.0f);
}

float radToDeg(float radians) {
  return radians * (180.0f / kPi);
}

float lowPassStep(float state, float target, float cutoff_hz, float dt_s) {
  if (cutoff_hz <= 0.0f || dt_s <= 0.0f) {
    return target;
  }
  const float tau_s = 1.0f / (2.0f * kPi * cutoff_hz);
  const float alpha = clampf(dt_s / (tau_s + dt_s), 0.0f, 1.0f);
  return state + alpha * (target - state);
}

float rateLimit(float target, float current, float slew_deg_s, float dt_s) {
  if (slew_deg_s <= 0.0f || dt_s <= 0.0f) {
    return target;
  }
  const float max_step = slew_deg_s * dt_s;
  return clampf(target, current - max_step, current + max_step);
}

}  // namespace

void TiltPseudoForceModel::configure(const SystemParams& params) {
  params_ = params;
}

void TiltPseudoForceModel::reset() {
  g_qs_ms2_ = {};
  a_dyn_ms2_ = {};
  content_cg_m_ = {};
  delta_deg_ = {};
  initialized_ = false;
}

float TiltPseudoForceModel::contentCgScale(MaterialFamily family) const {
  switch (family) {
    case MaterialFamily::Liquid:
      return 1.0f;
    case MaterialFamily::Hybrid:
      return 0.85f;
    case MaterialFamily::Granular:
      return 0.60f;
    case MaterialFamily::Detented:
      return 0.35f;
    case MaterialFamily::Custom:
    default:
      return 0.70f;
  }
}

TiltPlaneCommand TiltPseudoForceModel::update(const ImuSample& sample, const MassState& mass, float dt_s) {
  constexpr float eps = 1.0e-6f;

  TiltPlaneCommand cmd{};
  const float base_thumb_deg = clampf(mass.pos_norm.x, -1.0f, 1.0f) * params_.tilt.max_tilt_deg;
  const float base_index_deg = -clampf(mass.pos_norm.x, -1.0f, 1.0f) * params_.tilt.max_tilt_deg;
  cmd.thumb_base_deg = base_thumb_deg;
  cmd.index_base_deg = base_index_deg;
  cmd.pseudoforce_enabled = params_.tilt.enable_pseudoforce;

  const float content_cg_scale = contentCgScale(mass.family);
  const float content_half_span_x =
      0.5f * params_.container.span_x_m * params_.tilt.content_cg_span_fraction * content_cg_scale;
  const float content_half_span_y =
      0.5f * params_.container.span_y_m * params_.tilt.content_cg_span_fraction * content_cg_scale;
  Vec2f raw_content_cg{};
  raw_content_cg.x = clampf(mass.pos_norm.x, -1.0f, 1.0f) * content_half_span_x;
  raw_content_cg.y = clampf(mass.pos_norm.y, -1.0f, 1.0f) * content_half_span_y;

  if (!initialized_) {
    content_cg_m_ = raw_content_cg;
  } else {
    content_cg_m_.x = lowPassStep(content_cg_m_.x, raw_content_cg.x, params_.tilt.content_cg_cutoff_hz, dt_s);
    content_cg_m_.y = lowPassStep(content_cg_m_.y, raw_content_cg.y, params_.tilt.content_cg_cutoff_hz, dt_s);
  }

  if (sample.valid) {
    Vec2f accel_ms2{};
    accel_ms2.x = sample.accel_g.x * kGravityMs2;
    accel_ms2.y = sample.accel_g.y * kGravityMs2;
    if (!initialized_) {
      g_qs_ms2_ = accel_ms2;
      a_dyn_ms2_ = {};
    } else {
      g_qs_ms2_.x = lowPassStep(g_qs_ms2_.x, accel_ms2.x, params_.tilt.g_qs_cutoff_hz, dt_s);
      g_qs_ms2_.y = lowPassStep(g_qs_ms2_.y, accel_ms2.y, params_.tilt.g_qs_cutoff_hz, dt_s);

      Vec2f dyn_raw{};
      dyn_raw.x = accel_ms2.x - g_qs_ms2_.x;
      dyn_raw.y = accel_ms2.y - g_qs_ms2_.y;
      a_dyn_ms2_.x = lowPassStep(a_dyn_ms2_.x, dyn_raw.x, params_.tilt.a_dyn_cutoff_hz, dt_s);
      a_dyn_ms2_.y = lowPassStep(a_dyn_ms2_.y, dyn_raw.y, params_.tilt.a_dyn_cutoff_hz, dt_s);
    }
  }
  initialized_ = true;

  const float m_shell = std::max(0.0f, params_.container.shell_mass_kg);
  const float m_content_eff = std::max(0.0f, params_.container.content_mass_full_kg) * clamp01(mass.fill);
  const float m_app = m_shell + m_content_eff;

  const float r_cg_x =
      (m_shell * params_.container.shell_cg_x_m + m_content_eff * content_cg_m_.x) / (m_app + eps);
  const float r_cg_y =
      (m_shell * params_.container.shell_cg_y_m + m_content_eff * content_cg_m_.y) / (m_app + eps);

  const float f_app_x = m_app * (g_qs_ms2_.x - a_dyn_ms2_.x);
  const float f_app_y = m_app * (g_qs_ms2_.y - a_dyn_ms2_.y);
  const float tau_z = r_cg_x * f_app_y - r_cg_y * f_app_x;
  const float f_cm = params_.tilt.k_cm * (-m_app * a_dyn_ms2_.y);
  const float t_df = params_.tilt.k_tau * tau_z;

  const float phi_cm_thumb_rad = std::atan(params_.tilt.k_phi * (0.5f * f_cm) / (params_.tilt.Ft_nom_thumb_N + eps));
  const float phi_cm_index_rad = std::atan(params_.tilt.k_phi * (0.5f * f_cm) / (params_.tilt.Ft_nom_index_N + eps));
  const float phi_df_thumb_rad =
      std::atan(params_.tilt.k_phi * (t_df / (params_.tilt.w_eff_m + eps)) / (params_.tilt.Ft_nom_thumb_N + eps));
  const float phi_df_index_rad =
      std::atan(params_.tilt.k_phi * (-t_df / (params_.tilt.w_eff_m + eps)) / (params_.tilt.Ft_nom_index_N + eps));

  const float max_delta_cm_rad = degToRad(params_.tilt.max_delta_cm_deg);
  const float max_delta_df_rad = degToRad(params_.tilt.max_delta_df_deg);
  const float max_delta_total_deg = std::max(0.001f, params_.tilt.max_delta_total_deg);

  const float clamped_cm_thumb_deg =
      radToDeg(clampf(phi_cm_thumb_rad, -max_delta_cm_rad, max_delta_cm_rad));
  const float clamped_cm_index_deg =
      radToDeg(clampf(phi_cm_index_rad, -max_delta_cm_rad, max_delta_cm_rad));
  const float clamped_df_thumb_deg =
      radToDeg(clampf(phi_df_thumb_rad, -max_delta_df_rad, max_delta_df_rad));
  const float clamped_df_index_deg =
      radToDeg(clampf(phi_df_index_rad, -max_delta_df_rad, max_delta_df_rad));

  Vec2f target_delta_deg{};
  target_delta_deg.x = clampf(clamped_cm_thumb_deg + clamped_df_thumb_deg, -max_delta_total_deg, max_delta_total_deg);
  target_delta_deg.y = clampf(clamped_cm_index_deg + clamped_df_index_deg, -max_delta_total_deg, max_delta_total_deg);

  if (!params_.tilt.enable_pseudoforce) {
    target_delta_deg = {};
  }

  const Vec2f previous_delta_deg = delta_deg_;
  delta_deg_.x = lowPassStep(previous_delta_deg.x, target_delta_deg.x, params_.tilt.command_cutoff_hz, dt_s);
  delta_deg_.y = lowPassStep(previous_delta_deg.y, target_delta_deg.y, params_.tilt.command_cutoff_hz, dt_s);
  delta_deg_.x = rateLimit(delta_deg_.x, previous_delta_deg.x, params_.tilt.pseudoforce_slew_deg_s, dt_s);
  delta_deg_.y = rateLimit(delta_deg_.y, previous_delta_deg.y, params_.tilt.pseudoforce_slew_deg_s, dt_s);
  if (std::fabs(delta_deg_.x) < params_.tilt.command_deadband_deg) {
    delta_deg_.x = 0.0f;
  }
  if (std::fabs(delta_deg_.y) < params_.tilt.command_deadband_deg) {
    delta_deg_.y = 0.0f;
  }

  const float thumb_rel_deg = clampf(
      base_thumb_deg + params_.tilt.sign_thumb * delta_deg_.x,
      -params_.tilt.max_total_cmd_deg,
      params_.tilt.max_total_cmd_deg);
  const float index_rel_deg = clampf(
      base_index_deg + params_.tilt.sign_index * delta_deg_.y,
      -params_.tilt.max_total_cmd_deg,
      params_.tilt.max_total_cmd_deg);

  const float delta_norm_thumb = clamp01(std::fabs(delta_deg_.x) / max_delta_total_deg);
  const float delta_norm_index = clamp01(std::fabs(delta_deg_.y) / max_delta_total_deg);
  const float total_norm_thumb =
      clamp01(std::fabs(thumb_rel_deg) / std::max(0.001f, params_.tilt.max_total_cmd_deg));
  const float total_norm_index =
      clamp01(std::fabs(index_rel_deg) / std::max(0.001f, params_.tilt.max_total_cmd_deg));

  const float thumb_effort = clamp01(0.18f + 0.20f * mass.energy + 0.25f * total_norm_thumb + 0.37f * delta_norm_thumb);
  const float index_effort = clamp01(0.18f + 0.20f * mass.energy + 0.25f * total_norm_index + 0.37f * delta_norm_index);

  cmd.thumb_angle_deg = params_.tilt.thumb_home_deg + thumb_rel_deg;
  cmd.index_angle_deg = params_.tilt.index_home_deg + index_rel_deg;
  cmd.thumb_current_limit_ma = params_.tilt.max_current_ma * thumb_effort;
  cmd.index_current_limit_ma = params_.tilt.max_current_ma * index_effort;
  cmd.thumb_delta_deg = delta_deg_.x;
  cmd.index_delta_deg = delta_deg_.y;
  cmd.common_force_n = f_cm;
  cmd.differential_torque_nm = t_df;
  cmd.cg_x_m = r_cg_x;
  cmd.cg_y_m = r_cg_y;
  cmd.apparent_mass_kg = m_app;
  return cmd;
}

}  // namespace haptics
