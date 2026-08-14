"""Build and verify the final Smart Privacy Locker viva package.

The builder intentionally writes only ``03_SMART_PRIVACY_LOCKER_VIVA_FINAL``.
It never replaces an existing final package. Every copied file is named in the
allowlist below; verification rejects missing, extra, empty, modified, or
symlinked files.

Usage from the THUYETMINH workspace::

    python 02_FUSION_AUTOMATION/03_TAO_HO_SO_VIVA/build_viva_ready_package.py build
    python 02_FUSION_AUTOMATION/03_TAO_HO_SO_VIVA/build_viva_ready_package.py verify

Run ``build`` only after the Fusion fresh-reopen/interference audits and the
viva image builder have completed successfully.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import struct
import sys
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path, PurePosixPath
from typing import Any, Iterable


WORKSPACE = Path(__file__).resolve().parents[2]
OUTPUT = WORKSPACE / "03_FUSION_BUILD_OUTPUT" / "smart_privacy_locker_v2_1"
VIVA_ASSETS = OUTPUT / "viva_assets_final"
REFERENCES = WORKSPACE / "01_PROJECT_REFERENCES" / "02_THUYET_MINH_DA_NOP"
PACKAGE_NAME = "03_SMART_PRIVACY_LOCKER_VIVA_FINAL"
PACKAGE = WORKSPACE / PACKAGE_NAME

SOURCE_F3D_NAME = "Smart_Privacy_Locker_2_1.f3d"
SOURCE_STEP_NAME = "Smart_Privacy_Locker_2_1.step"
PACKAGE_F3D_NAME = "Smart_Privacy_Locker_v2.1_Final.f3d"
PACKAGE_STEP_NAME = "Smart_Privacy_Locker_v2.1_Backup.step"
DESIGN_BOARD_NAME = "2.1_Design_Board_VIVA.pdf"

PRIMARY_MODEL_DIR = PurePosixPath("01_MO_HINH_FUSION_CHINH")
DESIGN_BOARD_DIR = PurePosixPath("02_BANG_TRINH_BAY_VIVA")
IMAGES_DIR = PurePosixPath("03_HINH_ANH_VIVA")
SUBMITTED_DOCS_DIR = PurePosixPath("04_THUYET_MINH_DA_NOP")
VERIFICATION_DIR = PurePosixPath("05_BAO_CAO_KIEM_CHUNG")
BACKUP_MODEL_DIR = PurePosixPath("06_MO_HINH_STEP_DU_PHONG")

VIVA_IMAGE_NAMES = (
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

SUBMITTED_REFERENCE_SHA256 = {
    "12_24127177_24127205_24127249.docx": (
        "078329A765FCE3BAF283E3C40377831B050D2DF3A3A548FD44171EA440D89563"
    ),
    "12_24127177_24127205_24127249.pdf": (
        "DA107DB4CED15A5D4DBC8640FC21A340D829F129EFE5D88FAD6D809CCC483195"
    ),
}


@dataclass(frozen=True)
class CopySpec:
    source: Path
    destination: PurePosixPath
    kind: str
    minimum_bytes: int = 1


COPY_SPECS = (
    CopySpec(
        OUTPUT / SOURCE_F3D_NAME,
        PRIMARY_MODEL_DIR / PACKAGE_F3D_NAME,
        "final Fusion 360 archive",
        100_000,
    ),
    CopySpec(
        OUTPUT / DESIGN_BOARD_NAME,
        DESIGN_BOARD_DIR / DESIGN_BOARD_NAME,
        "viva design-board PDF",
        50_000,
    ),
    *(
        CopySpec(
            OUTPUT / name,
            IMAGES_DIR / name,
            "viva PNG",
            50_000,
        )
        for name in VIVA_IMAGE_NAMES
    ),
    *(
        CopySpec(
            REFERENCES / name,
            SUBMITTED_DOCS_DIR / name,
            "submitted reference (immutable)",
            10_000,
        )
        for name in SUBMITTED_REFERENCE_SHA256
    ),
    CopySpec(
        OUTPUT / "fusion_build_summary.json",
        VERIFICATION_DIR / "VIVA_Fusion_Build_Audit.json",
        "Fusion build audit",
        500,
    ),
    CopySpec(
        OUTPUT / "fusion_reopen_verification.json",
        VERIFICATION_DIR / "VIVA_Fresh_Reopen_Model_Audit.json",
        "fresh F3D and STEP audit",
        500,
    ),
    CopySpec(
        OUTPUT / "fusion_interference_verification.json",
        VERIFICATION_DIR / "VIVA_Fresh_Reopen_Interference_5deg_Audit.json",
        "5-degree interference sweep audit",
        500,
    ),
    CopySpec(
        VIVA_ASSETS / "VIVA_Annotation_Endpoint_Evidence.json",
        VERIFICATION_DIR / "VIVA_Annotation_Endpoint_Evidence.json",
        "annotation endpoint audit",
        200,
    ),
    CopySpec(
        VIVA_ASSETS / "VIVA_Component_Function_Mapping.json",
        VERIFICATION_DIR / "VIVA_Component_Function_Mapping.json",
        "component/function mapping",
        200,
    ),
    CopySpec(
        OUTPUT / SOURCE_STEP_NAME,
        BACKUP_MODEL_DIR / PACKAGE_STEP_NAME,
        "STEP backup",
        100_000,
    ),
)

README_PATH = PurePosixPath("00_HUONG_DAN_SU_DUNG.md")
REPORT_PATH = VERIFICATION_DIR / "BAO_CAO_KIEM_CHUNG_GOI_VIVA.md"
CHECKLIST_PATH = VERIFICATION_DIR / "KIEM_TRA_DAY_DU_17_HANG_MUC.md"
MANIFEST_PATH = PurePosixPath("99_MANIFEST_SHA256.txt")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def _read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Không đọc được JSON hợp lệ: {path}: {error}") from error
    if not isinstance(value, dict):
        raise RuntimeError(f"JSON gốc phải là object: {path}")
    return value


def _nested(data: dict[str, Any], *keys: str) -> Any:
    value: Any = data
    for key in keys:
        if not isinstance(value, dict) or key not in value:
            raise RuntimeError(f"Audit thiếu trường bắt buộc: {'.'.join(keys)}")
        value = value[key]
    return value


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def _validate_sources() -> dict[str, Any]:
    for spec in COPY_SPECS:
        _require(spec.source.is_file(), f"Thiếu đầu vào bắt buộc: {spec.source}")
        _require(not spec.source.is_symlink(), f"Không chấp nhận symlink đầu vào: {spec.source}")
        _require(
            spec.source.stat().st_size >= spec.minimum_bytes,
            f"Đầu vào quá nhỏ hoặc rỗng: {spec.source}",
        )

    for name, expected_hash in SUBMITTED_REFERENCE_SHA256.items():
        actual_hash = _sha256(REFERENCES / name)
        _require(
            actual_hash == expected_hash,
            f"File thuyết minh đã nộp bị thay đổi: {name} ({actual_hash})",
        )

    build = _read_json(OUTPUT / "fusion_build_summary.json")
    reopen = _read_json(OUTPUT / "fusion_reopen_verification.json")
    interference = _read_json(OUTPUT / "fusion_interference_verification.json")
    evidence = _read_json(VIVA_ASSETS / "VIVA_Annotation_Endpoint_Evidence.json")
    mapping = _read_json(VIVA_ASSETS / "VIVA_Component_Function_Mapping.json")

    _require(
        build.get("verification_result") == "Fusion build and pre-export validation passed",
        "Fusion build audit chưa PASS",
    )
    expected_build_values = {
        "component_count_including_root": 25,
        "occurrence_count": 24,
        "body_count": 340,
        "solid_body_count": 340,
        "user_parameter_count": 29,
        "timeline_count": 118,
    }
    for key, expected in expected_build_values.items():
        _require(int(build.get(key, -1)) == expected, f"Build audit: {key} != {expected}")
    _require(not build.get("timeline_health_issues"), "Build audit còn lỗi/cảnh báo timeline")
    _require(_nested(build, "mechanical_integration", "status") == "PASS", "Mechanical audit chưa PASS")
    _require(_nested(build, "routing_connectivity", "status") == "PASS", "Routing audit chưa PASS")
    _require(int(_nested(build, "routing_connectivity", "route_count")) == 26, "Routing audit không đủ 26 tuyến")
    _require(
        int(_nested(build, "routing_connectivity", "segment_body_count")) == 159,
        "Routing audit không đủ 159 đoạn dây",
    )

    _require(reopen.get("verification_result") == "passed", "Fresh-reopen audit chưa PASS")
    f3d_audit = _nested(reopen, "f3d")
    step_audit = _nested(reopen, "step")
    for key, expected in {
        "component_count_including_root": 25,
        "body_count": 340,
        "solid_body_count": 340,
        "user_parameter_count": 29,
        "timeline_count": 118,
    }.items():
        _require(int(f3d_audit.get(key, -1)) == expected, f"Fresh F3D: {key} != {expected}")
    _require(not f3d_audit.get("timeline_health_issues"), "Fresh F3D còn lỗi/cảnh báo timeline")
    _require(int(f3d_audit.get("named_view_count", -1)) >= 28, "Fresh F3D thiếu Named Views dùng khi vấn đáp")
    named_views = f3d_audit.get("named_views", [])
    _require(isinstance(named_views, list), "Fresh F3D named_views không hợp lệ")
    for index in range(15):
        prefix = f"VIVA_{index:02d}"
        _require(any(str(name).startswith(prefix) for name in named_views), f"Fresh F3D thiếu {prefix}")
    _require(
        _nested(f3d_audit, "door_joint", "drive_test_after_reopen") == "passed",
        "Joint cửa chưa vượt qua drive test sau khi mở lại",
    )
    _require(_nested(f3d_audit, "mechanical_integration", "status") == "PASS", "Fresh mechanical audit chưa PASS")
    _require(_nested(f3d_audit, "routing_connectivity", "status") == "PASS", "Fresh routing audit chưa PASS")
    _require(int(step_audit.get("body_count", -1)) == 340, "Fresh STEP không đủ 340 body")
    _require(int(step_audit.get("solid_body_count", -1)) == 340, "Fresh STEP không đủ 340 solid")
    _require(not step_audit.get("invalid_bodies"), "Fresh STEP có body không hợp lệ")

    f3d_hash = _sha256(OUTPUT / SOURCE_F3D_NAME)
    step_hash = _sha256(OUTPUT / SOURCE_STEP_NAME)
    _require(str(_nested(reopen, "sha256", "f3d")).upper() == f3d_hash, "F3D hiện tại không khớp fresh-reopen audit")
    _require(str(_nested(reopen, "sha256", "step")).upper() == step_hash, "STEP hiện tại không khớp fresh-reopen audit")

    _require(interference.get("verification_result") == "passed", "Interference audit chưa PASS")
    _require(int(interference.get("unique_serious_collision_count", -1)) == 0, "Interference audit còn va chạm nghiêm trọng")
    _require(interference.get("sample_angles_degrees") == list(range(0, 106, 5)), "Interference audit không đủ 22 góc, bước 5 độ")
    _require(int(interference.get("body_count_before_and_after", -1)) == 340, "Body count thay đổi khi quét va chạm")
    _require(float(interference.get("door_restored_to_degrees", -1)) == 0.0, "Cửa chưa được trả về 0 độ sau quét")

    evidence_status = str(evidence.get("status", evidence.get("verification_result", ""))).upper()
    _require(evidence_status in {"PASS", "PASSED"}, "Annotation endpoint audit chưa PASS")
    endpoint_count = int(evidence.get("endpoint_count", 0))
    rendered_count = int(evidence.get("rendered_endpoint_count", endpoint_count))
    _require(endpoint_count >= 19 and rendered_count == endpoint_count, "Annotation endpoint audit chưa đủ endpoint đã render")
    components = mapping.get("components")
    _require(isinstance(components, dict) and components, "Component/function mapping rỗng")
    records = evidence.get("records")
    _require(isinstance(records, list), "Annotation endpoint audit thiếu records")
    rendered_ids = {
        str(record.get("callout_id"))
        for record in records
        if isinstance(record, dict)
        and record.get("rendered") is True
        and str(record.get("validation", "")).upper() == "PASS"
    }
    mapping_ids = {str(identifier) for identifier in components}
    _require(rendered_ids == mapping_ids, "ID mapping và ID mũi tên không khớp chính xác")
    functional_groups = {
        match.group(1)
        for identifier in mapping_ids
        if (match := re.match(r"^(\d{2})", identifier))
    }
    _require(
        functional_groups == {f"{index:02d}" for index in range(1, 18)},
        "Mapping không phủ đủ 17 nhóm 01-17",
    )

    generated_files = evidence.get("generated_files")
    if isinstance(generated_files, list):
        evidence_hashes = {
            str(row.get("name")): str(row.get("sha256", "")).upper()
            for row in generated_files
            if isinstance(row, dict)
        }
        for name in (*VIVA_IMAGE_NAMES, DESIGN_BOARD_NAME):
            _require(name in evidence_hashes, f"Endpoint audit không ghi nhận asset: {name}")
            _require(_sha256(OUTPUT / name) == evidence_hashes[name], f"Asset khác hash endpoint audit: {name}")

    return {
        "build": build,
        "reopen": reopen,
        "interference": interference,
        "evidence": evidence,
        "mapping": mapping,
        "f3d_sha256": f3d_hash,
        "step_sha256": step_hash,
    }


def _png_dimensions(path: Path) -> tuple[int, int]:
    with path.open("rb") as handle:
        header = handle.read(24)
    _require(header[:8] == b"\x89PNG\r\n\x1a\n", f"Không phải PNG hợp lệ: {path}")
    _require(header[12:16] == b"IHDR", f"PNG thiếu IHDR: {path}")
    return struct.unpack(">II", header[16:24])


def _expected_inventory() -> set[PurePosixPath]:
    return {
        *(spec.destination for spec in COPY_SPECS),
        README_PATH,
        REPORT_PATH,
        CHECKLIST_PATH,
        MANIFEST_PATH,
    }


def _inventory(root: Path) -> set[PurePosixPath]:
    result: set[PurePosixPath] = set()
    for path in root.rglob("*"):
        _require(not path.is_symlink(), f"Package không được chứa symlink: {path}")
        if path.is_file():
            result.add(PurePosixPath(path.relative_to(root).as_posix()))
    return result


def _manifest_text(root: Path) -> str:
    files = sorted(_expected_inventory() - {MANIFEST_PATH}, key=lambda item: item.as_posix().casefold())
    lines = ["# SHA-256  relative_path"]
    for relative in files:
        lines.append(f"{_sha256(root / Path(relative.as_posix()))}  {relative.as_posix()}")
    return "\n".join(lines) + "\n"


def _parse_manifest(path: Path) -> dict[PurePosixPath, str]:
    lines = path.read_text(encoding="utf-8").splitlines()
    _require(lines and lines[0] == "# SHA-256  relative_path", "Manifest header không hợp lệ")
    records: dict[PurePosixPath, str] = {}
    for line in lines[1:]:
        _require("  " in line, f"Manifest line không hợp lệ: {line}")
        digest, relative_text = line.split("  ", 1)
        _require(len(digest) == 64 and all(char in "0123456789ABCDEF" for char in digest), f"SHA-256 không hợp lệ: {digest}")
        relative = PurePosixPath(relative_text)
        _require(not relative.is_absolute() and ".." not in relative.parts, f"Manifest path không an toàn: {relative_text}")
        _require(relative not in records, f"Manifest trùng path: {relative_text}")
        records[relative] = digest
    return records


def _readme_text(audits: dict[str, Any]) -> str:
    reopen = audits["reopen"]
    interference = audits["interference"]
    body_count = int(_nested(reopen, "f3d", "body_count"))
    named_view_count = int(_nested(reopen, "f3d", "named_view_count"))
    return f"""# SMART PRIVACY LOCKER — GÓI VẤN ĐÁP MỚI NHẤT

