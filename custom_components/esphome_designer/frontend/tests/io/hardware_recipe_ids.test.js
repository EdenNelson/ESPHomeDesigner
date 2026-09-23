import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import { STANDARD_COMPONENT_IDS, resolveDisplayId, resolveTouchscreenId } from '../../js/io/display_ids.js';
import { parseHardwareRecipeClientSide } from '../../js/io/hardware_profile_sources.js';

// Every bundled hardware recipe must use the standard component ids so the
// Designer's generated references (LVGL displays/touchscreens, backlight
// dimming, sensor i2c_id, ...) resolve on every board.

const recipes = /** @type {Record<string, string>} */ (import.meta.glob('../../hardware/*.yaml', {
    query: '?raw',
    import: 'default',
    eager: true
}));

const scalarTag = (/** @type {string} */ tag) => new yaml.Type(tag, { kind: 'scalar', construct: (data) => data });
const ESPHOME_SCHEMA = yaml.DEFAULT_SCHEMA.extend(['!lambda', '!secret', '!include', '!extend', '!remove'].map(scalarTag));

// Ids that the standard names replaced. They must not come back.
const RETIRED_IDS = [
    'main_display', 'device_touchscreen',
    'i2c_bus', 'i2c_system', 'i2c_sensors', 'i2c_touch', 'bsp_bus',
    'back_light', 'backlight_pwm', 'ledc_gpio45',
    'spihwd', 'quad_spi', 'qspi_display', 'lcd_spi', 'spi_touch', 'epaper_spi_bus', 'tft'
];

/** @param {unknown} value */
const asList = (value) => (value == null ? [] : Array.isArray(value) ? value : [value]);

const recipeEntries = Object.entries(recipes).map(([path, text]) => [path.split('/').pop(), text]);

describe('bundled hardware recipes use the standard component ids', () => {
    it('finds the bundled recipes', () => {
        expect(recipeEntries.length).toBeGreaterThanOrEqual(25);
    });

    describe.each(recipeEntries)('%s', (file, text) => {
        const config = /** @type {Record<string, any>} */ (yaml.load(text, { schema: ESPHOME_SCHEMA }));

        it('defines each top-level component id once', () => {
            const seen = new Set();
            for (const section of Object.values(config)) {
                for (const item of asList(section)) {
                    if (!item || typeof item !== 'object' || typeof item.id !== 'string') continue;
                    expect(seen.has(item.id), `duplicate id ${item.id}`).toBe(false);
                    seen.add(item.id);
                }
            }
        });

        it('uses the standard display and touchscreen ids', () => {
            expect(asList(config.display)[0]?.id).toBe(STANDARD_COMPONENT_IDS.display);
            for (const touchscreen of asList(config.touchscreen)) {
                expect(touchscreen.id).toBe(STANDARD_COMPONENT_IDS.touchscreen);
            }
        });

        it('names I2C buses bus_a, bus_b, ... and the first SPI bus spi_bus', () => {
            asList(config.i2c).forEach((bus, index) => {
                expect(bus.id).toBe(`bus_${String.fromCharCode(97 + index)}`);
            });
            const spiBuses = asList(config.spi);
            if (spiBuses.length > 0) {
                expect(spiBuses[0].id).toBe(STANDARD_COMPONENT_IDS.spiBus);
            }
        });

        it('uses the standard backlight light and output ids', () => {
            const backlights = asList(config.light).filter((light) => /backlight/i.test(`${light.id} ${light.name}`));
            expect(backlights.length).toBeLessThanOrEqual(1);
            for (const light of backlights) {
                expect(light.id).toBe(STANDARD_COMPONENT_IDS.backlight);
                // Switch-driven backlights go through a template float output.
                expect([STANDARD_COMPONENT_IDS.backlightOutput, 'fake_backlight_output']).toContain(light.output);
            }
        });

        it('resolves to the standard ids when parsed for offline use', () => {
            const profile = parseHardwareRecipeClientSide(text, file);
            expect(resolveDisplayId(profile)).toBe(STANDARD_COMPONENT_IDS.display);
            if (config.touchscreen) {
                expect(resolveTouchscreenId(profile)).toBe(STANDARD_COMPONENT_IDS.touchscreen);
            }
        });

        it('does not reference retired ids', () => {
            for (const retired of RETIRED_IDS) {
                expect(text, `still references ${retired}`).not.toMatch(new RegExp(`(?<![\\w-])${retired}(?![\\w-])`));
            }
        });
    });
});

describe('custom recipes keep their own ids', () => {
    it('reads a non-standard display id from the recipe', () => {
        const profile = parseHardwareRecipeClientSide(
            '# Name: Custom Paper\ndisplay:\n  - platform: waveshare_epaper\n    id: panel\n    # __LAMBDA_PLACEHOLDER__\n',
            'custom-paper.yaml'
        );
        expect(profile.displayId).toBe('panel');
        expect(resolveDisplayId(profile)).toBe('panel');
    });

    it('ignores ids outside a display block', () => {
        const profile = parseHardwareRecipeClientSide(
            '# Name: No Display Block\nsensor:\n  - id: some_sensor\n',
            'no-display.yaml'
        );
        expect(profile.displayId).toBeUndefined();
    });
});
