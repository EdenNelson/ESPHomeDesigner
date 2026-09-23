"""Validate bundled hardware recipes with `esphome config`, main vs branch.

Each recipe is prepared roughly the way the Designer uses it:
  - the lambda placeholder becomes a real (empty) display lambda,
  - the touch placeholder is dropped,
  - a device name is added,
  - a stub `manage_run_and_sleep` script is provided when referenced.
A probe package then references the standard component ids the way the
Designer's generated YAML does, so an id mismatch fails validation.

Usage (from a checkout of the branch under test, with `main` available):
    pip install esphome            # 2026.9.0 was used
    python docs/drafts/validate_recipes.py [recipe.yaml ...]
Environment: ESPHOME (esphome executable), BASE_REF (default: main),
WORK_DIR (default: ./validate_work). Results go to WORK_DIR/results.json;
each run's full output is in WORK_DIR/<ref>-<recipe>/output.txt.
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True).stdout.strip())
HW = "custom_components/esphome_designer/frontend/hardware"
ESPHOME = os.environ.get("ESPHOME", "esphome")
BASE_REF = os.environ.get("BASE_REF", "main")
WORK_DIR = Path(os.environ.get("WORK_DIR", "validate_work")).resolve()


def git_show(ref, path):
    return subprocess.run(["git", "show", f"{ref}:{path}"], cwd=REPO, capture_output=True, text=True, check=True).stdout


def is_lvgl(text):
    return "lvgl." in text


def prepare(text):
    if is_lvgl(text):
        # Designer LVGL mode: no display lambda, auto_clear disabled.
        text = re.sub(r"^[ \t]*lambda:[ \t]*\|-\s*\r?\n[ \t]*# __LAMBDA_PLACEHOLDER__\s*\r?\n?", "", text, flags=re.M)
        text = re.sub(r"^\s*# __LAMBDA_PLACEHOLDER__\s*$", "", text, flags=re.M)
        text = re.sub(r"auto_clear_enabled:\s*true", "auto_clear_enabled: false", text)
    # Placeholder already preceded by a lambda header.
    text = re.sub(r"(lambda:\s*\|-\s*\n)(\s*)# __LAMBDA_PLACEHOLDER__", lambda m: f"{m.group(1)}{m.group(2)}// designer drawing code", text)
    text = re.sub(r"^(\s*)# __LAMBDA_PLACEHOLDER__", lambda m: f"{m.group(1)}lambda: |-\n{m.group(1)}  // designer drawing code", text, flags=re.M)
    text = re.sub(r"^\s*# __TOUCH_SENSORS_PLACEHOLDER__\s*$", "", text, flags=re.M)
    if re.search(r"^esphome:\s*\{", text, re.M):
        text = re.sub(r"^esphome:\s*\{", "esphome: {name: recipe-check, ", text, count=1, flags=re.M)
    elif re.search(r"^esphome:[^\n]*\n(?:[ \t]+[^\n]*\n|\s*\n)*?[ \t]{2}name:", text, re.M):
        pass  # recipe already names the device
    elif re.search(r"^esphome:", text, re.M):
        text = re.sub(r"^esphome:[^\n]*\n", "esphome:\n  name: recipe-check\n", text, count=1, flags=re.M)
    else:
        text = "esphome:\n  name: recipe-check\n" + text
    return text


def probes(new_text):
    """Probe what the Designer references, based on the branch recipe's hardware."""
    lines = []
    has = lambda key: re.search(rf"^{key}:", new_text, re.M) is not None
    if "manage_run_and_sleep" in new_text and not re.search(r"id:\s*manage_run_and_sleep", new_text):
        lines += ["script:", "  - id: manage_run_and_sleep", "    then:", "      - delay: 1ms"]
    if is_lvgl(new_text):
        lines += ["lvgl:", "  displays:", "    - my_display"]
        if has("touchscreen"):
            lines += ["  touchscreens:", "    - touchscreen_id: my_touchscreen"]
        lines += ["  pages:", "    - id: page_0", "      widgets:", "        - label:", "            text: probe"]
    actions = ["      - component.update: my_display"]
    if re.search(r"id:\s*(display_backlight|back_light|backlight)\b", new_text):
        actions.append("      - light.turn_on: display_backlight")
    lines += ["interval:", "  - interval: 1h", "    then:", *actions]
    if has("touchscreen"):
        lines += ["binary_sensor:", "  - platform: touchscreen", "    id: probe_touch",
                  "    touchscreen_id: my_touchscreen", "    x_min: 0", "    x_max: 10", "    y_min: 0", "    y_max: 10"]
    if has("i2c"):
        lines += ["sensor:", "  - platform: sht4x", "    i2c_id: bus_a", "    address: 0x7E",
                  "    temperature:", "      name: probe temperature"]
    return "\n".join(lines) + "\n"


def validate(text, probe, workdir, name):
    d = Path(workdir) / name
    d.mkdir(parents=True, exist_ok=True)
    (d / "probe.yaml").write_text(probe)
    body = prepare(text) + "\npackages:\n  designer_probe: !include probe.yaml\n"
    (d / "device.yaml").write_text(body)
    r = subprocess.run([ESPHOME, "config", "device.yaml"], cwd=d, capture_output=True, text=True, timeout=600)
    out = r.stdout + r.stderr
    (d / "output.txt").write_text(out)
    errors = [l.strip() for l in out.splitlines()
              if re.search(r"Couldn't find|Unable to find|Invalid|invalid|required|not a valid|must|ERROR|expected|conflict|not supported|Unknown", l)
              and not l.startswith(("INFO", "WARNING"))]
    return r.returncode == 0, errors[:8]


def main():
    files = sys.argv[1:] or sorted(p.name for p in (REPO / HW).glob("*.yaml"))
    results = {}
    for f in files:
        new_text = (REPO / HW / f).read_text()
        probe = probes(new_text)
        row = {}
        for label, text in ((BASE_REF, git_show(BASE_REF, f"{HW}/{f}")), ("branch", new_text)):
            ok, errs = validate(text, probe, WORK_DIR, f"{label}-{f}")
            row[label] = {"ok": ok, "errors": errs}
        results[f] = row
        print(f"{'PASS' if row[BASE_REF]['ok'] else 'FAIL'} -> {'PASS' if row['branch']['ok'] else 'FAIL'}  {f}", flush=True)
    out = WORK_DIR / "results.json"
    out.write_text(json.dumps(results, indent=2))
    print(f"details: {out}")


if __name__ == "__main__":
    main()