## Mở file nào trước?

1. Mở `{PRIMARY_MODEL_DIR / PACKAGE_F3D_NAME}` trong Autodesk Fusion.
2. Mở **Named Views** và chọn `VIVA_00_START_HERE` để bắt đầu. Named View lưu camera; trạng thái cửa/nắp được điều khiển riêng như bên dưới.
3. Demo cửa: trong Browser, nhấp phải `Joint_Door_Revolute` -> **Drive Joint** -> cho chạy 0° đến 105°. Dùng `VIVA_03_Interior_Open` hoặc `VIVA_08_Annotated_Interior_Context` khi cửa ở 105°.
4. Demo khoang điện tử: tắt bóng đèn của component `19_Technical_Compartment_Cover`; nếu cần nhìn từ trên thì tắt thêm body `Top_Panel` và `Front_Technical_Fascia` trong `01_Enclosure`. Sau đó chọn `VIVA_04`, `VIVA_09` hoặc `VIVA_14`.
5. Các camera còn lại: `VIVA_05`/`VIVA_12` cho nguồn phía sau; `VIVA_10` cho cơ cấu khóa; `VIVA_11` cho MC-38; `VIVA_06`/`VIVA_07` cho kích thước.
6. Kết thúc demo: đưa joint về 0° và bật lại nắp/các body đã ẩn. Không Save đè lên file gốc nếu chỉ đang trình diễn.
7. Mở `{DESIGN_BOARD_DIR / DESIGN_BOARD_NAME}` khi cần xem ảnh chú thích cỡ chữ lớn và vị trí linh kiện; các PNG riêng nằm trong `{IMAGES_DIR}`, audit nằm trong `{VERIFICATION_DIR}`.

