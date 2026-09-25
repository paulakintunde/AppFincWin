"""Generate every FincWin app-icon PNG from a single glyph geometry table.

Run:
    python scripts/brand/generate-icons.py
    python scripts/brand/generate-icons.py --preview .planning/quick/<dir>/icon-preview.png

Outputs (written under assets/, relative to the repo root):
    assets/icon.png                      1024x1024 RGB   (no alpha, App Store icon)
    assets/android-icon-background.png   1024x1024 RGBA  (opaque cream)
    assets/android-icon-foreground.png   1024x1024 RGBA  (transparent, navy/coral glyph)
    assets/android-icon-monochrome.png   1024x1024 RGBA  (transparent, white glyph)
    assets/splash-icon.png               1024x1024 RGBA  (transparent, navy/coral glyph)
    assets/favicon.png                   48x48 RGBA      (cream rounded tile + glyph)

The geometry constants below (STEM, ARM, BLOCK, RADIUS, GLYPH_UNITS) mirror the
paths in assets/brand/fincwin-mark.svg and assets/brand/fincwin-app-icon.svg
pixel-for-pixel. If you change one, change the other to match -- do not let
the SVGs and this script drift apart. Nothing in this script traces, samples
or resamples any external image; all geometry comes from the constants only.
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]

# -- Brand colours -----------------------------------------------------------
NAVY = "#172A4F"
CORAL = "#FF6F61"
CREAM = "#F7F4E9"
WHITE = "#FFFFFF"

# -- Glyph geometry: normalised 480-unit box ---------------------------------
GLYPH_UNITS = 480
RADIUS = 68

# Each shape: (x0, y0, x1, y1, corners) where corners is a 4-tuple of
# booleans (top_left, top_right, bottom_right, bottom_left) matching
# PIL.ImageDraw.rounded_rectangle's `corners` argument, or None for a
# square-cornered rectangle.
STEM = (0, 0, 152, 480, (True, False, False, True))
ARM = (184, 0, 480, 152, (False, True, False, False))
BLOCK = (184, 192, 398, 332, None)


def hex_to_rgba(hex_color: str, alpha: int = 255) -> tuple[int, int, int, int]:
    hex_color = hex_color.lstrip("#")
    r = int(hex_color[0:2], 16)
    g = int(hex_color[2:4], 16)
    b = int(hex_color[4:6], 16)
    return (r, g, b, alpha)


def render_glyph(
    size_px: int,
    colours: tuple[str, str, str] = (NAVY, NAVY, CORAL),
) -> Image.Image:
    """Render the F glyph at size_px x size_px, transparent background.

    colours is (stem_colour, arm_colour, block_colour) -- pass (WHITE, WHITE,
    WHITE) for the monochrome variant.
    """
    ss = 8 if size_px < 64 else 4
    canvas_px = size_px * ss
    scale = canvas_px / GLYPH_UNITS

    img = Image.new("RGBA", (canvas_px, canvas_px), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    stem_colour, arm_colour, block_colour = colours

    def scaled(x0: float, y0: float, x1: float, y1: float) -> tuple[float, float, float, float]:
        return (x0 * scale, y0 * scale, x1 * scale, y1 * scale)

    sx0, sy0, sx1, sy1, s_corners = STEM
    draw.rounded_rectangle(
        scaled(sx0, sy0, sx1, sy1), radius=RADIUS * scale, fill=hex_to_rgba(stem_colour), corners=s_corners
    )

    ax0, ay0, ax1, ay1, a_corners = ARM
    draw.rounded_rectangle(
        scaled(ax0, ay0, ax1, ay1), radius=RADIUS * scale, fill=hex_to_rgba(arm_colour), corners=a_corners
    )

    bx0, by0, bx1, by1, _ = BLOCK
    draw.rectangle(scaled(bx0, by0, bx1, by1), fill=hex_to_rgba(block_colour))

    return img.resize((size_px, size_px), Image.LANCZOS)


def compose(
    canvas_px: int,
    glyph_px: int,
    bg: tuple[int, int, int, int] | None = None,
    tile_radius: int | None = None,
    glyph_colours: tuple[str, str, str] = (NAVY, NAVY, CORAL),
) -> Image.Image:
    """Build a canvas_px square canvas with the glyph centred at glyph_px.

    bg=None -> transparent canvas. bg=<rgba tuple> -> flat opaque fill.
    tile_radius set -> draw an antialiased cream rounded-square tile instead
    of a flat fill (used for favicon.png).
    """
    if tile_radius is not None:
        ss = 4
        big = canvas_px * ss
        tile = Image.new("RGBA", (big, big), (0, 0, 0, 0))
        tile_draw = ImageDraw.Draw(tile)
        tile_draw.rounded_rectangle((0, 0, big - 1, big - 1), radius=tile_radius * ss, fill=hex_to_rgba(CREAM))
        canvas = tile.resize((canvas_px, canvas_px), Image.LANCZOS)
    elif bg is not None:
        canvas = Image.new("RGBA", (canvas_px, canvas_px), bg)
    else:
        canvas = Image.new("RGBA", (canvas_px, canvas_px), (0, 0, 0, 0))

    glyph = render_glyph(glyph_px, glyph_colours)
    offset = (canvas_px - glyph_px) // 2
    canvas.alpha_composite(glyph, (offset, offset))
    return canvas


def save_asset(img: Image.Image, path: Path) -> None:
    img.save(path, "PNG")
    print(f"wrote {path.relative_to(ROOT)}")


def verify_outputs(assets_dir: Path) -> None:
    checks = [
        ("icon.png", (1024, 1024), "RGB"),
        ("android-icon-background.png", (1024, 1024), "RGBA"),
        ("android-icon-foreground.png", (1024, 1024), "RGBA"),
        ("android-icon-monochrome.png", (1024, 1024), "RGBA"),
        ("splash-icon.png", (1024, 1024), "RGBA"),
        ("favicon.png", (48, 48), "RGBA"),
    ]

    ok = True
    for name, size, mode in checks:
        path = assets_dir / name
        with Image.open(path) as img:
            img.load()
            if img.size != size or img.mode != mode:
                print(f"FAIL: {name} expected size={size} mode={mode}, got size={img.size} mode={img.mode}")
                ok = False
            else:
                print(f"ok: {name} ({img.size[0]}x{img.size[1]}, {img.mode})")

    with Image.open(assets_dir / "android-icon-background.png") as bg_img:
        alpha = bg_img.convert("RGBA").getchannel("A")
        extrema = alpha.getextrema()
        if extrema != (255, 255):
            print(f"FAIL: android-icon-background.png alpha extrema {extrema} != (255, 255)")
            ok = False
        else:
            print("ok: android-icon-background.png fully opaque")

    with Image.open(assets_dir / "android-icon-foreground.png") as fg_img:
        corner_alpha = fg_img.convert("RGBA").getpixel((0, 0))[3]
        if corner_alpha != 0:
            print(f"FAIL: android-icon-foreground.png corner alpha {corner_alpha} != 0")
            ok = False
        else:
            print("ok: android-icon-foreground.png corner transparent")

    if not ok:
        sys.exit(1)


def circular_mask(size: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    return mask


def rounded_mask(size: int, radius_frac: float) -> Image.Image:
    ss = 4
    big = size * ss
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, big - 1, big - 1), radius=int(big * radius_frac), fill=255)
    return mask.resize((size, size), Image.LANCZOS)


def build_preview(path: Path, assets_dir: Path) -> None:
    cell = 256
    pad = 24
    label_h = 24
    grey_bg = (0xDD, 0xDD, 0xDD, 255)

    cells: list[tuple[str, Image.Image]] = []

    icon = Image.open(assets_dir / "icon.png").convert("RGBA").resize((cell, cell), Image.LANCZOS)

    ios_masked = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    ios_masked.paste(icon, (0, 0), rounded_mask(cell, 0.2237))
    cells.append(("iOS masked", ios_masked))
    cells.append(("icon.png raw", icon))

    bg_full = Image.open(assets_dir / "android-icon-background.png").convert("RGBA").resize((cell, cell), Image.LANCZOS)
    fg_full = Image.open(assets_dir / "android-icon-foreground.png").convert("RGBA").resize((cell, cell), Image.LANCZOS)
    android_composite = Image.alpha_composite(bg_full, fg_full)

    circ = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    circ.paste(android_composite, (0, 0), circular_mask(cell))
    cells.append(("Android circle mask", circ))

    squircle = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    squircle.paste(android_composite, (0, 0), rounded_mask(cell, 0.3))
    cells.append(("Android squircle mask", squircle))

    safe = android_composite.copy()
    safe_draw = ImageDraw.Draw(safe)
    safe_radius = cell * (66 / 108) / 2
    cx = cy = cell / 2
    safe_draw.ellipse(
        (cx - safe_radius, cy - safe_radius, cx + safe_radius, cy + safe_radius), outline=(255, 0, 0, 255), width=3
    )
    cells.append(("66/108 safe circle", safe))

    mono = Image.open(assets_dir / "android-icon-monochrome.png").convert("RGBA").resize((cell, cell), Image.LANCZOS)
    dark_tile = Image.new("RGBA", (cell, cell), (0x33, 0x33, 0x33, 255))
    dark_tile.alpha_composite(mono)
    cells.append(("Monochrome on dark", dark_tile))

    splash = Image.open(assets_dir / "splash-icon.png").convert("RGBA").resize((cell, cell), Image.LANCZOS)
    splash_tile = Image.new("RGBA", (cell, cell), hex_to_rgba("#FBFAF7"))
    splash_tile.alpha_composite(splash)
    cells.append(("Splash on canvas bg", splash_tile))

    fav = Image.open(assets_dir / "favicon.png").convert("RGBA")
    fav_1x_tile = Image.new("RGBA", (cell, cell), grey_bg)
    fav_1x_tile.alpha_composite(fav, ((cell - fav.width) // 2, (cell - fav.height) // 2))
    cells.append(("Favicon 1x (48px)", fav_1x_tile))

    fav_4x = fav.resize((fav.width * 4, fav.height * 4), Image.NEAREST)
    fav_4x_tile = Image.new("RGBA", (cell, cell), grey_bg)
    fav_4x_tile.alpha_composite(fav_4x, ((cell - fav_4x.width) // 2, (cell - fav_4x.height) // 2))
    cells.append(("Favicon 4x (nearest)", fav_4x_tile))

    cols = 4
    rows = math.ceil(len(cells) / cols)
    sheet_w = cols * (cell + pad) + pad
    sheet_h = rows * (cell + pad + label_h) + pad
    sheet = Image.new("RGBA", (sheet_w, sheet_h), grey_bg)
    sheet_draw = ImageDraw.Draw(sheet)

    for i, (label, cell_img) in enumerate(cells):
        col = i % cols
        row = i // cols
        x = pad + col * (cell + pad)
        y = pad + row * (cell + pad + label_h)
        sheet.paste(cell_img, (x, y), cell_img)
        sheet_draw.text((x, y + cell + 4), label, fill=(0, 0, 0, 255))

    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(path, "PNG")
    print(f"wrote preview: {path}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--preview",
        type=str,
        default=None,
        help="Optional path to write a contact-sheet preview PNG (never written under assets/)",
    )
    args = parser.parse_args()

    assets_dir = ROOT / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)

    icon = compose(1024, 480, bg=hex_to_rgba(CREAM))
    save_asset(icon.convert("RGB"), assets_dir / "icon.png")

    background = Image.new("RGBA", (1024, 1024), hex_to_rgba(CREAM))
    save_asset(background, assets_dir / "android-icon-background.png")

    foreground = compose(1024, 340, bg=None)
    save_asset(foreground, assets_dir / "android-icon-foreground.png")

    monochrome = compose(1024, 340, bg=None, glyph_colours=(WHITE, WHITE, WHITE))
    save_asset(monochrome, assets_dir / "android-icon-monochrome.png")

    splash = compose(1024, 800, bg=None)
    save_asset(splash, assets_dir / "splash-icon.png")

    favicon = compose(48, round(0.47 * 48), tile_radius=round(0.22 * 48))
    save_asset(favicon, assets_dir / "favicon.png")

    verify_outputs(assets_dir)

    if args.preview:
        build_preview(Path(args.preview), assets_dir)


if __name__ == "__main__":
    main()
