# Review brief: component ID standardization

A starting point for an independent review of the work before it goes upstream. Please verify the claims below rather than trusting them, and push back on the judgment calls.

## What to review

| Item | Where |
|---|---|
| Overall plan (multi-PR move to ESPHome `packages:`) | `docs/device-packages-plan.md` on branch `claude/esphome-packages-planning-vsgnvu` |
| The code change (PR 1) | branch `standardize-component-ids`, 6 commits on top of `main` |
| Upstream issue draft | `docs/drafts/issue-standardize-component-ids.md` (planning branch) |
| Upstream PR description draft | `docs/drafts/pr-standardize-component-ids.md` (planning branch) |
| `esphome config` harness | `docs/drafts/validate_recipes.py` (planning branch) |

Review the code commit by commit (`git log --reverse main..standardize-component-ids`). Commit 5 is the rebuilt `dist/` bundle; review it only for freshness.

## Checks to run

From a checkout of `standardize-component-ids`:

```
npm ci
npm run quality          # the CI gate
npm run verify:dist      # committed dist matches sources
npm run python:test      # HTTP tests skip without aiohttp/homeassistant dev deps
npx vitest run custom_components/esphome_designer/frontend/tests/io/hardware_recipe_ids.test.js
```

Optional, needs `pip install esphome` (2026.9.0 was used):

```
ESPHOME=esphome python <planning-branch>/docs/drafts/validate_recipes.py
```

## Claims to verify

1. **The standard IDs are the most-used names.** Count the IDs in `main`'s `frontend/hardware/*.yaml`. Expected: display `my_display` 22 of 25, touchscreen `my_touchscreen` 17 of 21, backlight light `display_backlight` 19, backlight output `gpio_backlight_pwm` 14, I2C `bus_a` 14. For SPI no recipe name clearly dominates; `spi_bus` is the JS generator's default.
2. **Each "bug fixed" in the PR draft is real on `main` and fixed on the branch.** The `esphome config` harness shows `Couldn't find ID …` on `main` for 9 boards and for none on the branch. Overall: 7 boards go from FAIL to PASS, 3 pass on both, 15 fail on both (on 2 of those, Guition JC8012P4A1C and reTerminal D1001, the ID errors are gone and an older, unrelated error shows through), and 0 go from PASS to FAIL.
3. **No behaviour change for the four boards with tuned touch config** (Guition P4 ×2, reTerminal D1001, reTerminal Sticky). Before this PR, the GT911 transform rewrite in `yaml_merger.js` `applyPackageOverrides` skipped them because their touchscreen wasn't named `my_touchscreen`. Now it skips them because of `skipTouchTransformOverride`. Check that the flag survives `mergeDeviceProfile` (backend templates) and the offline bundled path.
4. **Custom uploaded recipes keep working with their own display/touchscreen IDs.** These are read from the recipe by `api/hardware.py` and `hardware_profile_sources.js`.
5. **The provenance claims in the issue draft** (`BASED ON` headers, the June 6 commit adding `display_ids.js` with the P4 overrides, `id(backlight_pwm)` present since the initial commit). Check them with `git log -S`.

## Judgment calls worth challenging

- **Most-used names rather than more descriptive ones.** This was chosen deliberately to minimise churn. A descriptive rename could come later.
- **Multi-bus rule:** I2C buses are `bus_a`, `bus_b` in declaration order, and the first SPI bus is `spi_bus`. On the D1001 this makes the touch bus `bus_a` and the system bus (IO expander, audio) `bus_b`. The guide says on-device sensors attach to `bus_a`, which may not suit boards whose sensors sit on the second bus.
- **Recipe-backed profiles now default to `my_display`**, even for e-paper (`resolveDisplayId`). JS-generated e-paper profiles keep `epaper_display`, which is left for the maintainer to decide.
- **`skipTouchTransformOverride`** is a new opt-out flag, not a fix to the transform logic. The rewrite hardcodes GT911 swap/mirror values for every rotation, which is questionable in itself but out of scope.
- **The page-switch script now calls `id(display_backlight).turn_on().set_brightness(0.8).perform()`** instead of `id(backlight_pwm).set_level(0.8)`, so it drives the light rather than the output.
- **Scope:** display names, device-ID case, and several older recipe bugs are listed as follow-ups rather than fixed here.

## Known limitations

- Nothing has been compiled or flashed on hardware. The `esphome config` run validates configuration only, and in its own simplified form of the Designer's output, not the Designer's full generated YAML.
- The backend HTTP test for the new `displayId` field (`test_hardware_templates_api_reports_display_id`) couldn't run locally: the pinned Home Assistant dev dependency doesn't install here. The same code path was checked with a stubbed harness.
- The conformance test parses recipes with js-yaml plus scalar stand-ins for ESPHome tags (`!lambda`, `!secret`, `!include`, `!extend`, `!remove`). It checks IDs, not ESPHome schema validity.