## Trạng thái đã kiểm chứng

- Fresh F3D/STEP: PASS; {body_count} body/solid.
- Cơ khí lắp ghép và 26 tuyến dây chức năng: PASS.
- Named Views: {named_view_count}, có đủ `VIVA_00`–`VIVA_14`.
- Joint cửa 0° → 105° → 0°: PASS.
- Quét va chạm: {len(interference['sample_angles_degrees'])} góc, bước 5°, 0 va chạm nghiêm trọng.
- Hai file trong `{SUBMITTED_DOCS_DIR}` là bản đã nộp, được giữ nguyên byte và khóa bằng SHA-256.

## Cấu trúc sạch

- `{PRIMARY_MODEL_DIR}`: file F3D chính, giữ component, timeline, parameters, joint và Named Views.
- `{DESIGN_BOARD_DIR}`: PDF tổng hợp dùng để trình bày nhanh khi vấn đáp.
- `{IMAGES_DIR}`: đúng 9 ảnh VIVA mới nhất.
- `{SUBMITTED_DOCS_DIR}`: PDF/DOCX gốc, không chỉnh sửa.
- `{VERIFICATION_DIR}`: build, fresh-reopen, routing/mechanical, interference, endpoint và mapping chức năng.
- `{BACKUP_MODEL_DIR}`: STEP mới nhất.
- `{MANIFEST_PATH}`: hash của mọi file trong gói, trừ chính manifest để tránh vòng lặp hash.
"""


def _report_text(audits: dict[str, Any]) -> str:
    build = audits["build"]
    reopen = audits["reopen"]
    interference = audits["interference"]
    f3d = reopen["f3d"]
    step = reopen["step"]
    generated_at = datetime.now().astimezone().isoformat(timespec="seconds")
    return f"""# VIVA PACKAGE VERIFICATION REPORT

