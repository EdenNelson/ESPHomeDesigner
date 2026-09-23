# Plan: Standardize Device Profiles and Move Hardware to ESPHome Packages

Status: **Draft for discussion**. It is linked from the upstream discussion thread. PR 1 is implemented on branch `standardize-component-ids`.

## Goal

Replace the two separate ways devices are defined today with one standard setup: shared hardware defined once, using ESPHome [`packages:`](https://esphome.io/components/packages/), with stable component IDs and consistent names. This should:

- reduce duplicated hardware YAML across the board recipes,
- give every board the same component IDs, so the Designer's generated code and widgets work on all boards,
- make adding a new board mostly a matter of writing a standard ESPHome YAML file.

## Current state (as of v1.0.0 RC45)

There are two separate ways to define a device:

| | JS profiles | YAML recipes |
|---|---|---|
| Where | `frontend/js/io/devices.js`, `DEVICE_PROFILES` (29 entries) | `frontend/hardware/*.yaml` (25 files) |
| How YAML is produced | `hardware_generators*.js` build the sections from pins/features | The recipe text is fetched, placeholders are replaced, system keys are commented out, and sections are merged (`package_processor.js`, `yaml_merger.js`) |
| Count | 14 pure-JS, 15 point at a recipe | 12 recipes have no JS profile at all (backend/bundle only) |

The codebase already uses the word "package" (`isPackageBased`, `hardwarePackage`, `/hardware/package`), but it means "a recipe file whose text is spliced into the output". Nothing emits or resolves real ESPHome `packages:`, `!include` or `github://`.

### Problems found

**Inconsistent component IDs, which cause bugs today**

| Component | Names in use (recipe count) | Hardcoded by the Designer | Effect |
|---|---|---|---|
| Display | `my_display` (22), `main_display` (3); JS e-paper uses `epaper_display` | `online_image` plugin hardcodes `my_display`/`epaper_display` | Online image breaks on `main_display` boards |
| Touchscreen | `my_touchscreen` (17), `device_touchscreen` (4) | `yaml_merger.js:204` matches only `my_touchscreen` | The rotation/touch transform fix is skipped on P4 boards and reTerminal Sticky |
| I2C bus | `bus_a` (14), `i2c_bus` (3), `i2c_system`/`i2c_sensors`/`i2c_touch`/`bsp_bus`, 3 with no ID | Sensor plugins and the SHT/AXP generators use `bus_a` | On-device sensors break on P4 / Tab5 |
| Backlight light | `display_backlight` (19), `backlight` (2), `back_light` (2) | 4 call sites hardcode `display_backlight` | Dim-after-timeout and wake-on-touch break on elecrow-p4, waveshare-round, geekmagic-mini and sensecap |
| Backlight output | `gpio_backlight_pwm` (14), `backlight_pwm` (5), others | `yaml_generator_scripts.js` uses `id(backlight_pwm)`, which the JS generators never emit | Backlight scripts are wrong on some boards |
| SPI bus | 8 different names (2 recipes with none); JS profiles emit `spi_bus` | — | No consistent way to reference it |

**Other defects found along the way**

- `waveshare-esp32-s3-touch-round-lcd-1.28.yaml` is the only recipe using `substitutions:`. The Designer comments that block out but leaves the `$var` references in place, so the output does not compile.
- Flow-style one-line top-level sections (`esphome: {...}` in geekmagic-mini, `psram: {...}` in m5stack-tab5) are not detected, so they are never commented out or merged.
- The backend keeps the filename's case when building device IDs (`sunton_esp32_2432s028R`), but the bundled/offline loader lowercases them (`sunton_esp32_2432s028r`). A saved layout may not find its device in the other mode.
- The recipe header `# TARGET DEVICE:` quietly overrides the JS `name` at runtime, and the two often disagree.

**Inconsistent names**

- Vendor spelling varies: "Seeedstudio"/"Seeed Studio"/"Seeed", "Lilygo"/"LilyGo", "M5Paper" vs "M5Stack …".
- Model casing varies (`jc4827w543` vs `JC8048W550`), and the format varies (size and resolution sometimes present, sometimes not).
- Device IDs/filenames are inconsistent: `reterminal_e1001` vs `seeedstudio_reterminal_d1001`; `esp32_s3_photopainter` has no vendor; `guition-esp32-jc8048w535.yaml` is actually the JC4832W535 board (the code works around it with a legacy alias profile); `guition-esp32-s3-4848s040` is actually the JC4848S040.
- There are duplicate profiles: `reterminal_sticky` and `seeedstudio_reterminal_sticky`.

**Duplicated hardware YAML**

- The octal PSRAM block is identical in 14 recipes, the hex PSRAM block in the 3 P4 recipes, and `preferences:` in 17.
- The touchscreen `on_release` wake block is copied into 17 recipes.
- These pairs are near-identical: sunton 2432s028/028R, guition P4 jc4880p443/jc8012p4a1c, waveshare lcd-4.3/lcd-7, sunton 8048s050/070.
- On the JS side, reTerminal E1001–E1004 repeat the same pins and battery calibration, and so do the two Pico W profiles.

### The main technical obstacle for packages

The Designer customizes recipes by editing their text with regexes: rotation, touch transform, LVGL stripping, the wake block and display lambda injection all work this way. This requires `display:`/`touchscreen:` to be written directly in the recipe file. Once hardware moves into a package, these edits cannot reach it.

ESPHome's built-in tool for this is `!extend <id>`, which modifies a list item that a package defines, identified by its ID:

```yaml
packages:
  board: !include packages/boards/sunton-esp32-8048s050.yaml

display:
  - id: !extend my_display
    rotation: 90
    lambda: |-
      // Designer-generated drawing code
```

`!extend` only works if every board uses the same IDs. **That is why standardizing IDs must come first.**

## Decisions

1. **Deliver as a series of small PRs**, not one large change.
2. **The first PR is useful by itself.** It fixes real bugs even if the maintainer declines the move to packages.
3. **Component IDs use the name most often used today.** Making them more descriptive can happen in a later, separate refactor.
4. **Vendor names use each manufacturer's official spelling** (table below).
5. **Standardize IDs and names before packages.** Once packages exist, filenames become package paths and possibly public `github://` URLs, so renaming before then is far cheaper than after.

### Standard component IDs (most-used names)

| Component | Standard ID | Changes needed |
|---|---|---|
| Display | `my_display` | 3 P4/D1001 recipes (`main_display`); JS e-paper default (`epaper_display`), which changes the E1001 output snapshot |
| Touchscreen | `my_touchscreen` | 4 recipes (`device_touchscreen`) |
| Primary I2C bus | `bus_a` (a second bus is `bus_b`, matching ESPHome's own docs) | 3 `i2c_bus`, `bsp_bus`, the reTerminal Sticky/D1001 multi-bus recipes, and 3 recipes with no ID |
| Primary SPI bus | `spi_bus` (the JS generator default; no recipe name is used more than 3 times) | Recipes with a single SPI bus. Boards with more than one SPI bus keep role-based names for the extra buses for now |
| Backlight light | `display_backlight` | 4 recipes |
| Backlight output | `gpio_backlight_pwm` | 5 `backlight_pwm` + misc; fix `yaml_generator_scripts.js` to drive the light, not the output |
| Battery | `battery_voltage`, `battery_level` | Already consistent |
| Buttons | `button_left`, `button_right`, `button_refresh`, `button_enter`, `button_home` | Sticky uses `button_up`/`_down`/`_ok` (different hardware; review case by case) |
| Time | `ha_time` | Already consistent |

### Vendor names

| Display name | ID/file slug |
|---|---|
| Seeed Studio | `seeedstudio` |
| LILYGO | `lilygo` |
| Waveshare | `waveshare` |
| M5Stack | `m5stack` |
| Guition | `guition` |
| Elecrow | `elecrow` |
| Sunton | `sunton` |
| GeekMagic | `geekmagic` |
| TRMNL | `trmnl` |
| Raspberry Pi | `raspberrypi` |
| *To confirm:* ViewDisplay vs VIEWE (UEDX48480021 knob display) | tbd |

Display-name format: `<Vendor> <Product> <Model> <size>" <WxH> (<variant>)`, e.g. `Sunton ESP32-8048S050 5.0" 800x480`. Profiles also get separate `vendor` and `model` fields so the device picker can group boards by manufacturer.

## PR series

### PR 1: Standardize component IDs (done: branch `standardize-component-ids`)

Changes nothing that users have saved. Fixes the bugs listed above. Drafts of the upstream issue and PR description are in `docs/drafts/`.

Done, as five commits:

1. Extend `js/io/display_ids.js` into an ID lookup for every standard ID (display, touch, I2C, SPI, backlight light/output). No output change.
2. Replace the hardcoded IDs in the generators, `yaml_merger.js`, scripts, LVGL export and feature plugins with calls to it. Also:
   - the scripts drive the backlight light instead of the undefined `backlight_pwm`,
   - the custom recipe builder emits standard IDs.
3. Rename the IDs in 19 recipes and remove the `devices.js` overrides this makes redundant. Also:
   - Recipe-backed profiles default to `my_display`, and the backend and offline parser report the recipe's display ID.
   - The Guition P4 ×2, D1001 and Sticky set `skipTouchTransformOverride`, so their tuned touch config is unchanged.
   - Document the IDs in `hardware_recipes_guide.md`.
4. Conformance test `tests/io/hardware_recipe_ids.test.js` (fails 49 of its 153 checks against the old recipes).
5. Rebuilt `dist/`, which CI's freshness check requires.
6. One line in `.github/copilot-instructions.md` pointing agent tooling at the ID convention and the conformance test.

Validated with `esphome config` (2026.9.0) on every recipe, `main` vs branch, using `docs/drafts/validate_recipes.py`. Results: 7 boards go from FAIL to PASS, 3 pass on both, and 0 go from PASS to FAIL. Missing-ID errors: 9 boards on `main`, 0 on the branch.

Multi-bus rule: I2C buses are `bus_a`, `bus_b`, … in declaration order. The first SPI bus is `spi_bus`, and extra SPI buses keep role-based names.

Moved out of PR 1 to keep it focused:

- **Display names (PR 1b):** the vendor table and format above, one source for the name, and `vendor`/`model` fields.
- **Small fixes PR:**
  - device-ID case normalization in the backend,
  - the waveshare-round `substitutions:` bug,
  - flow-style top-level sections,
  - the `shtcx` indentation in the on-device sensor plugins,
  - the never-defined `USE_BACKLIGHT` guard.
- **E-paper `epaper_display` → `my_display`:** waits for the maintainer's answer (open question 3).
- **Older recipe bugs found by `esphome config`:**
  - LVGL mode keeps a recipe's own display `rotation:`, which ESPHome 2026.4+ rejects (4 boards).
  - `mipi_rgb` now requires `model:` (6 boards).
  - Guition JC4848S040: `on_release` is indented under `transform:`.
  - M5Stack Tab5: `mipi_dsi` requires `esp_ldo`.
  - LILYGO T-Display S3: the `i80` component no longer exists.
  - Waveshare e-Paper 7.5": the project name needs a `namespace.name` form.

### PR 2: Normalize device IDs and recipe filenames

- Convention: `<vendor>_<product>_<model>` for IDs, and the same with `-` for recipe filenames.
- Rename recipes and profile keys: fix the wrong JC4832W535 filename, give the reTerminal E100x profiles the `seeedstudio_` prefix, remove the duplicate Sticky profile, and so on.
- Add an `old → new` device ID alias map applied wherever a saved device ID is read: the project store, JSON import, `models.py` defaults and the layout manager. Remove the existing one-off legacy alias profile.
- File renames go in their own commit with no content changes, so git detects them as renames.
- Tests confirm that every old ID still resolves to the right profile.

### PR 3: Shared package library (output unchanged)

- Add `packages/common/` fragments, for example `psram-octal.yaml`, `psram-hex.yaml`, `esp32s3-idf-psram.yaml`, `p4-ldo-hosted.yaml`, `backlight-ledc.yaml` and `touch-wake.yaml`.
- Add `packages/boards/<device>.yaml` for each board, built from those fragments, with `vars:` for pins.
- The Designer resolves `packages:`/`!include` itself (frontend loader and backend), so the generated YAML is **unchanged** and the existing tests prove it.
- The backend needs to serve files from subdirectories (`_resolve_hardware_package_path` currently rejects them).
- Add a CI job that runs `esphome config` on every board package. Nothing validates the recipes today.

### PR 4: Replace the regex text edits with `!extend`

- Rotation, touch transform, lambda injection, LVGL adjustments and the wake block become generated `!extend` blocks that target the standard IDs.
- `applyPackageOverrides` and most of the placeholder handling are no longer needed.

### PR 5: Opt-in `packages:` output mode

- The generated YAML contains a `packages:` block (remote `github://…@<release-tag>` or local `!include`) plus only the app-level configuration.
- The default stays the expanded (inline) output until the maintainer decides otherwise.
- Remote paths need a stability promise, and every reference must be pinned to a release tag.

### PR 6+: Move the JS-only profiles onto packages

- reTerminal E1001–E1004, TRMNL, M5Stack Paper/CoreInk/PaperMono, the Picos, PhotoPainter and LILYGO T5.
- This is the riskiest step. The JS generators hold device-specific logic, and the only test that locks a device's full YAML output is the E1001 snapshot. Add more output snapshots before migrating.
- Each file has a coverage minimum in `scripts/baselines.json` that moved or new files must also meet.

## Open questions

1. **End goal for the maintainer:** should the Designer eventually output remote `packages:` (PR 5), or is cleaning up the internals (PRs 1–4) enough? This sets how stable the filenames from PR 2 must be.
2. **ViewDisplay vs VIEWE**: confirm the brand name.
3. **Single display ID for e-paper:** the plan moves e-paper from `epaper_display` to `my_display`, the most-used name. Confirm this output change is acceptable to the maintainer.
4. **Which name wins:** decide whether the JS profile `name` or the recipe `# TARGET DEVICE:` header is authoritative for bundled boards.

## Validation for every PR

- `npm run quality` (the CI gate), including `schema:check` and the per-file coverage minimums.
- `npm run python:test` for backend changes.
- From PR 3 on: `esphome config` on every board package in CI.
