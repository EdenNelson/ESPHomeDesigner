import { describe, it, expect } from 'vitest';
import {
    STANDARD_COMPONENT_IDS,
    resolveDisplayId,
    resolveTouchscreenId,
    resolveI2cBusId,
    resolveSpiBusId,
    resolveBacklightId,
    resolveBacklightOutputId
} from '../../js/io/display_ids.js';

describe('component id resolvers', () => {
    it('fall back to the standard ids for an empty profile', () => {
        expect(resolveDisplayId(null)).toBe(STANDARD_COMPONENT_IDS.epaperDisplay);
        expect(resolveDisplayId({ features: { lcd: true } })).toBe(STANDARD_COMPONENT_IDS.display);
        expect(resolveTouchscreenId(undefined)).toBe('my_touchscreen');
        expect(resolveI2cBusId(null)).toBe('bus_a');
        expect(resolveSpiBusId(null)).toBe('spi_bus');
        expect(resolveBacklightId(null)).toBe('display_backlight');
        expect(resolveBacklightOutputId(null)).toBe('gpio_backlight_pwm');
    });

    it('prefer explicit top-level profile ids', () => {
        const profile = {
            displayId: 'lcd',
            touchscreenId: 'tp',
            i2cBusId: 'i2c_main',
            spiBusId: 'spi_main',
            backlightId: 'bl',
            backlightOutputId: 'bl_out',
            pins: { i2c: { id: 'ignored' }, spi: { id: 'ignored' } },
            backlight: { id: 'ignored', output_id: 'ignored' }
        };
        expect(resolveDisplayId(profile)).toBe('lcd');
        expect(resolveTouchscreenId(profile)).toBe('tp');
        expect(resolveI2cBusId(profile)).toBe('i2c_main');
        expect(resolveSpiBusId(profile)).toBe('spi_main');
        expect(resolveBacklightId(profile)).toBe('bl');
        expect(resolveBacklightOutputId(profile)).toBe('bl_out');
    });

    it('read nested pin and backlight ids', () => {
        const profile = {
            pins: { i2c: { id: 'i2c_nested' }, spi: { id: 'spi_nested' } },
            backlight: { id: 'bl_nested', output_id: 'bl_out_nested' }
        };
        expect(resolveI2cBusId(profile)).toBe('i2c_nested');
        expect(resolveSpiBusId(profile)).toBe('spi_nested');
        expect(resolveBacklightId(profile)).toBe('bl_nested');
        expect(resolveBacklightOutputId(profile)).toBe('bl_out_nested');
    });

    it('exposes a frozen standard id table', () => {
        expect(Object.isFrozen(STANDARD_COMPONENT_IDS)).toBe(true);
    });
});