Generated: {generated_at}

## Kết luận

**PASS — package này chỉ được tạo sau khi toàn bộ nguồn bắt buộc vượt qua kiểm tra.**

| Hạng mục | Kết quả |
|---|---:|
| Component / occurrence | {build['component_count_including_root']} / {build['occurrence_count']} |
| F3D body / solid | {f3d['body_count']} / {f3d['solid_body_count']} |
| STEP body / solid | {step['body_count']} / {step['solid_body_count']} |
| Timeline / lỗi | {f3d['timeline_count']} / {len(f3d['timeline_health_issues'])} |
| User parameters | {f3d['user_parameter_count']} |
| Named Views | {f3d['named_view_count']} |
| Tuyến dây / đoạn dây | {build['routing_connectivity']['route_count']} / {build['routing_connectivity']['segment_body_count']} |
| Góc quét interference | {len(interference['sample_angles_degrees'])} |
| Va chạm nghiêm trọng | {interference['unique_serious_collision_count']} |

## Liên kết bằng SHA-256

- F3D: `{audits['f3d_sha256']}`
- STEP: `{audits['step_sha256']}`
- Fresh-reopen audit ghi đúng hai hash trên.
- Từng ảnh/PDF được đối chiếu với endpoint-evidence audit khi audit có danh sách `generated_files`.
- PDF/DOCX đã nộp được đối chiếu với hash bất biến đã khóa trong builder.

