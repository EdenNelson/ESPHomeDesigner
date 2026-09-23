# Pull request draft

**Branch:** `EdenNelson:standardize-component-ids` → upstream `main`

**Title:** Standardize hardware component IDs across recipes and generators

---

## Summary

Fixes #_issue_.

The bundled hardware recipes and the JS generators use different IDs for the same hardware (display, touchscreen, I2C/SPI buses, backlight). Generated YAML therefore references components that don't exist on several boards. This PR:

- adopts the most-used name for each component as the standard,
- renames the non-standard IDs in the recipes,
- routes every hardcoded reference through the ID lookup in `js/io/display_ids.js`, so custom profiles with their own IDs still work,
- adds a test that keeps the bundled recipes consistent.

The differing names aren't a design choice being overridden. Each board kept the names of the vendor or community config it was copied from (details in the issue), so this settles on one set.

| Component | Standard ID |
|---|---|
| Display | `my_display` |
| Touchscreen | `my_touchscreen` |
| I2C buses | `bus_a`, `bus_b`, … (in declaration order) |
| First SPI bus | `spi_bus` (extra SPI buses keep role-based names) |
| Backlight light | `display_backlight` |
| Backlight output | `gpio_backlight_pwm` (switch-driven backlights keep `fake_backlight_output`) |

## Bugs fixed

- **Backlight dimming / wake-on-touch** (LVGL `dim_after_timeout`) referenced `display_backlight`, which didn't exist on Elecrow ESP32-P4 9", Waveshare Round 1.28", GeekMagic Mini and SenseCAP Indicator.
- **Page-switch and sleep-schedule scripts** referenced `id(backlight_pwm)`, which the generators never define. A custom LCD profile with the `backlight_off` strategy failed to compile. The scripts now drive the backlight light (`turn_on().set_brightness(0.8)`) instead of calling `set_level()` on an output.
- **On-device sensor `i2c_id`** pointed at `bus_a` on boards whose bus was named otherwise (P4 boards, Tab5).
- **`online_image`** hardcoded the display ID instead of resolving it.
- **Waveshare Universal e-Paper 7.5" v2**: generated references used `epaper_display`, but the recipe's display is `my_display`. Recipe-backed profiles now default to `my_display`, and the backend `/hardware/templates` and the offline parser both report the display ID the recipe declares.
- **Custom hardware recipe builder** now emits IDs on the `i2c:`, `spi:` and `touchscreen:` blocks, which LVGL and the sensors already reference.

## Commits

Each commit can be reviewed on its own:

1. **Extend component id resolvers to buses and backlight.** Adds `STANDARD_COMPONENT_IDS` and resolvers for the I2C/SPI bus and the backlight light/output. No output changes.
2. **Route hardcoded component ids through the id resolvers.** Updates the generators, `yaml_merger.js`, LVGL export, scripts, the `on_boot` hints, and the `online_image` / on-device sensor plugins.
3. **Standardize component ids in the bundled hardware recipes.** Renames IDs in 19 recipes, cleans up the `devices.js` overrides that pointed at old names, adds display-ID extraction in `api/hardware.py` and `hardware_profile_sources.js`, and documents the IDs in `hardware_recipes_guide.md`.
4. **Add conformance test for hardware recipe component ids.** `tests/io/hardware_recipe_ids.test.js` loads every bundled recipe and checks the standard IDs, that each top-level ID is defined once, the offline-parser resolution, and that no retired ID is referenced. It fails 49 of its 153 checks against the old recipes.
5. **Rebuild frontend dist.**
6. **Document the component id convention in the agent instructions.** Adds one line to `.github/copilot-instructions.md` pointing at the standard IDs and the conformance test. It's easy to drop if unwanted.

## Behaviour notes for review

- **Touch transform rewrite:** the GT911 transform rewrite in `applyPackageOverrides` used to run only when the recipe contained `id: my_touchscreen`. That incidentally skipped the Guition P4 ×2, reTerminal D1001 (a GSL3670, not a GT911) and reTerminal Sticky (which has its own `mirror_y: true`). Now that those boards use `my_touchscreen`, their profiles set a new `skipTouchTransformOverride: true` flag, so their touch behaviour is **unchanged**.
- **Custom uploaded recipes:** the touch transform rewrite now follows the touchscreen ID the recipe declares, rather than only an exact `my_touchscreen`.
- **E-paper display ID:** JS-generated e-paper profiles still use `epaper_display`. Moving them to `my_display` would change their output, so it's left as an open question in the issue.
- **Multi-bus boards:** in declaration order, the D1001 buses become `bus_a` (touch) and `bus_b` (system: IO expander, audio). The Sticky's become `bus_a` (sensors) and `bus_b` (touch). The Sunton 2432S028(R) `tft` SPI bus becomes `spi_bus`, and its `touch` bus is unchanged.
- **Keeping a link to the source config:** keeping a vendor's IDs doesn't make it easier to diff against their upstream config. The recipes have already diverged (placeholders, commented-out system sections, pasted Designer blocks). If traceability matters, a `# SOURCE: <url> (ids normalized)` header line keeps it without the naming drift.
- **User impact:** only hand-written lambdas in users' own configs that reference an old recipe ID (e.g. `id(main_display)`) need updating. The Designer regenerates its own output.

