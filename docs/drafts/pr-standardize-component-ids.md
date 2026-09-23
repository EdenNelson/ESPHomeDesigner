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
4. **Add conformance test for hardware recipe component ids.** `tests/io/hardware_recipe_ids.test.js` loads every bundled recipe and checks the standard IDs, that each top-level ID is defined once, the offline-parser resolution, and that no retired ID is referenced. It fails 45 checks against the old recipes.
5. **Rebuild frontend dist.**

## Behaviour notes for review

- **Touch transform rewrite:** the GT911 transform rewrite in `applyPackageOverrides` used to run only when the recipe contained `id: my_touchscreen`. That incidentally skipped the Guition P4 ×2, reTerminal D1001 (a GSL3670, not a GT911) and reTerminal Sticky (which has its own `mirror_y: true`). Now that those boards use `my_touchscreen`, their profiles set a new `skipTouchTransformOverride: true` flag, so their touch behaviour is **unchanged**.
- **Custom uploaded recipes:** the touch transform rewrite now follows the touchscreen ID the recipe declares, rather than only an exact `my_touchscreen`.
- **E-paper display ID:** JS-generated e-paper profiles still use `epaper_display`. Moving them to `my_display` would change their output, so it's left as an open question in the issue.
- **Multi-bus boards:** in declaration order, the D1001 buses become `bus_a` (touch) and `bus_b` (system: IO expander, audio). The Sticky's become `bus_a` (sensors) and `bus_b` (touch). The Sunton 2432S028(R) `tft` SPI bus becomes `spi_bus`, and its `touch` bus is unchanged.
- **User impact:** only hand-written lambdas in users' own configs that reference an old recipe ID (e.g. `id(main_display)`) need updating. The Designer regenerates its own output.

## Testing

- `npm run quality` passes: ESLint, 2,036 Vitest tests, TypeScript base + strict, build, coverage and per-file coverage minimums, schema hash, bundle size. SourceLines is at WARN, the same as on `main`.
- `npm run verify:dist` passes: dist matches sources.
- `npm run python:test` passes. The new `test_hardware_templates_api_reports_display_id` joins the existing HTTP tests, which are skipped locally without the aiohttp/Home Assistant dev dependencies. I checked the same code path against all bundled recipes with a stubbed harness.
- Not yet done: `esphome config` / compile on physical boards. Feedback from owners of the renamed boards would be welcome.

## Follow-ups (not in this PR)

- Consistent display names and official vendor spelling.
- Normalize device-ID case between the backend and the offline loader (`sunton_esp32_2432s028R` vs `…r`).
- `waveshare-esp32-s3-touch-round-lcd-1.28.yaml`: `substitutions:` gets commented out but its `$var` references remain.
- The on-device humidity/temperature plugins emit `address:`/`i2c_id:` for `shtcx` at the wrong indentation.
- The sleep-schedule backlight block is wrapped in `#ifdef USE_BACKLIGHT`, which ESPHome never defines, so it's always compiled out.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01FqmPmZeWPnboZh1XCUeoWi