## Giới hạn được công bố trung thực

- Các pin ESP32 trong CAD là tên logic theo chức năng; số GPIO cụ thể thuộc firmware/pinout và không được tự suy diễn từ thuyết minh đã nộp.
- STEP dùng để dự phòng hình học; F3D là file chính khi vấn đáp vì giữ component, timeline, parameters, joint và Named Views.
"""


def _checklist_text(audits: dict[str, Any]) -> str:
    components = audits["mapping"]["components"]

    def clean(value: Any) -> str:
        return str(value).replace("|", "\\|").replace("\r", " ").replace("\n", " ").strip()

    rows = []
    for identifier, item in components.items():
        _require(isinstance(item, dict), f"Mapping {identifier} không hợp lệ")
        rows.append(
            "| {identifier} | {name} | {functions} | {location} | PASS |".format(
                identifier=clean(identifier),
                name=clean(item.get("name", "")),
                functions=clean(item.get("functional_ids", "")),
                location=clean(item.get("planned_location", "")),
            )
        )
    return """# KIỂM TRA ĐỦ 17 HẠNG MỤC

Kết luận: **PASS**. Mapping phủ đủ 17 nhóm `01`-`17`; các nhóm có chi tiết A/B/C được tách thành 21 điểm mũi tên để tránh chỉ nhầm linh kiện.