## Testing

- `npm run quality` passes: ESLint, 2,036 Vitest tests, TypeScript base + strict, build, coverage and per-file coverage minimums, schema hash, bundle size. SourceLines is at WARN, the same as on `main`.
- `npm run verify:dist` passes: dist matches sources.
- `npm run python:test` passes. The new `test_hardware_templates_api_reports_display_id` joins the existing HTTP tests, which are skipped locally without the aiohttp/Home Assistant dev dependencies. I checked the same code path against all bundled recipes with a stubbed harness.
- **`esphome config` (ESPHome 2026.9.0) on every bundled recipe, `main` vs this branch.**
  - Each recipe was prepared the way the Designer uses it: an empty lambda in direct mode, or in LVGL mode no lambda plus an `lvgl:` block bound to `my_display`/`my_touchscreen`.
  - A probe package references the IDs the Designer's generated YAML uses: `component.update: my_display`, `light.turn_on: display_backlight`, a touchscreen binary sensor on `my_touchscreen`, and a sensor on `bus_a`.
  - Results:
    - 7 boards go from FAIL to PASS: Elecrow P4 9", GeekMagic Mini, Guition JC4880P443, reTerminal Sticky, Sunton 2432S028 and 2432S028R, and Waveshare Round 1.28". On `main` they failed with `Couldn't find ID 'my_display' / 'my_touchscreen' / 'bus_a' / 'display_backlight'`, and ESPHome itself suggested the old names ("These IDs look similar: main_display").
    - 3 boards pass on both.
    - None go from PASS to FAIL.
    - On Guition JC8012P4A1C and reTerminal D1001, `main`'s missing-ID errors are gone. They now reach an older, unrelated error (see Follow-ups).
    - The other 13 boards fail identically on `main`, for reasons unrelated to IDs.
    - Missing-ID errors: 9 boards on `main`, 0 on this branch.
  - The harness is on the planning branch (`docs/drafts/validate_recipes.py`).
- Not done: compiling and flashing physical boards. Feedback from owners of the renamed boards would be welcome.

## Follow-ups (not in this PR)

- Consistent display names and official vendor spelling.
- Normalize device-ID case between the backend and the offline loader (`sunton_esp32_2432s028R` vs `…r`).
- `waveshare-esp32-s3-touch-round-lcd-1.28.yaml`: `substitutions:` gets commented out but its `$var` references remain.
- The on-device humidity/temperature plugins emit `address:`/`i2c_id:` for `shtcx` at the wrong indentation.
- The sleep-schedule backlight block is wrapped in `#ifdef USE_BACKLIGHT`, which ESPHome never defines, so it's always compiled out.

Found by the `esphome config` run, all older than this PR (they fail identically on `main`, or were hidden there behind the ID errors):

- **LVGL mode keeps a recipe's own display `rotation:`**, which ESPHome 2026.4+ rejects ("not compatible with LVGL"). The Designer skips injecting rotation in LVGL mode but doesn't remove a hardcoded one. Affects Guition JC8012P4A1C (90), reTerminal D1001 (90), Guition JC4827W543 (180) and JC8048W535 (270).
- **`mipi_rgb` now requires `model:`** (current ESPHome). Affects Elecrow 7", Guition JC8048W550, Sunton 4827S032R, 8048S050 and 8048S070, and Waveshare Touch LCD 4.3.
- **Guition JC4848S040:** `on_release` is indented under `transform:`.
- **M5Stack Tab5:** `mipi_dsi` requires `esp_ldo`, which the recipe doesn't configure.
- **LILYGO T-Display S3:** the `i80` component no longer exists in current ESPHome.
- **Waveshare Universal e-Paper 7.5" v2:** the `esphome.project.name` needs a `namespace.name` form.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01FqmPmZeWPnboZh1XCUeoWi
