/**
 * Resolve ESPHome component ids from hardware profiles.
 *
 * Bundled hardware recipes and the JS generators use the standard ids in
 * STANDARD_COMPONENT_IDS. Custom or imported profiles can declare their own
 * ids, so generators and plugins should use these helpers whenever they
 * reference a hardware component by id instead of hardcoding a name.
 */

export const STANDARD_COMPONENT_IDS = Object.freeze({
    display: "my_display",
    epaperDisplay: "epaper_display",
    touchscreen: "my_touchscreen",
    i2cBus: "bus_a",
    spiBus: "spi_bus",
    backlight: "display_backlight",
    backlightOutput: "gpio_backlight_pwm"
});

/**
 * @param {Record<string, any> | null | undefined} profile
 * @returns {string}
 */
export function resolveDisplayId(profile) {
    const isLcd = !!(profile?.features && (profile.features.lcd || profile.features.oled));
    return profile?.displayId
        || profile?.display_id
        || profile?.display?.id
        || (isLcd ? STANDARD_COMPONENT_IDS.display : STANDARD_COMPONENT_IDS.epaperDisplay);
}

/**
 * @param {Record<string, any> | null | undefined} profile
 * @returns {string}
 */
export function resolveTouchscreenId(profile) {
    return profile?.touchscreenId
        || profile?.touchscreen_id
        || profile?.touch?.id
        || profile?.touch?.touchscreenId
        || STANDARD_COMPONENT_IDS.touchscreen;
}

/**
 * Id of the primary I2C bus (the one on-board sensors and PMICs attach to).
 *
 * @param {Record<string, any> | null | undefined} profile
 * @returns {string}
 */
export function resolveI2cBusId(profile) {
    return profile?.i2cBusId
        || profile?.pins?.i2c?.id
        || STANDARD_COMPONENT_IDS.i2cBus;
}

/**
 * Id of the primary SPI bus.
 *
 * @param {Record<string, any> | null | undefined} profile
 * @returns {string}
 */
export function resolveSpiBusId(profile) {
    return profile?.spiBusId
        || profile?.pins?.spi?.id
        || STANDARD_COMPONENT_IDS.spiBus;
}

/**
 * Id of the backlight `light:` component (used for dimming and wake-up).
 *
 * @param {Record<string, any> | null | undefined} profile
 * @returns {string}
 */
export function resolveBacklightId(profile) {
    return profile?.backlightId
        || profile?.backlight?.id
        || STANDARD_COMPONENT_IDS.backlight;
}

/**
 * Id of the `output:` component that drives the backlight light.
 *
 * @param {Record<string, any> | null | undefined} profile
 * @returns {string}
 */
export function resolveBacklightOutputId(profile) {
    return profile?.backlightOutputId
        || profile?.backlight?.output_id
        || STANDARD_COMPONENT_IDS.backlightOutput;
}