| ID | Bộ phận | ID chức năng | Vị trí dự kiến/hiện tại | Kết quả |
|---|---|---|---|---:|
""" + "\n".join(rows) + "\n\nNguồn đối chiếu: thuyết minh đã nộp, mapping JSON, 9 ảnh VIVA và F3D fresh-reopen mới nhất.\n"


def _copy_allowlist(stage: Path) -> None:
    for spec in COPY_SPECS:
        destination = stage / Path(spec.destination.as_posix())
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(spec.source, destination)
        _require(_sha256(destination) == _sha256(spec.source), f"Copy sai hash: {spec.destination}")


def _verify_package(root: Path, *, compare_sources: bool = True) -> dict[str, Any]:
    _require(root.is_dir(), f"Package chưa tồn tại: {root}")
    actual_inventory = _inventory(root)
    expected_inventory = _expected_inventory()
    missing = sorted(expected_inventory - actual_inventory, key=lambda item: item.as_posix())
    extra = sorted(actual_inventory - expected_inventory, key=lambda item: item.as_posix())
    _require(not missing, "Package thiếu file: " + ", ".join(item.as_posix() for item in missing))
    _require(not extra, "Package có file ngoài allowlist: " + ", ".join(item.as_posix() for item in extra))

    for relative in actual_inventory:
        path = root / Path(relative.as_posix())
        _require(path.stat().st_size > 0, f"Package có file rỗng: {relative}")

    manifest = _parse_manifest(root / Path(MANIFEST_PATH.as_posix()))
    expected_manifest_paths = expected_inventory - {MANIFEST_PATH}
    _require(set(manifest) == expected_manifest_paths, "Manifest không khớp inventory allowlist")
    for relative, expected_hash in manifest.items():
        actual_hash = _sha256(root / Path(relative.as_posix()))
        _require(actual_hash == expected_hash, f"Manifest hash sai: {relative}")

    for name, expected_hash in SUBMITTED_REFERENCE_SHA256.items():
        packaged = root / Path(SUBMITTED_DOCS_DIR.as_posix()) / name
        _require(_sha256(packaged) == expected_hash, f"Thuyết minh trong package bị thay đổi: {name}")

    for name in VIVA_IMAGE_NAMES:
        width, height = _png_dimensions(root / Path(IMAGES_DIR.as_posix()) / name)
        _require(width >= 1920 and height >= 1080, f"Ảnh quá nhỏ để vấn đáp: {name} ({width}x{height})")
    board = root / Path(DESIGN_BOARD_DIR.as_posix()) / DESIGN_BOARD_NAME
    with board.open("rb") as handle:
        _require(handle.read(5) == b"%PDF-", f"PDF tổng hợp không hợp lệ: {board}")
    f3d = root / Path(PRIMARY_MODEL_DIR.as_posix()) / PACKAGE_F3D_NAME
    with f3d.open("rb") as handle:
        _require(handle.read(2) == b"PK", "F3D không có signature ZIP/Fusion Archive")
    step = root / Path(BACKUP_MODEL_DIR.as_posix()) / PACKAGE_STEP_NAME
    with step.open("rb") as handle:
        _require(b"ISO-10303-21" in handle.read(128), "STEP không có header ISO-10303-21")

    if compare_sources:
        _validate_sources()
        for spec in COPY_SPECS:
            packaged = root / Path(spec.destination.as_posix())
            _require(_sha256(packaged) == _sha256(spec.source), f"Package không còn khớp nguồn mới nhất: {spec.destination}")

    return {
        "verification_result": "passed",
        "package": str(root.resolve()),
        "file_count_including_manifest": len(actual_inventory),
        "manifest_record_count": len(manifest),
        "image_count": len(VIVA_IMAGE_NAMES),
        "strict_allowlist": True,
        "source_comparison": compare_sources,
    }


def build(target: Path) -> dict[str, Any]:
    workspace = WORKSPACE.resolve()
    target = target.resolve()
    _require(target.parent == workspace, "Target package phải là thư mục con trực tiếp của workspace")
    _require(target.name == PACKAGE_NAME, f"Builder chỉ được phép tạo {PACKAGE_NAME}")
    _require(not target.exists(), f"Target đã tồn tại; builder không tự xóa/ghi đè: {target}")

    audits = _validate_sources()
    stage = workspace / f".{target.name}.building-{os.getpid()}-{uuid.uuid4().hex}"
    _require(not stage.exists(), f"Staging path đã tồn tại: {stage}")
    stage.mkdir(parents=False)
    try:
        _copy_allowlist(stage)
        readme = stage / Path(README_PATH.as_posix())
        report = stage / Path(REPORT_PATH.as_posix())
        checklist = stage / Path(CHECKLIST_PATH.as_posix())
        readme.parent.mkdir(parents=True, exist_ok=True)
        report.parent.mkdir(parents=True, exist_ok=True)
        checklist.parent.mkdir(parents=True, exist_ok=True)
        readme.write_text(_readme_text(audits), encoding="utf-8", newline="\n")
        report.write_text(_report_text(audits), encoding="utf-8", newline="\n")
        checklist.write_text(_checklist_text(audits), encoding="utf-8", newline="\n")
        manifest = stage / Path(MANIFEST_PATH.as_posix())
        manifest.write_text(_manifest_text(stage), encoding="utf-8", newline="\n")
        stage_result = _verify_package(stage, compare_sources=True)
        stage.rename(target)
        final_result = _verify_package(target, compare_sources=True)
        final_result["staging_verification"] = stage_result["verification_result"]
        return final_result
    except Exception:
        if stage.exists():
            shutil.rmtree(stage)
        raise


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("build", "verify"))
    parser.add_argument(
        "--no-source-compare",
        action="store_true",
        help="For verify only: verify the package as self-contained without comparing the workspace sources.",
    )
    args = parser.parse_args(list(argv) if argv is not None else None)
    if args.command == "build":
        _require(not args.no_source_compare, "build luôn bắt buộc đối chiếu nguồn")
        result = build(PACKAGE)
    else:
        result = _verify_package(PACKAGE.resolve(), compare_sources=not args.no_source_compare)
    # Keep CLI output portable on Windows consoles whose active code page is
    # not UTF-8. The package files themselves remain UTF-8.
    print(json.dumps(result, ensure_ascii=True, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
