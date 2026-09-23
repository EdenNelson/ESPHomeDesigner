# Issue draft

**Title:** Inconsistent component IDs across hardware recipes break backlight dimming, touch transforms and sensors on several boards

---

## Summary

The bundled hardware recipes (`frontend/hardware/*.yaml`) and the JS generators name the same hardware components differently. The Designer's generated YAML refers to these components by ID: LVGL `displays:`/`touchscreens:`, backlight dimming and wake-up, sensor `i2c_id`, page-switch scripts. So wherever the names differ, the generated config either fails ESPHome validation or quietly skips a fix.

This came up while planning a move of the board definitions to ESPHome [`packages:`](https://esphome.io/components/packages/) (see the discussion thread: _link_). Packages would rely on `!extend <id>` to customize a board, which needs every board to use the same IDs. Standardizing the IDs is worth doing on its own, though, because it fixes the bugs below.

## IDs in use today

| Component | Names used by the recipes (count) | Hardcoded by the Designer |
|---|---|---|
| Display | `my_display` (22), `main_display` (3) | `online_image` plugin: `my_display` / `epaper_display` |
| Touchscreen | `my_touchscreen` (17), `device_touchscreen` (4) | `yaml_merger.js` touch-transform rewrite matches only `my_touchscreen` |
| I2C bus | `bus_a` (14), `i2c_bus` (3), `i2c_system`, `i2c_sensors`, `i2c_touch`, `bsp_bus`, none (3) | on-device sensor plugins, SHT/AXP generators: `bus_a` |
| SPI bus | 8 different names (`lcd_spi`, `spihwd`, `tft`, `touch`, `quad_spi`, `qspi_display`, `spi_touch`, `epaper_spi_bus`), or none | — |
| Backlight light | `display_backlight` (19), `backlight` (2), `back_light` (2) | LVGL `on_idle`, touch wake-up, recipe overrides: `display_backlight` |
| Backlight output | `gpio_backlight_pwm` (14), `backlight_pwm` (5), `ledc_gpio45`, `GPIO38` | page-switch / sleep scripts: `id(backlight_pwm)` |

## Where the names come from

None of the differing names appear to be deliberate:

- The 14 recipes marked `# BASED ON: https://github.com/agillis/esphome-modular-lvgl-buttons` share that project's naming (`my_display`, `my_touchscreen`, `bus_a`, `display_backlight`, `gpio_backlight_pwm`). That's where the majority names come from.
- Boards added later from other vendor or community configs (the Guition P4 boards, reTerminal D1001 and Sticky, Elecrow P4, Waveshare Round 1.28") kept their source's names.
- Later code accommodated those names instead of normalizing them: the per-profile `displayId`/`touchscreenId` overrides and `display_ids.js`, added in the same change as the first P4 recipe.
- `id(backlight_pwm)` has been in the page-switch script since the initial commit, before any recipe defined it.

So settling on one set changes where the names came from, not a design decision.

## Resulting bugs

1. **Backlight dimming / wake-on-touch fails validation** on Elecrow ESP32-P4 9", Waveshare Round 1.28", GeekMagic Mini and SenseCAP Indicator. The LVGL `dim_after_timeout` strategy emits `light.turn_off: display_backlight`, but these recipes name the light `back_light` or `backlight`.
2. **Page-switch and sleep-schedule scripts reference `id(backlight_pwm)`.** The JS generators never define that ID (they emit `gpio_backlight_pwm` → `display_backlight`), so a custom LCD profile using the `backlight_off` eco strategy fails to compile. The scripts also call `set_level()`, an output method, instead of controlling the light.
3. **On-device sensors on P4 / Tab5 boards** emit `i2c_id: bus_a`, but those recipes name the bus `i2c_bus` or `bsp_bus`.
4. **`online_image` refresh** hardcodes `my_display`/`epaper_display`, so it's wrong on boards whose display is `main_display`.
5. **The Waveshare Universal e-Paper 7.5" v2 recipe** names its display `my_display`, but because it's e-paper the Designer resolves `epaper_display`, so the generated `component.update`/`->update()` calls point at a display that doesn't exist.
6. **The custom hardware recipe builder** emits `i2c:`, `spi:` and `touchscreen:` blocks without IDs, while LVGL export references `touchscreen_id: my_touchscreen` and sensors reference `i2c_id: bus_a`.

## Proposal

Adopt the most-used name for each component as the standard, and use it everywhere:

| Component | Standard ID |
|---|---|
| Display | `my_display` |
| Touchscreen | `my_touchscreen` |
| I2C buses | `bus_a`, `bus_b`, … (in declaration order) |
| First SPI bus | `spi_bus` |
| Backlight light | `display_backlight` |
| Backlight output | `gpio_backlight_pwm` |

- Rename the non-standard IDs in the bundled recipes.
- Route every hardcoded reference in the generators and plugins through the existing ID lookup in `js/io/display_ids.js`, so custom profiles that declare other IDs keep working.
- Add a test that checks every bundled recipe conforms.
- Document the IDs in `hardware_recipes_guide.md`.

More descriptive names can come in a later, separate refactor. The aim here is consistency with as little churn as possible.

## Open question

JS-generated e-paper profiles (reTerminal E100x, TRMNL, M5Paper, …) use `epaper_display`, while every recipe, e-paper ones included, uses `my_display`. Should e-paper also move to `my_display`? That changes the generated output for those devices, so the proposed PR leaves it as is.

A PR implementing the proposal is ready: _link_.
