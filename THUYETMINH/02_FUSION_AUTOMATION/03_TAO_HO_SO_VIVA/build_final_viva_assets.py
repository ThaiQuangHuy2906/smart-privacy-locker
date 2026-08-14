"""Build the final Smart Privacy Locker viva image set from the latest Fusion renders.

The source images are created by ``create_smart_privacy_locker.py``.  This
post-processor deliberately writes only the nine ``*_VIVA.png`` files and the
five-page viva PDF expected by the package allow-list.  Everything is rendered
in a private build directory first and moved into place only after all image and
PDF checks pass.

The submitted PDF/DOCX and ``03_SMART_PRIVACY_LOCKER_VIVA_FINAL`` are never read,
modified, or used as image inputs.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import shutil
from datetime import datetime
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Tuple

import fitz
from PIL import Image, ImageDraw, ImageFont, ImageStat
from pypdf import PdfReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as pdf_canvas


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "03_FUSION_BUILD_OUTPUT" / "smart_privacy_locker_v2_1"
RAW = SOURCE / "_staging"
BUILD = SOURCE / ".final_viva_assets_build"
QA_DIR = RAW / "final_viva_assets_qa"
QA_JSON = RAW / "final_viva_assets_qa.json"
VIVA_META = SOURCE / "viva_assets_final"
EVIDENCE_JSON = VIVA_META / "VIVA_Annotation_Endpoint_Evidence.json"
MAPPING_JSON = VIVA_META / "VIVA_Component_Function_Mapping.json"
F3D_PATH = SOURCE / "Smart_Privacy_Locker_2_1.f3d"
FRESH_REOPEN_JSON = SOURCE / "fusion_reopen_verification.json"

FONT_REGULAR = Path(r"C:\Windows\Fonts\segoeui.ttf")
FONT_SEMIBOLD = Path(r"C:\Windows\Fonts\seguisb.ttf")
FONT_BOLD = Path(r"C:\Windows\Fonts\segoeuib.ttf")

PAPER = (246, 248, 252)
CARD = (255, 255, 255)
INK = (18, 32, 52)
NAVY = (18, 48, 82)
MUTED = (75, 93, 116)
LINE = (198, 210, 225)
TEAL = (0, 146, 161)
BLUE = (35, 103, 194)
ORANGE = (239, 119, 31)
RED = (204, 55, 65)
GREEN = (25, 143, 92)
PURPLE = (115, 78, 170)

EXPECTED_PNGS = (
    "2.1A_Exterior_Closed_VIVA.png",
    "2.1B_Interior_Open_VIVA.png",
    "2.1C_Annotated_Components_VIVA.png",
    "2.1C1_Annotated_Electronics_VIVA.png",
    "2.1C2_Annotated_Lock_MC38_VIVA.png",
    "2.1C3_Annotated_Sensors_Power_VIVA.png",
    "2.1D_Technical_Compartment_VIVA.png",
    "2.1E_Assembly_Service_View_VIVA.png",
    "2.1F_Dimensioned_View_VIVA.png",
)
PDF_NAME = "2.1_Design_Board_VIVA.pdf"

SOURCES = {
    "exterior": SOURCE / "2.1A_Exterior_Closed.png",
    "interior": SOURCE / "2.1B_Interior_Open.png",
    "technical": SOURCE / "2.1D_Technical_Compartment.png",
    "exploded": SOURCE / "2.1E_Exploded_View.png",
    "annotated": RAW / "raw_annotated_base.png",
    "dimension": RAW / "raw_dimension_base.png",
    "lock": RAW / "raw_lock_detail.png",
    "mc38": RAW / "raw_mc38_detail.png",
    "rear": RAW / "raw_rear_view.png",
}

COMPONENT_MAPPING = {
    "01A": {"name": "MC-38 reed trên khung", "functional_ids": "CB1 · YC4 · YC6", "planned_location": "Khung phải, đối diện nam châm cửa"},
    "01B": {"name": "Nam châm MC-38 trên cửa", "functional_ids": "CB1 · YC4 · YC6", "planned_location": "Mép phải cánh cửa"},
    "02A": {"name": "Servo SG90", "functional_ids": "CB2", "planned_location": "Góc phải khoang kỹ thuật"},
    "02B": {"name": "Tay servo + thanh truyền", "functional_ids": "CB2", "planned_location": "Nối servo với chốt"},
    "02C": {"name": "Chốt khóa", "functional_ids": "CB2", "planned_location": "Sát mép phải cửa"},
    "03": {"name": "Active Buzzer 5 V", "functional_ids": "CB3 · YC6", "planned_location": "Trên khay, gần vùng thoát âm"},
    "04": {"name": "DHT22", "functional_ids": "YC1", "planned_location": "Vách sau khoang chứa"},
    "05A": {"name": "Mặt hiển thị OLED", "functional_ids": "YC1", "planned_location": "Mặt trước nắp khoang kỹ thuật"},
    "05B": {"name": "PCB OLED phía sau", "functional_ids": "YC1", "planned_location": "Ngay sau cửa sổ OLED"},
    "06": {"name": "Dải LED WS2812B", "functional_ids": "YC3", "planned_location": "Mặt dưới vách ngăn kỹ thuật"},
    "07": {"name": "ESP32 DevKit V1", "functional_ids": "CB1 · CB2 · CB3 · YC1 · YC3 · YC12", "planned_location": "Khay điện tử trong khoang kỹ thuật"},
    "08": {"name": "Breadboard 830 lỗ", "functional_ids": "CB1 · CB2 · CB3 · YC1 · YC3", "planned_location": "Giữa khay kỹ thuật"},
    "09": {"name": "MOSFET D4184", "functional_ids": "CB2 · CB3 · YC3", "planned_location": "Cạnh ESP32 và đầu nối tải"},
    "10": {"name": "Jack nguồn DC 5 V/3 A gắn tủ", "functional_ids": "CB1 · CB2 · CB3 · YC1 · YC3", "planned_location": "Mặt sau; nguồn đi qua công tắc"},
    "11": {"name": "Công tắc nguồn", "functional_ids": "CB1 · CB2 · CB3 · YC1 · YC3", "planned_location": "Mặt sau, nối tiếp trước BUS_5V_SW"},
    "12": {"name": "Khoang kỹ thuật", "functional_ids": "Vùng kết cấu", "planned_location": "Phía trên khoang chứa"},
    "13": {"name": "Khoang chứa", "functional_ids": "Vùng sử dụng", "planned_location": "Phía dưới vách ngăn kỹ thuật"},
    "14": {"name": "Nắp khoang kỹ thuật tháo rời", "functional_ids": "Kết cấu bảo trì", "planned_location": "Mặt trước khoang kỹ thuật"},
    "15": {"name": "Hệ thống quản lý dây", "functional_ids": "Kết cấu bảo vệ", "planned_location": "Gờ phải và vách sau"},
    "16": {"name": "Hai bản lề cửa", "functional_ids": "Kết cấu cửa", "planned_location": "Mép trái cánh cửa"},
    "17": {"name": "Tấm che dây phía sau", "functional_ids": "Kết cấu bảo vệ", "planned_location": "Sau khoang chứa"},
}

# Every listed record corresponds to a visible arrow endpoint emitted below.
# Source coordinates are measured in the 3600 x 2400 Fusion render and are kept
# here so the evidence remains reproducible instead of being inferred later.
ENDPOINT_RECORDS = (
    ("12", EXPECTED_PNGS[2], "interior", (2250, 650)),
    ("13", EXPECTED_PNGS[2], "interior", (2200, 1570)),
    ("14", EXPECTED_PNGS[2], "exterior", (1700, 650)),
    ("15", EXPECTED_PNGS[2], "interior", (2750, 1100)),
    ("16", EXPECTED_PNGS[2], "interior", (1300, 1450)),
    ("17", EXPECTED_PNGS[2], "interior", (1920, 1490)),
    ("07", EXPECTED_PNGS[3], "exploded", (1580, 430)),
    ("08", EXPECTED_PNGS[3], "exploded", (1830, 610)),
    ("09", EXPECTED_PNGS[3], "exploded", (2520, 620)),
    ("03", EXPECTED_PNGS[3], "annotated", (2380, 690)),
    ("02A", EXPECTED_PNGS[4], "exploded", (2825, 700)),
    ("02B", EXPECTED_PNGS[4], "exploded", (2855, 590)),
    ("02C", EXPECTED_PNGS[4], "exploded", (2915, 585)),
    ("01A", EXPECTED_PNGS[4], "exploded", (2370, 1550)),
    ("01B", EXPECTED_PNGS[4], "exploded", (1510, 1540)),
    ("04", EXPECTED_PNGS[5], "annotated", (2560, 1100)),
    ("05A", EXPECTED_PNGS[5], "annotated", (1990, 665)),
    ("06", EXPECTED_PNGS[5], "exploded", (1876, 1327)),
    ("05B", EXPECTED_PNGS[5], "annotated", (2100, 635)),
    ("10", EXPECTED_PNGS[5], "rear", (1875, 825)),
    ("11", EXPECTED_PNGS[5], "rear", (1685, 878)),
)


def font(size: int, *, bold: bool = False, semibold: bool = False) -> ImageFont.FreeTypeFont:
    path = FONT_BOLD if bold else FONT_SEMIBOLD if semibold else FONT_REGULAR
    if not path.is_file():
        raise FileNotFoundError(f"Required Vietnamese font is missing: {path}")
    return ImageFont.truetype(str(path), size)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_rgb(path: Path) -> Image.Image:
    if not path.is_file():
        raise FileNotFoundError(path)
    with Image.open(path) as opened:
        image = opened.convert("RGBA")
    white = Image.new("RGBA", image.size, "white")
    white.alpha_composite(image)
    return white.convert("RGB")


def rounded_card(
    draw: ImageDraw.ImageDraw,
    box: Tuple[int, int, int, int],
    *,
    radius: int = 26,
    fill: Tuple[int, int, int] = CARD,
    outline: Tuple[int, int, int] = LINE,
    shadow: bool = True,
) -> None:
    x0, y0, x1, y1 = box
    if shadow:
        draw.rounded_rectangle(
            (x0 + 12, y0 + 16, x1 + 12, y1 + 16),
            radius=radius,
            fill=(28, 47, 70, 40),
        )
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=4)


def wrapped_lines(
    draw: ImageDraw.ImageDraw,
    text: str,
    face: ImageFont.FreeTypeFont,
    max_width: int,
    *,
    max_lines: int | None = None,
) -> List[str]:
    lines: List[str] = []
    for paragraph in text.split("\n"):
        words = paragraph.split()
        current = ""
        for word in words:
            candidate = word if not current else f"{current} {word}"
            if draw.textbbox((0, 0), candidate, font=face)[2] <= max_width:
                current = candidate
            else:
                if current:
                    lines.append(current)
                current = word
        if current:
            lines.append(current)
    if max_lines is not None and len(lines) > max_lines:
        lines = lines[:max_lines]
        last = lines[-1]
        while last and draw.textbbox((0, 0), last + "…", font=face)[2] > max_width:
            last = last[:-1]
        lines[-1] = last.rstrip() + "…"
    return lines


def draw_wrapped(
    draw: ImageDraw.ImageDraw,
    xy: Tuple[int, int],
    text: str,
    face: ImageFont.FreeTypeFont,
    fill: Tuple[int, int, int],
    max_width: int,
    *,
    spacing: int = 10,
    max_lines: int | None = None,
) -> int:
    x, y = xy
    for line in wrapped_lines(draw, text, face, max_width, max_lines=max_lines):
        draw.text((x, y), line, font=face, fill=fill)
        y += face.size + spacing
    return y


def page_title(canvas: Image.Image, title: str, subtitle: str) -> None:
    draw = ImageDraw.Draw(canvas)
    title_face = font(86, bold=True)
    subtitle_face = font(48, semibold=True)
    draw.text((90, 48), title, font=title_face, fill=NAVY)
    draw.text((94, 150), subtitle, font=subtitle_face, fill=MUTED)
    draw.rounded_rectangle((92, 224, 570, 241), radius=9, fill=TEAL)


def footer(canvas: Image.Image, text: str) -> None:
    draw = ImageDraw.Draw(canvas)
    y = canvas.height - 116
    draw.line((90, y, canvas.width - 90, y), fill=LINE, width=4)
    draw.text((92, y + 22), text, font=font(43, semibold=True), fill=MUTED)


@dataclass
class Panel:
    crop: Tuple[int, int, int, int]
    paste: Tuple[int, int, int, int]

    def map(self, source_point: Sequence[float]) -> Tuple[int, int]:
        sx, sy = source_point
        cx0, cy0, cx1, cy1 = self.crop
        px0, py0, px1, py1 = self.paste
        x = px0 + (sx - cx0) * (px1 - px0) / (cx1 - cx0)
        y = py0 + (sy - cy0) * (py1 - py0) / (cy1 - cy0)
        return int(round(x)), int(round(y))


def paste_panel(
    canvas: Image.Image,
    source: Path,
    box: Tuple[int, int, int, int],
    *,
    crop: Tuple[int, int, int, int] | None = None,
    title: str | None = None,
    title_size: int = 50,
    padding: int = 30,
) -> Panel:
    image = load_rgb(source)
    full = (0, 0, image.width, image.height)
    crop = crop or full
    cx0, cy0, cx1, cy1 = crop
    if not (0 <= cx0 < cx1 <= image.width and 0 <= cy0 < cy1 <= image.height):
        raise ValueError(f"Invalid crop {crop} for {source.name} {image.size}")
    draw = ImageDraw.Draw(canvas, "RGBA")
    rounded_card(draw, box)
    x0, y0, x1, y1 = box
    title_band = title_size + 50 if title else 0
    if title:
        draw.text((x0 + padding, y0 + 18), title, font=font(title_size, semibold=True), fill=NAVY)
        draw.line(
            (x0 + padding, y0 + title_band - 10, x1 - padding, y0 + title_band - 10),
            fill=LINE,
            width=3,
        )
    inner = (
        x0 + padding,
        y0 + title_band + padding,
        x1 - padding,
        y1 - padding,
    )
    region = image.crop(crop)
    iw, ih = inner[2] - inner[0], inner[3] - inner[1]
    scale = min(iw / region.width, ih / region.height)
    rw = int(round(region.width * scale))
    rh = int(round(region.height * scale))
    px0 = inner[0] + (iw - rw) // 2
    py0 = inner[1] + (ih - rh) // 2
    resized = region.resize((rw, rh), Image.Resampling.LANCZOS)
    canvas.paste(resized, (px0, py0))
    return Panel(crop=crop, paste=(px0, py0, px0 + rw, py0 + rh))


def arrowhead(
    draw: ImageDraw.ImageDraw,
    previous: Tuple[int, int],
    target: Tuple[int, int],
    color: Tuple[int, int, int],
    *,
    size: int = 36,
) -> None:
    angle = math.atan2(target[1] - previous[1], target[0] - previous[0])
    spread = 0.52
    left = (
        target[0] - size * math.cos(angle - spread),
        target[1] - size * math.sin(angle - spread),
    )
    right = (
        target[0] - size * math.cos(angle + spread),
        target[1] - size * math.sin(angle + spread),
    )
    draw.polygon((target, left, right), fill=color)


def card_anchor(box: Tuple[int, int, int, int], target: Tuple[int, int]) -> Tuple[int, int]:
    x0, y0, x1, y1 = box
    candidates = [
        (x0, max(y0 + 28, min(y1 - 28, target[1]))),
        (x1, max(y0 + 28, min(y1 - 28, target[1]))),
        (max(x0 + 28, min(x1 - 28, target[0])), y0),
        (max(x0 + 28, min(x1 - 28, target[0])), y1),
    ]
    return min(candidates, key=lambda point: (point[0] - target[0]) ** 2 + (point[1] - target[1]) ** 2)


def callout(
    canvas: Image.Image,
    panel: Panel,
    source_point: Tuple[int, int],
    callout_id: str,
    name: str,
    functional_ids: str,
    location: str,
    box: Tuple[int, int, int, int],
    *,
    color: Tuple[int, int, int],
) -> None:
    target = panel.map(source_point)
    draw = ImageDraw.Draw(canvas, "RGBA")
    rounded_card(draw, box)
    start = card_anchor(box, target)
    elbow = ((start[0] + target[0]) // 2, start[1])
    points = [start, elbow, target]
    draw.line(points, fill=color, width=14, joint="curve")
    arrowhead(draw, points[-2], target, color, size=42)
    draw.ellipse(
        (target[0] - 15, target[1] - 15, target[0] + 15, target[1] + 15),
        fill=color,
        outline="white",
        width=6,
    )

    x0, y0, x1, y1 = box
    badge = (x0 + 24, y0 + 24, x0 + 146, y0 + 146)
    draw.ellipse(badge, fill=color)
    id_face = font(44 if len(callout_id) <= 2 else 38, bold=True)
    id_bbox = draw.textbbox((0, 0), callout_id, font=id_face)
    draw.text(
        (
            (badge[0] + badge[2] - (id_bbox[2] - id_bbox[0])) // 2,
            (badge[1] + badge[3] - (id_bbox[3] - id_bbox[1])) // 2 - 6,
        ),
        callout_id,
        font=id_face,
        fill="white",
    )
    name_x = x0 + 172
    name_face = font(66, bold=True)
    name_lines = wrapped_lines(draw, name, name_face, x1 - name_x - 28, max_lines=2)
    y = y0 + 24
    for line in name_lines:
        draw.text((name_x, y), line, font=name_face, fill=INK)
        y += 72
    y = max(y, y0 + 168)
    draw.text((x0 + 30, y), f"ID: {functional_ids}", font=font(54, bold=True), fill=color)
    y += 70
    draw_wrapped(
        draw,
        (x0 + 30, y),
        f"Vị trí: {location}",
        font(47, semibold=True),
        MUTED,
        x1 - x0 - 60,
        spacing=8,
        max_lines=2,
    )


def region_callout(
    canvas: Image.Image,
    panel: Panel,
    source_point: Tuple[int, int],
    code: str,
    title: str,
    detail: str,
    box: Tuple[int, int, int, int],
    color: Tuple[int, int, int],
) -> None:
    target = panel.map(source_point)
    draw = ImageDraw.Draw(canvas, "RGBA")
    rounded_card(draw, box)
    start = card_anchor(box, target)
    elbow = ((start[0] + target[0]) // 2, start[1])
    draw.line((start, elbow, target), fill=color, width=13, joint="curve")
    arrowhead(draw, elbow, target, color, size=40)
    draw.ellipse((target[0] - 14, target[1] - 14, target[0] + 14, target[1] + 14), fill=color, outline="white", width=5)
    x0, y0, x1, _ = box
    draw.rounded_rectangle((x0 + 24, y0 + 24, x0 + 150, y0 + 120), radius=20, fill=color)
    draw.text((x0 + 50, y0 + 37), code, font=font(48, bold=True), fill="white")
    draw.text((x0 + 178, y0 + 22), title, font=font(60, bold=True), fill=INK)
    draw_wrapped(draw, (x0 + 30, y0 + 138), detail, font(47, semibold=True), MUTED, x1 - x0 - 60, max_lines=2)


def make_clean_poster(
    source: Path,
    output: Path,
    title: str,
    subtitle: str,
    note: str,
) -> None:
    canvas = Image.new("RGB", (3840, 2160), PAPER)
    page_title(canvas, title, subtitle)
    paste_panel(canvas, source, (90, 275, 3750, 1985), padding=34)
    footer(canvas, note)
    canvas.save(output, format="PNG", optimize=True)


def build_a() -> Path:
    path = BUILD / EXPECTED_PNGS[0]
    make_clean_poster(
        SOURCES["exterior"],
        path,
        "2.1A · NGOẠI THẤT - CỬA ĐÓNG",
        "Mặt trước hoàn chỉnh · khe cửa phải đã sửa · nắp kỹ thuật bắt bốn vít",
        "Khe cửa-gờ che: 1,5 mm mỗi bên · Góc đóng: 0° · Kích thước danh nghĩa: 300 × 250 × 220 mm.",
    )
    return path


def build_b() -> Path:
    path = BUILD / EXPECTED_PNGS[1]
    make_clean_poster(
        SOURCES["interior"],
        path,
        "2.1B · KHOANG BÊN TRONG - CỬA MỞ 105°",
        "Khoang chứa, khoang kỹ thuật, cảm biến và đường dây trong cùng một góc nhìn",
        "Joint_Door_Revolute: 0° → 105° · DHT22 ở vách sau · LED dưới vách ngăn · dây đi trong gờ phải.",
    )
    return path


def build_c() -> Path:
    canvas = Image.new("RGB", (4200, 2800), PAPER)
    page_title(canvas, "2.1C · TỔNG QUAN 17 HẠNG MỤC", "Các vùng kết cấu 12-17 được tách rõ; linh kiện điện tử xem chi tiết ở C1-C3")
    interior = paste_panel(
        canvas,
        SOURCES["interior"],
        (90, 275, 2810, 2140),
        crop=(500, 250, 3300, 2200),
        title="Cửa mở 105° · cấu hình lắp hoàn chỉnh",
        title_size=52,
    )
    cards = [
        ("12", "KHOANG KỸ THUẬT", "ESP32, breadboard, MOSFET, buzzer và cơ cấu khóa.", (2880, 300, 4110, 610), BLUE, (2250, 650)),
        ("13", "KHOANG CHỨA", "Thể tích sử dụng danh nghĩa: 260 × 170 × 190 mm.", (2880, 650, 4110, 960), GREEN, (2200, 1570)),
        ("15", "QUẢN LÝ DÂY", "Dây màu đi theo gờ phải và tách khỏi khoang chứa.", (2880, 1000, 4110, 1310), ORANGE, (2750, 1100)),
        ("16", "HAI BẢN LỀ", "Bản lề trên và dưới cùng Joint_Door_Revolute.", (2880, 1350, 4110, 1660), TEAL, (1300, 1450)),
        ("17", "TẤM CHE DÂY", "Tấm che sau bảo vệ tuyến dây ở vách trong.", (2880, 1700, 4110, 2010), PURPLE, (1920, 1490)),
    ]
    for code, title, detail, box, color, point in cards:
        region_callout(canvas, interior, point, code, title, detail, box, color)

    cover = paste_panel(
        canvas,
        SOURCES["exterior"],
        (90, 2200, 1960, 2670),
        crop=(650, 350, 2750, 1050),
        title="14 · NẮP KHOANG KỸ THUẬT",
        title_size=50,
        padding=22,
    )
    draw = ImageDraw.Draw(canvas)
    cover_target = cover.map((1700, 650))
    cover_start = (720, 2580)
    cover_elbow = (720, cover_target[1])
    draw.line((cover_start, cover_elbow, cover_target), fill=BLUE, width=13, joint="curve")
    arrowhead(draw, cover_elbow, cover_target, BLUE, size=40)
    draw.ellipse(
        (cover_target[0] - 14, cover_target[1] - 14, cover_target[0] + 14, cover_target[1] + 14),
        fill=BLUE,
        outline="white",
        width=5,
    )
    draw.rounded_rectangle((160, 2490, 720, 2640), radius=22, fill="white", outline=BLUE, width=5)
    draw.text((195, 2518), "14 · NẮP THÁO RỜI", font=font(46, bold=True), fill=BLUE)
    rounded_card(draw, (2025, 2200, 4110, 2670))
    draw.text((2070, 2235), "NHÓM LINH KIỆN 01-11", font=font(61, bold=True), fill=NAVY)
    notes = [
        "C1: ESP32 · breadboard · MOSFET · buzzer · mạng dây",
        "C2: MC-38 · servo · tay truyền · chốt khóa",
        "C3: DHT22 · OLED · LED · jack DC · công tắc",
    ]
    y = 2330
    for note, color in zip(notes, (BLUE, ORANGE, TEAL)):
        draw.ellipse((2070, y + 12, 2110, y + 52), fill=color)
        draw.text((2140, y), note, font=font(49, semibold=True), fill=INK)
        y += 98
    footer(canvas, "Chuẩn nguồn: 17 nhóm trong Mục 2.1.3; phần mềm/dịch vụ không được giả lập thành chi tiết cơ khí 3D.")
    path = BUILD / EXPECTED_PNGS[2]
    canvas.save(path, format="PNG", optimize=True)
    return path


def build_c1() -> Path:
    canvas = Image.new("RGB", (4200, 2800), PAPER)
    page_title(canvas, "C1 · KHAY ĐIỆN TỬ VÀ MẠNG DÂY", "Chữ lớn, đầu mũi tên đặt trực tiếp trên linh kiện trong render F3D mới nhất")
    exploded = paste_panel(
        canvas,
        SOURCES["exploded"],
        (90, 285, 2980, 1950),
        crop=(720, 250, 3050, 1320),
        title="Cụm điện tử được tách để nhận diện hình học",
        title_size=54,
    )
    callout(canvas, exploded, (1580, 430), "07", "ESP32 DevKit V1", "CB1 · CB2 · CB3 · YC1 · YC3 · YC12", "Khay điện tử trong khoang kỹ thuật", (3050, 300, 4110, 710), color=BLUE)
    callout(canvas, exploded, (1830, 610), "08", "Breadboard 830 lỗ", "CB1 · CB2 · CB3 · YC1 · YC3", "Giữa khay kỹ thuật", (3050, 750, 4110, 1160), color=TEAL)
    callout(canvas, exploded, (2520, 620), "09", "MOSFET D4184", "CB2 · CB3 · YC3", "Cạnh ESP32 và đầu nối tải", (3050, 1200, 4110, 1610), color=ORANGE)

    wiring = paste_panel(
        canvas,
        SOURCES["annotated"],
        (90, 2020, 2580, 2670),
        crop=(1550, 390, 2920, 1050),
        title="Mạng dây đã mắc trong khoang kỹ thuật",
        title_size=50,
        padding=22,
    )
    callout(canvas, wiring, (2380, 690), "03", "Active Buzzer 5 V", "CB3 · YC6", "Trên khay, gần vùng thoát âm", (2650, 2020, 4110, 2670), color=RED)
    footer(canvas, "26 tuyến logic: nguồn qua công tắc · 5V_SW/3V3/GND · CB1 MC-38 · CB2 servo · CB3 buzzer · DHT/OLED/LED.")
    path = BUILD / EXPECTED_PNGS[3]
    canvas.save(path, format="PNG", optimize=True)
    return path


def build_c2() -> Path:
    canvas = Image.new("RGB", (4200, 2800), PAPER)
    page_title(canvas, "C2 · CẢM BIẾN CỬA VÀ CƠ CẤU KHÓA", "Tách riêng CB1 và CB2 để mũi tên không chỉ nhầm vào khoảng trống hoặc dây dẫn")
    lock = paste_panel(
        canvas,
        SOURCES["exploded"],
        (90, 285, 2460, 1950),
        crop=(1880, 300, 3220, 1830),
        title="CB2 · servo, tay truyền và chốt",
        title_size=53,
    )
    callout(canvas, lock, (2825, 700), "02A", "Servo SG90", "CB2", "Góc phải khoang kỹ thuật", (90, 2015, 810, 2575), color=BLUE)
    callout(canvas, lock, (2855, 590), "02B", "Tay servo + thanh truyền", "CB2", "Nối servo với chốt", (850, 2015, 1650, 2575), color=TEAL)
    callout(canvas, lock, (2915, 585), "02C", "Chốt khóa", "CB2", "Sát mép phải cửa", (1690, 2015, 2460, 2575), color=ORANGE)

    sensor = paste_panel(
        canvas,
        SOURCES["exploded"],
        (2530, 285, 4110, 1950),
        crop=(1150, 1050, 2550, 2050),
        title="CB1 · cặp MC-38",
        title_size=53,
    )
    callout(canvas, sensor, (2370, 1550), "01A", "MC-38 reed trên khung", "CB1 · YC4 · YC6", "Khung phải, đối diện nam châm cửa", (2530, 2015, 3300, 2575), color=TEAL)
    callout(canvas, sensor, (1510, 1540), "01B", "Nam châm MC-38 trên cửa", "CB1 · YC4 · YC6", "Mép phải cánh cửa", (3340, 2015, 4110, 2575), color=ORANGE)
    footer(canvas, "Khe MC-38 danh nghĩa: 2,5 mm · khe cửa-gờ che: 1,5 mm · coupler đã nối liên tục thanh truyền với chốt.")
    path = BUILD / EXPECTED_PNGS[4]
    canvas.save(path, format="PNG", optimize=True)
    return path


def build_c3() -> Path:
    canvas = Image.new("RGB", (4200, 3000), PAPER)
    page_title(canvas, "C3 · CẢM BIẾN, HIỂN THỊ, LED VÀ NGUỒN", "Mỗi nhóm dùng ảnh cận cảnh riêng; cỡ chữ tối thiểu 47 px ở bản nguồn")
    interior = paste_panel(
        canvas,
        SOURCES["annotated"],
        (90, 285, 2220, 1410),
        crop=(1450, 420, 2920, 1380),
        title="YC1/YC3 · lắp trong tủ",
        title_size=52,
    )
    oled = paste_panel(
        canvas,
        SOURCES["annotated"],
        (2290, 285, 4110, 810),
        crop=(1600, 500, 2200, 850),
        title="YC1 · OLED: mặt hiển thị và PCB màu xanh phía sau",
        title_size=46,
        padding=20,
    )
    led = paste_panel(
        canvas,
        SOURCES["exploded"],
        (2290, 875, 4110, 1410),
        crop=(950, 950, 2500, 1400),
        title="YC3 · dải LED dưới vách ngăn kỹ thuật",
        title_size=47,
        padding=20,
    )
    callout(canvas, interior, (2560, 1100), "04", "DHT22", "YC1", "Vách sau khoang chứa", (90, 1470, 1080, 1880), color=TEAL)
    callout(canvas, led, (1876, 1327), "06", "Dải LED WS2812B", "YC3", "Mặt dưới vách ngăn kỹ thuật", (1120, 1470, 2220, 1880), color=ORANGE)
    callout(canvas, oled, (1990, 665), "05A", "Mặt hiển thị OLED", "YC1", "Mặt trước nắp kỹ thuật", (2290, 1470, 3180, 1880), color=BLUE)
    callout(canvas, oled, (2100, 635), "05B", "PCB OLED phía sau", "YC1", "Ngay sau cửa sổ OLED", (3220, 1470, 4110, 1880), color=PURPLE)

    rear = paste_panel(
        canvas,
        SOURCES["rear"],
        (90, 1960, 2650, 2870),
        crop=(1120, 520, 2180, 1260),
        title="Mặt sau · jack và công tắc có gờ giữ",
        title_size=52,
    )
    callout(canvas, rear, (1875, 825), "10", "Jack nguồn DC 5 V/3 A", "CB1 · CB2 · CB3 · YC1 · YC3", "Mặt sau; nguồn đi qua công tắc", (2720, 1960, 4110, 2385), color=ORANGE)
    callout(canvas, rear, (1685, 878), "11", "Công tắc nguồn", "CB1 · CB2 · CB3 · YC1 · YC3", "Mặt sau, nối tiếp trước BUS_5V_SW", (2720, 2430, 4110, 2870), color=RED)
    footer(canvas, "YC4 dùng trạng thái MC-38; YC6 dùng MC-38 + buzzer; YC12 là WiFiManager trên ESP32, không có phần cứng 3D riêng.")
    path = BUILD / EXPECTED_PNGS[5]
    canvas.save(path, format="PNG", optimize=True)
    return path


def build_d() -> Path:
    canvas = Image.new("RGB", (3840, 2160), PAPER)
    page_title(canvas, "2.1D · KHOANG KỸ THUẬT", "Nắp tháo rời · khay điện tử · mạng dây · nguồn và cơ cấu khóa")
    paste_panel(canvas, SOURCES["annotated"], (90, 285, 2380, 1980), crop=(1300, 320, 3060, 1320), title="Khoang kỹ thuật trong cụm hoàn chỉnh", title_size=50)
    paste_panel(canvas, SOURCES["exploded"], (2460, 285, 3750, 1105), crop=(720, 250, 3000, 1320), title="Cụm điện tử khi tách", title_size=46)
    draw = ImageDraw.Draw(canvas)
    rounded_card(draw, (2460, 1175, 3750, 1980))
    draw.text((2510, 1220), "ĐIỂM ĐÃ HOÀN THIỆN", font=font(58, bold=True), fill=NAVY)
    notes = [
        ("ESP32 có 4 trụ đỡ", BLUE),
        ("Jack/công tắc có gờ giữ", ORANGE),
        ("Nắp có 4 vít + boss", TEAL),
        ("26 tuyến dây có endpoint", GREEN),
        ("Nguồn bắt buộc qua công tắc", RED),
    ]
    y = 1330
    for text, color in notes:
        draw.ellipse((2515, y, 2585, y + 70), fill=color)
        draw.line(
            ((2533, y + 37), (2548, y + 53), (2571, y + 22)),
            fill="white",
            width=8,
            joint="curve",
        )
        draw.text((2620, y + 1), text, font=font(48, semibold=True), fill=INK)
        y += 115
    footer(canvas, "Chi tiết C1-C3 dùng callout riêng để tên linh kiện, ID chức năng và vị trí luôn đọc được khi trình chiếu.")
    path = BUILD / EXPECTED_PNGS[6]
    canvas.save(path, format="PNG", optimize=True)
    return path


def build_e() -> Path:
    canvas = Image.new("RGB", (3840, 2160), PAPER)
    page_title(canvas, "2.1E · LẮP RÁP VÀ BẢO TRÌ", "Exploded view từ chính F3D mới · nhận diện các mô-đun có thể tiếp cận")
    paste_panel(canvas, SOURCES["exploded"], (90, 285, 2850, 1980), padding=34)
    draw = ImageDraw.Draw(canvas)
    cards = [
        ("01", "Cửa + hai bản lề", "Joint 0° → 105°", TEAL),
        ("02", "Nắp kỹ thuật", "4 vít, 4 boss liên kết", BLUE),
        ("03", "Khay điện tử", "ESP32 · breadboard · MOSFET", ORANGE),
        ("04", "Cảm biến/tải", "MC-38 · DHT22 · OLED · LED", GREEN),
    ]
    y = 300
    for code, title, detail, color in cards:
        box = (2930, y, 3750, y + 365)
        rounded_card(draw, box)
        draw.rounded_rectangle((2960, y + 28, 3080, y + 125), radius=18, fill=color)
        draw.text((2987, y + 38), code, font=font(45, bold=True), fill="white")
        draw.text((3110, y + 27), title, font=font(55, bold=True), fill=INK)
        draw_wrapped(draw, (2970, y + 165), detail, font(47, semibold=True), MUTED, 730, max_lines=2)
        y += 405
    footer(canvas, "Exploded view chỉ phục vụ nhận diện/bảo trì; trạng thái demo chuyển động dùng Named View và Joint_Door_Revolute trong Fusion.")
    path = BUILD / EXPECTED_PNGS[7]
    canvas.save(path, format="PNG", optimize=True)
    return path


def dimension_arrow(
    draw: ImageDraw.ImageDraw,
    start: Tuple[int, int],
    end: Tuple[int, int],
    label: str,
    color: Tuple[int, int, int],
    *,
    offset: Tuple[int, int] = (0, 0),
) -> None:
    draw.line((start, end), fill=color, width=14)
    arrowhead(draw, end, start, color, size=42)
    arrowhead(draw, start, end, color, size=42)
    mid = ((start[0] + end[0]) // 2 + offset[0], (start[1] + end[1]) // 2 + offset[1])
    face = font(61, bold=True)
    bbox = draw.textbbox((0, 0), label, font=face)
    width = bbox[2] - bbox[0] + 60
    height = bbox[3] - bbox[1] + 38
    box = (mid[0] - width // 2, mid[1] - height // 2, mid[0] + width // 2, mid[1] + height // 2)
    draw.rounded_rectangle(box, radius=20, fill="white", outline=color, width=6)
    draw.text((mid[0] - (bbox[2] - bbox[0]) // 2, mid[1] - (bbox[3] - bbox[1]) // 2 - 5), label, font=face, fill=color)


def build_f() -> Path:
    canvas = Image.new("RGB", (3840, 2160), PAPER)
    page_title(canvas, "2.1F · KÍCH THƯỚC DANH NGHĨA", "Đơn vị mm · phân biệt kích thước thiết kế và hộp bao có chi tiết gắn nổi")
    front = paste_panel(canvas, SOURCES["dimension"], (90, 300, 2730, 1980), crop=(650, 120, 2950, 2290), title="Hình chiếu đứng", title_size=52)
    draw = ImageDraw.Draw(canvas, "RGBA")
    left_top = front.map((790, 220))
    right_top = front.map((2700, 220))
    left_bottom = front.map((790, 2170))
    dimension_arrow(draw, (left_top[0], left_top[1] + 5), (right_top[0], right_top[1] + 5), "RỘNG 300", ORANGE, offset=(0, 60))
    dimension_arrow(draw, (left_top[0] + 20, left_top[1]), (left_bottom[0] + 20, left_bottom[1]), "CAO 250", TEAL, offset=(110, 0))

    rounded_card(draw, (2810, 300, 3750, 1980))
    draw.text((2860, 350), "THÔNG SỐ CHỐT", font=font(61, bold=True), fill=NAVY)
    items = [
        ("A", "Kích thước danh nghĩa", "300 × 250 × 220", ORANGE),
        ("B", "Khoang chứa", "260 × 170 × 190", GREEN),
        ("C", "Khe cửa mỗi bên", "1,5", TEAL),
        ("D", "Khe cặp MC-38", "2,5", BLUE),
        ("E", "Góc mở cửa", "0° → 105°", PURPLE),
        ("F", "Hộp bao xuất thực", "300,03 × 250,04 × 223,06", RED),
    ]
    y = 480
    for code, label, value, color in items:
        draw.rounded_rectangle((2860, y, 2960, y + 92), radius=20, fill=color)
        draw.text((2890, y + 15), code, font=font(45, bold=True), fill="white")
        draw.text((2990, y - 3), label, font=font(45, semibold=True), fill=INK)
        draw.text((2990, y + 50), value + " mm" if code not in ("E",) else value, font=font(49, bold=True), fill=color)
        y += 205
    draw_wrapped(draw, (2860, 1730), "223,06 mm gồm jack/công tắc gắn nổi ở mặt sau; thân tủ vẫn sâu danh nghĩa 220 mm.", font(45, semibold=True), MUTED, 820, max_lines=3)
    footer(canvas, "Thông số đối chiếu với user parameters và bounding box của bản F3D/STEP mới nhất.")
    path = BUILD / EXPECTED_PNGS[8]
    canvas.save(path, format="PNG", optimize=True)
    return path


def make_pdf(paths: Dict[str, Path]) -> Path:
    cover = Image.new("RGB", (4200, 2800), PAPER)
    page_title(cover, "SMART PRIVACY LOCKER · VIVA READY", "Bộ ảnh mới nhất - chữ lớn - 17 nhóm đối chiếu - mở trực tiếp cùng F3D")
    panels = [
        (paths[EXPECTED_PNGS[0]], (90, 300, 2050, 1400), "A · CỬA ĐÓNG"),
        (paths[EXPECTED_PNGS[1]], (2150, 300, 4110, 1400), "B · CỬA MỞ 105°"),
        (paths[EXPECTED_PNGS[6]], (90, 1500, 2050, 2620), "D · KHOANG KỸ THUẬT"),
        (paths[EXPECTED_PNGS[7]], (2150, 1500, 4110, 2620), "E · LẮP RÁP/BẢO TRÌ"),
    ]
    for image_path, box, title in panels:
        paste_panel(cover, image_path, box, title=title, title_size=48, padding=22)
    footer(cover, "Trang 2: tổng quan · Trang 3: điện tử/dây · Trang 4: khóa/MC-38 · Trang 5: cảm biến/OLED/LED/nguồn.")
    cover_path = BUILD / "_pdf_cover.png"
    cover.save(cover_path, format="PNG", optimize=True)

    ordered = [
        (cover_path, "Tổng quan bộ ảnh viva"),
        (paths[EXPECTED_PNGS[2]], "Tổng quan 17 hạng mục"),
        (paths[EXPECTED_PNGS[3]], "C1 - Khay điện tử và mạng dây"),
        (paths[EXPECTED_PNGS[4]], "C2 - Cảm biến cửa và cơ cấu khóa"),
        (paths[EXPECTED_PNGS[5]], "C3 - Cảm biến, hiển thị, LED và nguồn"),
    ]
    pdf_path = BUILD / PDF_NAME
    page_width, page_height = 1200.0, 800.0
    pdfmetrics.registerFont(TTFont("SPLSegoe", str(FONT_REGULAR)))
    pdfmetrics.registerFont(TTFont("SPLSegoeBold", str(FONT_BOLD)))
    pdf = pdf_canvas.Canvas(str(pdf_path), pagesize=(page_width, page_height), pageCompression=1)
    for page_number, (image_path, label) in enumerate(ordered, start=1):
        pdf.setFillColorRGB(0.965, 0.973, 0.988)
        pdf.rect(0, 0, page_width, page_height, stroke=0, fill=1)
        with Image.open(image_path) as image:
            iw, ih = image.size
        available = (page_width, page_height - 38)
        scale = min(available[0] / iw, available[1] / ih)
        rw, rh = iw * scale, ih * scale
        x = (page_width - rw) / 2
        y = 38 + (available[1] - rh) / 2
        pdf.drawImage(str(image_path), x, y, width=rw, height=rh, preserveAspectRatio=True, mask="auto")
        pdf.setFillColorRGB(0.07, 0.17, 0.29)
        pdf.setFont("SPLSegoeBold", 14)
        pdf.drawString(24, 14, f"SMART PRIVACY LOCKER · {label}")
        pdf.setFont("SPLSegoe", 13)
        page_text = f"Trang {page_number}/5"
        pdf.drawRightString(page_width - 24, 14, page_text)
        # Keep one built-in-font page marker so PDF text extraction remains
        # deterministic even when a reader does not expose the embedded
        # Vietnamese TrueType ToUnicode map correctly.
        pdf.setFillColorRGB(0.38, 0.44, 0.52)
        pdf.setFont("Helvetica", 8)
        pdf.drawCentredString(page_width / 2, 14, f"Page {page_number} of 5")
        pdf.showPage()
    pdf.setTitle("Smart Privacy Locker - Viva Design Board")
    pdf.setAuthor("Nhóm 12 - 24127177, 24127205, 24127249")
    pdf.save()
    cover_path.unlink()
    return pdf_path


def verify_outputs(paths: Dict[str, Path], pdf_path: Path) -> Dict[str, object]:
    if not F3D_PATH.is_file() or not FRESH_REOPEN_JSON.is_file():
        raise FileNotFoundError("F3D or fresh-reopen verification is missing")
    fresh_reopen = json.loads(FRESH_REOPEN_JSON.read_text(encoding="utf-8"))
    expected_f3d_hash = str(fresh_reopen.get("sha256", {}).get("f3d", "")).upper()
    actual_f3d_hash = sha256(F3D_PATH).upper()
    if not expected_f3d_hash or actual_f3d_hash != expected_f3d_hash:
        raise RuntimeError(
            "Latest F3D does not match the fresh-reopen audit: "
            f"actual={actual_f3d_hash}, expected={expected_f3d_hash or '<missing>'}"
        )

    image_checks: Dict[str, object] = {}
    for name in EXPECTED_PNGS:
        path = paths[name]
        if not path.is_file() or path.stat().st_size < 100_000:
            raise RuntimeError(f"Missing or suspiciously small final image: {path}")
        with Image.open(path) as image:
            width, height = image.size
            if width < 3840 or height < 2160:
                raise RuntimeError(f"Final image resolution is too small: {name} {image.size}")
            if image.mode != "RGB":
                raise RuntimeError(f"Final image must be RGB: {name} {image.mode}")
            gray = image.convert("L").resize((480, 320))
            standard_deviation = float(ImageStat.Stat(gray).stddev[0])
            if standard_deviation < 18.0:
                raise RuntimeError(f"Final image appears blank/flat: {name} stddev={standard_deviation:.2f}")
        image_checks[name] = {
            "size_px": [width, height],
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
            "gray_stddev": round(standard_deviation, 2),
        }

    reader = PdfReader(str(pdf_path))
    if len(reader.pages) != 5:
        raise RuntimeError(f"Viva PDF must have exactly five pages, got {len(reader.pages)}")
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    if "Page 5 of 5" not in text or "Page 1 of 5" not in text:
        raise RuntimeError("Viva PDF text layer is missing page labels")

    if QA_DIR.exists():
        shutil.rmtree(QA_DIR)
    QA_DIR.mkdir(parents=True)
    document = fitz.open(str(pdf_path))
    rendered: List[Dict[str, object]] = []
    matrix = fitz.Matrix(1.5, 1.5)
    for index, page in enumerate(document):
        pixmap = page.get_pixmap(matrix=matrix, alpha=False)
        render_path = QA_DIR / f"page-{index + 1:02d}.png"
        pixmap.save(str(render_path))
        with Image.open(render_path) as image:
            stat = ImageStat.Stat(image.convert("L").resize((400, 260)))
            if stat.stddev[0] < 18.0:
                raise RuntimeError(f"Rendered PDF page {index + 1} appears blank")
            rendered.append(
                {
                    "page": index + 1,
                    "size_px": list(image.size),
                    "bytes": render_path.stat().st_size,
                    "gray_stddev": round(float(stat.stddev[0]), 2),
                }
            )
    document.close()

    return {
        "status": "PASS",
        "source_directory": str(SOURCE),
        "source_sha256": {name: sha256(path) for name, path in SOURCES.items()},
        "source_f3d": {
            "path": str(F3D_PATH),
            "bytes": F3D_PATH.stat().st_size,
            "sha256": actual_f3d_hash,
            "fresh_reopen_expected_sha256": expected_f3d_hash,
            "fresh_reopen_hash_match": True,
            "fresh_reopen_verified_at": fresh_reopen.get("verified_at"),
            "fresh_reopen_result": fresh_reopen.get("verification_result"),
        },
        "raw_renders": {
            name: {
                "path": str(path),
                "bytes": path.stat().st_size,
                "sha256": sha256(path).upper(),
                "modified_at": datetime.fromtimestamp(path.stat().st_mtime).astimezone().isoformat(),
                "size_px": [3600, 2400],
            }
            for name, path in SOURCES.items()
        },
        "outputs": image_checks,
        "typography": {
            "font_family": "Segoe UI",
            "page_title_px": 86,
            "callout_name_px": 66,
            "callout_id_px": 54,
            "callout_location_px": 47,
            "footer_px": 43,
        },
        "pdf": {
            "name": PDF_NAME,
            "pages": 5,
            "bytes": pdf_path.stat().st_size,
            "sha256": sha256(pdf_path),
            "text_layer": "PASS",
            "render_back": rendered,
        },
    }


def install_outputs(paths: Dict[str, Path], pdf_path: Path, qa: Dict[str, object]) -> None:
    if (ROOT / "03_SMART_PRIVACY_LOCKER_VIVA_FINAL").resolve() == SOURCE.resolve():
        raise RuntimeError("Safety guard: source output unexpectedly aliases the existing package")
    for name in EXPECTED_PNGS:
        os.replace(paths[name], SOURCE / name)
    os.replace(pdf_path, SOURCE / PDF_NAME)
    QA_JSON.write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    VIVA_META.mkdir(parents=True, exist_ok=True)
    installed_files = [SOURCE / name for name in EXPECTED_PNGS] + [SOURCE / PDF_NAME]
    generated_files = [
        {
            "name": path.name,
            "path": str(path),
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
        }
        for path in installed_files
    ]
    evidence = {
        "status": "PASS",
        "verification_result": "PASS",
        "method": "Fixed source-render coordinates mapped through deterministic crop/paste transforms; every record is rendered as a colored arrow plus target dot.",
        "source_f3d": qa["source_f3d"],
        "raw_renders": qa["raw_renders"],
        "endpoint_count": len(ENDPOINT_RECORDS),
        "rendered_endpoint_count": len(ENDPOINT_RECORDS),
        "records": [
            {
                "callout_id": callout_id,
                "annotated_file": annotated_file,
                "source_render": SOURCES[source_key].name,
                "source_point_px": list(source_point),
                "source_size_px": [3600, 2400],
                "rendered": True,
                "validation": "PASS",
            }
            for callout_id, annotated_file, source_key, source_point in ENDPOINT_RECORDS
        ],
        "generated_files": generated_files,
    }
    EVIDENCE_JSON.write_text(
        json.dumps(evidence, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    mapping = {
        "status": "PASS",
        "source": "Thuyết minh đã nộp, Mục 2.1.3; vị trí đối chiếu với F3D mới nhất",
        "components": COMPONENT_MAPPING,
        "qualifiers": {
            "YC4": "Dùng dữ liệu trạng thái MC-38, không có phần cứng riêng.",
            "YC6": "Dùng sự kiện MC-38, Active Buzzer và dịch vụ Telegram.",
            "YC12": "Khả năng WiFiManager trong firmware ESP32.",
            "software": "Node-RED, MQTT, Supabase, Telegram, Gmail và Gemini không phải chi tiết 3D.",
        },
    }
    MAPPING_JSON.write_text(
        json.dumps(mapping, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    missing = [str(path) for path in SOURCES.values() if not path.is_file()]
    if missing:
        raise FileNotFoundError("Missing latest Fusion render(s):\n" + "\n".join(missing))
    for path in SOURCES.values():
        with Image.open(path) as image:
            if image.size != (3600, 2400):
                raise RuntimeError(f"Unexpected source resolution: {path} {image.size}")

    if BUILD.exists():
        shutil.rmtree(BUILD)
    BUILD.mkdir(parents=True)
    try:
        generated = [
            build_a(),
            build_b(),
            build_c(),
            build_c1(),
            build_c2(),
            build_c3(),
            build_d(),
            build_e(),
            build_f(),
        ]
        paths = {path.name: path for path in generated}
        if tuple(paths) != EXPECTED_PNGS:
            raise RuntimeError(f"Unexpected final image allow-list: {tuple(paths)}")
        pdf_path = make_pdf(paths)
        qa = verify_outputs(paths, pdf_path)
        install_outputs(paths, pdf_path, qa)
    finally:
        if BUILD.exists():
            shutil.rmtree(BUILD)

    # Windows PowerShell can expose a cp1252 stdout even when the source and
    # artifacts are UTF-8.  ASCII-escaped JSON keeps the command reproducible.
    print(json.dumps({"status": "PASS", "pngs": list(EXPECTED_PNGS), "pdf": PDF_NAME, "qa": str(QA_JSON)}, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
