#include "haptics/PresetStore.hpp"

#include <ArduinoJson.h>
#include <LittleFS.h>

#include <algorithm>
#include <cstring>

namespace haptics {
namespace {

struct BuiltinPreset {
  const char* name;
  MaterialFamily family;
  SystemParams (*factory)();
};

constexpr BuiltinPreset kBuiltinPresets[] = {
    {"liquid_small_box", MaterialFamily::Liquid, &makeDefaultLiquidPreset},
    {"liquid_dense_jar", MaterialFamily::Liquid, &makeDefaultLiquidDenseJarPreset},
    {"liquid_half_tube", MaterialFamily::Liquid, &makeDefaultLiquidHalfTubePreset},
    {"granular_coin_box", MaterialFamily::Granular, &makeDefaultGranularPreset},
    {"granular_sand_box", MaterialFamily::Granular, &makeDefaultGranularSandPreset},
    {"granular_bead_box", MaterialFamily::Granular, &makeDefaultGranularBeadPreset},
    {"hybrid_ice_water", MaterialFamily::Hybrid, &makeDefaultHybridPreset},
    {"detented_custom", MaterialFamily::Detented, &makeDefaultDetentedPreset},
};

MaterialFamily parseFamily(const char* text) {
  if (text == nullptr) {
    return MaterialFamily::Liquid;
  }
  if (std::strcmp(text, "Liquid") == 0) {
    return MaterialFamily::Liquid;
  }
  if (std::strcmp(text, "Granular") == 0) {
    return MaterialFamily::Granular;
  }
  if (std::strcmp(text, "Hybrid") == 0) {
    return MaterialFamily::Hybrid;
  }
  if (std::strcmp(text, "Detented") == 0) {
    return MaterialFamily::Detented;
  }
  return MaterialFamily::Custom;
}

SystemParams makePresetForFamily(MaterialFamily family) {
  switch (family) {
    case MaterialFamily::Granular:
      return makeDefaultGranularPreset();
    case MaterialFamily::Hybrid:
      return makeDefaultHybridPreset();
    case MaterialFamily::Detented:
      return makeDefaultDetentedPreset();
    case MaterialFamily::Liquid:
    case MaterialFamily::Custom:
    default:
      return makeDefaultLiquidPreset();
  }
}

void applyContainer(const JsonObjectConst& object, SystemParams& params) {
  if (object["span_x_m"].is<float>()) {
    params.container.span_x_m = object["span_x_m"].as<float>();
  }
  if (object["span_y_m"].is<float>()) {
    params.container.span_y_m = object["span_y_m"].as<float>();
  }
  if (object["span_z_m"].is<float>()) {
    params.container.span_z_m = object["span_z_m"].as<float>();
  }
  if (object["fill"].is<float>()) {
    params.container.fill = object["fill"].as<float>();
  }
  if (object["headspace"].is<float>()) {
    params.container.headspace = object["headspace"].as<float>();
  }
  if (object["viscosity"].is<float>()) {
    params.container.viscosity = object["viscosity"].as<float>();
  }
  if (object["particle_count"].is<float>()) {
    params.container.particle_count = object["particle_count"].as<float>();
  }
  if (object["particle_hardness"].is<float>()) {
    params.container.particle_hardness = object["particle_hardness"].as<float>();
  }
  if (object["enable_roof_contact"].is<bool>()) {
    params.container.enable_roof_contact = object["enable_roof_contact"].as<bool>();
  }
}

void applyMass(const JsonObjectConst& object, SystemParams& params) {
  if (object["natural_freq_x_hz"].is<float>()) {
    params.mass.natural_freq_x_hz = object["natural_freq_x_hz"].as<float>();
  }
  if (object["natural_freq_y_hz"].is<float>()) {
    params.mass.natural_freq_y_hz = object["natural_freq_y_hz"].as<float>();
  }
  if (object["damping_ratio_x"].is<float>()) {
    params.mass.damping_ratio_x = object["damping_ratio_x"].as<float>();
  }
  if (object["damping_ratio_y"].is<float>()) {
    params.mass.damping_ratio_y = object["damping_ratio_y"].as<float>();
  }
  if (object["energy_decay_s"].is<float>()) {
    params.mass.energy_decay_s = object["energy_decay_s"].as<float>();
  }
}

void applyEvent(const JsonObjectConst& object, SystemParams& params) {
  if (object["wall_threshold"].is<float>()) {
    params.event.wall_threshold = object["wall_threshold"].as<float>();
  }
  if (object["wall_decay_span_m"].is<float>()) {
    params.event.wall_decay_span_m = object["wall_decay_span_m"].as<float>();
  }
  if (object["roll_rate_hz"].is<float>()) {
    params.event.roll_rate_hz = object["roll_rate_hz"].as<float>();
  }
  if (object["impact_rate_hz"].is<float>()) {
    params.event.impact_rate_hz = object["impact_rate_hz"].as<float>();
  }
  if (object["droplet_rate_hz"].is<float>()) {
    params.event.droplet_rate_hz = object["droplet_rate_hz"].as<float>();
  }
  if (object["roof_slap_threshold"].is<float>()) {
    params.event.roof_slap_threshold = object["roof_slap_threshold"].as<float>();
  }
  if (object["scrape_threshold"].is<float>()) {
    params.event.scrape_threshold = object["scrape_threshold"].as<float>();
  }
}

void applyTexture(const JsonObjectConst& object, SystemParams& params) {
  if (object["flow_ripple_soa_ms"].is<float>()) {
    params.texture.flow_ripple_soa_ms = object["flow_ripple_soa_ms"].as<float>();
  }
  if (object["default_high_bias"].is<float>()) {
    params.texture.default_high_bias = object["default_high_bias"].as<float>();
  }
}

void applyResonance(const JsonObjectConst& object, SystemParams& params) {
  if (object["master_gain"].is<float>()) {
    params.resonance.master_gain = object["master_gain"].as<float>();
  }
}

void applySpatial(const JsonObjectConst& object, SystemParams& params) {
  if (object["wall_softmax_delta"].is<float>()) {
    params.spatial.wall_softmax_delta = object["wall_softmax_delta"].as<float>();
  }
  if (object["neighbor_bleed"].is<float>()) {
    params.spatial.neighbor_bleed = object["neighbor_bleed"].as<float>();
  }
  if (object["opposite_bleed"].is<float>()) {
    params.spatial.opposite_bleed = object["opposite_bleed"].as<float>();
  }
}

bool containsName(const PresetList<16>& list, const char* name) {
  for (std::size_t i = 0; i < list.count; ++i) {
    if (std::strcmp(list.items[i].name, name) == 0) {
      return true;
    }
  }
  return false;
}

}  // namespace

bool PresetStore::begin() {
  mounted_ = mountFilesystem();
  return true;
}

PresetList<16> PresetStore::listPresets() const {
  PresetList<16> list{};
  for (const auto& preset : kBuiltinPresets) {
    if (list.count >= list.items.size()) {
      break;
    }
    std::strncpy(list.items[list.count].name, preset.name, sizeof(list.items[list.count].name) - 1);
    list.items[list.count].family = preset.family;
    list.items[list.count].from_filesystem = false;
    ++list.count;
  }

  if (!mountFilesystem()) {
    return list;
  }

  File dir = LittleFS.open("/presets");
  if (!dir || !dir.isDirectory()) {
    return list;
  }

  File file = dir.openNextFile();
  while (file && list.count < list.items.size()) {
    const String file_name = file.name();
    if (!file.isDirectory() && file_name.endsWith(".json")) {
      String short_name = file_name;
      const int slash = short_name.lastIndexOf('/');
      if (slash >= 0) {
        short_name = short_name.substring(slash + 1);
      }
      short_name.replace(".json", "");
      if (!containsName(list, short_name.c_str())) {
        std::strncpy(list.items[list.count].name, short_name.c_str(), sizeof(list.items[list.count].name) - 1);
        list.items[list.count].family = MaterialFamily::Custom;
        list.items[list.count].from_filesystem = true;
        ++list.count;
      }
    }
    file = dir.openNextFile();
  }
  return list;
}

bool PresetStore::loadPreset(const char* name, SystemParams& params) const {
  if (name == nullptr || name[0] == '\0') {
    return false;
  }

  const bool has_builtin = loadBuiltin(name, params);
  const bool has_override = applyFilesystemOverride(name, params);
  if (!has_builtin && !has_override) {
    return false;
  }

  std::strncpy(params.preset_name, name, sizeof(params.preset_name) - 1);
  if (has_override) {
    std::strncpy(params.preset_source, "filesystem", sizeof(params.preset_source) - 1);
    std::snprintf(params.preset_path, sizeof(params.preset_path), "/presets/%s.json", name);
  } else {
    std::strncpy(params.preset_source, "builtin", sizeof(params.preset_source) - 1);
    params.preset_path[0] = '\0';
  }
  return true;
}

bool PresetStore::loadBuiltin(const char* name, SystemParams& params) const {
  for (const auto& preset : kBuiltinPresets) {
    if (std::strcmp(preset.name, name) == 0) {
      params = preset.factory();
      return true;
    }
  }
  return false;
}

bool PresetStore::applyFilesystemOverride(const char* name, SystemParams& params) const {
  if (!mountFilesystem()) {
    return false;
  }

  char path[96]{};
  std::snprintf(path, sizeof(path), "/presets/%s.json", name);
  if (!LittleFS.exists(path)) {
    return false;
  }

  File file = LittleFS.open(path, "r");
  if (!file) {
    return false;
  }

  StaticJsonDocument<4096> doc;
  const DeserializationError error = deserializeJson(doc, file);
  file.close();
  if (error) {
    return false;
  }

  const JsonObjectConst root = doc.as<JsonObjectConst>();
  if (root["family"].is<const char*>()) {
    const MaterialFamily family = parseFamily(root["family"].as<const char*>());
    if (std::strcmp(params.preset_name, name) != 0) {
      params = makePresetForFamily(family);
    }
    params.container.family = family;
  }

  if (root["container"].is<JsonObjectConst>()) {
    applyContainer(root["container"].as<JsonObjectConst>(), params);
  }
  if (root["mass"].is<JsonObjectConst>()) {
    applyMass(root["mass"].as<JsonObjectConst>(), params);
  }
  if (root["event"].is<JsonObjectConst>()) {
    applyEvent(root["event"].as<JsonObjectConst>(), params);
  }
  if (root["texture"].is<JsonObjectConst>()) {
    applyTexture(root["texture"].as<JsonObjectConst>(), params);
  }
  if (root["resonance"].is<JsonObjectConst>()) {
    applyResonance(root["resonance"].as<JsonObjectConst>(), params);
  }
  if (root["spatial"].is<JsonObjectConst>()) {
    applySpatial(root["spatial"].as<JsonObjectConst>(), params);
  }
  return true;
}

bool PresetStore::mountFilesystem() const {
  if (!mounted_) {
    mounted_ = LittleFS.begin(false);
  }
  return mounted_;
}

}  // namespace haptics
