import { describe, it, expect, vi } from 'vitest';

vi.mock('@core/state', () => ({
    AppState: { updateWidget: vi.fn() }
}));

import {
    generateAXP2101Section,
    generateBacklightSection,
    generateI2CSection,
    generateSPISection
} from '../../js/io/hardware_generators.js';
import * as DisplayGenerators from '../../js/io/hardware_generators_display.js';
import { generateSensorSection } from '../../js/io/hardware_generators_sensors.js';
import { applyPackageOverrides } from '../../js/io/generators/yaml_merger.js';
import { generateLVGLSnippet } from '../../js/io/yaml_export_lvgl.js';
import { generateCustomHardwareYaml } from '../../js/io/hardware_generator.js';
import onlineImagePlugin from '../../features/online_image/plugin.js';

const customIds = {
    i2cBusId: 'i2c_main',
    spiBusId: 'spi_main',
    backlightId: 'lcd_light',
    backlightOutputId: 'lcd_pwm'
};

describe('component ids are resolved from the profile', () => {
    it('JS bus and PMIC generators use the profile bus ids', () => {
        const profile = {
            ...customIds,
            pins: { i2c: { sda: 'GPIO1', scl: 'GPIO2' }, spi: { clk: 'GPIO3', mosi: 'GPIO4' } },
            features: { axp2101: true, shtc3: true }
        };
        for (const gen of [generateI2CSection, DisplayGenerators.generateI2CSection]) {
            expect(gen(profile).join('\n')).toContain('id: i2c_main');
        }
        for (const gen of [generateSPISection, DisplayGenerators.generateSPISection]) {
            expect(gen(profile).join('\n')).toContain('- id: spi_main');
        }
        for (const gen of [generateAXP2101Section, DisplayGenerators.generateAXP2101Section]) {
            expect(gen(profile).join('\n')).toContain('i2c_id: i2c_main');
        }
        expect(generateSensorSection(profile).join('\n')).toContain('i2c_id: i2c_main');
    });

    it('backlight generators use the profile light and output ids', () => {
        const profile = { ...customIds, backlight: { platform: 'ledc', pin: 'GPIO5' } };
        for (const gen of [generateBacklightSection, DisplayGenerators.generateBacklightSection]) {
            const yaml = gen(profile).join('\n');
            expect(yaml).toContain('id: lcd_pwm');
            expect(yaml).toContain('id: lcd_light');
            expect(yaml).toContain('output: lcd_pwm');
            expect(yaml).not.toContain('display_backlight');
        }
    });

    it('JS touchscreen wake trigger uses the profile backlight id', () => {
        const yaml = DisplayGenerators.generateTouchscreenSection(
            { backlightId: 'lcd_light', features: { touch: true }, touch: { platform: 'gt911' } },
            'my_display', 0, { lcdEcoStrategy: 'dim_after_timeout' }, true
        ).join('\n');
        expect(yaml).toContain('light.turn_on: lcd_light');
    });

    it('LVGL on_idle dims the profile backlight id', () => {
        const yaml = generateLVGLSnippet([], 'custom', { features: { lcd: true }, backlightId: 'lcd_light' }, {
            lcdEcoStrategy: 'dim_after_timeout'
        }).join('\n');
        expect(yaml).toContain('light.turn_off: lcd_light');
    });

    it('online image refreshes the resolved display id', () => {
        const lines = [];
        onlineImagePlugin.onExportComponents({
            lines,
            widgets: [{ id: 'img', type: 'online_image', width: 10, height: 10, props: { url: 'https://example.com/a.png', format: 'PNG' } }],
            profile: { features: { lcd: true }, displayId: 'panel' },
            isLvgl: false
        });
        expect(lines.join('\n')).toContain('component.update: panel');
    });
});

describe('recipe overrides follow the resolved touchscreen and backlight ids', () => {
    const recipe = `
display:
  - platform: st7789v
    id: my_display
    rotation: 0

touchscreen:
  - platform: gt911
    id: panel_touch
    interrupt_pin: 4

light:
  - platform: monochromatic
    id: lcd_light
`;
    const profile = {
        touchscreenId: 'panel_touch',
        backlightId: 'lcd_light',
        resolution: { width: 800, height: 480 }
    };

    it('applies the GT911 transform and wake trigger to a custom touchscreen id', () => {
        const yaml = applyPackageOverrides(recipe, profile, 'portrait', true, { lcdEcoStrategy: 'dim_after_timeout' });
        expect(yaml).toMatch(/id: panel_touch\n\s+transform:\n\s+swap_xy: true/);
        expect(yaml).toContain('light.turn_on: lcd_light');
        expect(yaml).not.toContain('display_backlight');
    });

    it('leaves the recipe touch config alone when the profile opts out', () => {
        const yaml = applyPackageOverrides(recipe, { ...profile, skipTouchTransformOverride: true }, 'portrait', true, {
            lcdEcoStrategy: 'dim_after_timeout'
        });
        expect(yaml).not.toContain('transform:');
        expect(yaml).not.toContain('on_release:');
    });
});

describe('custom hardware recipe builder', () => {
    it('emits the standard component ids', () => {
        const yaml = generateCustomHardwareYaml({
            name: 'Id Panel',
            chip: 'esp32-s3',
            tech: 'lcd',
            resWidth: 480,
            resHeight: 320,
            displayDriver: 'ili9xxx',
            touchTech: 'gt911',
            backlightMinPower: 0.1,
            isLvgl: true,
            pins: {
                clk: 'GPIO1', mosi: 'GPIO2', cs: 'GPIO3', dc: 'GPIO4',
                sda: 'GPIO5', scl: 'GPIO6', backlight: 'GPIO7'
            }
        });
        expect(yaml).toContain('id: spi_bus');
        expect(yaml).toContain('id: bus_a');
        expect(yaml).toContain('id: my_display');
        expect(yaml).toContain('id: my_touchscreen');
        expect(yaml).toContain('id: gpio_backlight_pwm');
        expect(yaml).toContain('output: gpio_backlight_pwm');
        expect(yaml).toContain('id: display_backlight');
        expect(yaml).toContain('light.turn_on: display_backlight');
    });
});
