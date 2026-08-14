"""Build and export the Smart Privacy Locker in a live Autodesk Fusion session.

This file is executed inside Fusion through the Autodesk Fusion MCP execute
endpoint.  Fusion uses centimetres internally; all public design values and
all helper arguments in this script are expressed in millimetres.
"""

from __future__ import annotations

import datetime as _dt
import json
import math
import os
import shutil
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import adsk.core
import adsk.fusion


_DEFAULT_WORKSPACE = (
    r"D:\TAI_LIEU_HCMUS_K24\Năm 2 - Kì 3\Vật lý cho Công nghệ thông tin"
    r"\smart-privacy-locker\THUYETMINH"
)


def _resolve_workspace() -> str:
    override = os.environ.get("SPL_THUYETMINH_WORKSPACE")
    if override:
        return os.path.abspath(override)

    # Fusion MCP execute may not define __file__. Normal file/runpy execution
    # does, so prefer the portable relative location and keep an exact fallback.
    script_path = globals().get("__file__")
    if script_path:
        return os.path.abspath(os.path.join(os.path.dirname(script_path), "..", ".."))
    return _DEFAULT_WORKSPACE


WORKSPACE = _resolve_workspace()
OUTPUT_DIR = os.path.join(WORKSPACE, "03_FUSION_BUILD_OUTPUT", "smart_privacy_locker_v2_1")
STAGING_DIR = os.path.join(OUTPUT_DIR, "_staging")
LOG_PATH = os.path.join(WORKSPACE, "03_FUSION_BUILD_OUTPUT", "build_logs", "create_smart_privacy_locker.log")
SUMMARY_PATH = os.path.join(OUTPUT_DIR, "fusion_build_summary.json")

F3D_PATH = os.path.join(OUTPUT_DIR, "Smart_Privacy_Locker_2_1.f3d")
STEP_PATH = os.path.join(OUTPUT_DIR, "Smart_Privacy_Locker_2_1.step")

IMAGE_A = os.path.join(OUTPUT_DIR, "2.1A_Exterior_Closed.png")
IMAGE_B = os.path.join(OUTPUT_DIR, "2.1B_Interior_Open.png")
IMAGE_D = os.path.join(OUTPUT_DIR, "2.1D_Technical_Compartment.png")
IMAGE_E = os.path.join(OUTPUT_DIR, "2.1E_Exploded_View.png")
RAW_ANNOTATED = os.path.join(STAGING_DIR, "raw_annotated_base.png")
RAW_DIMENSION = os.path.join(STAGING_DIR, "raw_dimension_base.png")
RAW_REAR = os.path.join(STAGING_DIR, "raw_rear_view.png")
RAW_LOCK = os.path.join(STAGING_DIR, "raw_lock_detail.png")
RAW_SENSOR = os.path.join(STAGING_DIR, "raw_mc38_detail.png")

IMAGE_WIDTH = 3600
IMAGE_HEIGHT = 2400


_LOG_HANDLE = None


def _mm(value: float) -> float:
    """Convert millimetres to Fusion internal centimetres."""
    return value / 10.0


def _point(x: float, y: float, z: float) -> adsk.core.Point3D:
    return adsk.core.Point3D.create(_mm(x), _mm(y), _mm(z))


def _vector(x: float, y: float, z: float) -> adsk.core.Vector3D:
    return adsk.core.Vector3D.create(x, y, z)


def _identity() -> adsk.core.Matrix3D:
    return adsk.core.Matrix3D.create()


def _ensure_directories() -> None:
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
    if os.path.isdir(STAGING_DIR):
        shutil.rmtree(STAGING_DIR)
    os.makedirs(STAGING_DIR, exist_ok=True)


def _open_log() -> None:
    global _LOG_HANDLE
    _LOG_HANDLE = open(LOG_PATH, "w", encoding="utf-8", newline="\n")


def _log(message: str) -> None:
    stamp = _dt.datetime.now().astimezone().isoformat(timespec="seconds")
    line = f"{stamp} {message}"
    print(line)
    if _LOG_HANDLE is not None:
        _LOG_HANDLE.write(line + "\n")
        _LOG_HANDLE.flush()


def _stage(number: int, text: str) -> None:
    _log(f"[{number:02d}/15] {text}")


def _value(expression: str) -> adsk.core.ValueInput:
    return adsk.core.ValueInput.createByString(expression)


def _make_component(
    parent: adsk.fusion.Component,
    name: str,
) -> Tuple[adsk.fusion.Occurrence, adsk.fusion.Component]:
    occurrence = parent.occurrences.addNewComponent(_identity())
    if not occurrence:
        raise RuntimeError(f"Could not create component {name}")
    occurrence.component.name = name
    return occurrence, occurrence.component


def _ground_static_assembly(logical_root: adsk.fusion.Component) -> int:
    """Ground every occurrence to its parent except the hinged door itself."""

    grounded = 0

    def ground_children(component: adsk.fusion.Component) -> None:
        nonlocal grounded
        occurrences = [
            component.occurrences.item(index)
            for index in range(component.occurrences.count)
        ]
        for occurrence in occurrences:
            occurrence.isGroundToParent = True
            grounded += 1
            ground_children(occurrence.component)

    occurrences = [
        logical_root.occurrences.item(index)
        for index in range(logical_root.occurrences.count)
    ]
    for occurrence in occurrences:
        if occurrence.component.name != "02_Door":
            occurrence.isGroundToParent = True
            grounded += 1
        # Nested parts such as the MC-38 magnet remain fixed relative to the
        # door and therefore still follow the door's revolute joint.
        ground_children(occurrence.component)
    return grounded


def _temporary_box(
    x: float,
    y: float,
    z: float,
    width: float,
    depth: float,
    height: float,
) -> adsk.fusion.BRepBody:
    if min(width, depth, height) <= 0:
        raise ValueError(f"Invalid box size for ({x}, {y}, {z}): {width}, {depth}, {height}")
    center = _point(x + width / 2.0, y + depth / 2.0, z + height / 2.0)
    oriented_box = adsk.core.OrientedBoundingBox3D.create(
        center,
        _vector(1, 0, 0),
        _vector(0, 1, 0),
        _mm(width),
        _mm(depth),
        _mm(height),
    )
    body = adsk.fusion.TemporaryBRepManager.get().createBox(oriented_box)
    if not body:
        raise RuntimeError("TemporaryBRepManager.createBox returned null")
    return body


def _temporary_cylinder(
    start: Tuple[float, float, float],
    end: Tuple[float, float, float],
    radius: float,
) -> adsk.fusion.BRepBody:
    body = adsk.fusion.TemporaryBRepManager.get().createCylinderOrCone(
        _point(*start), _mm(radius), _point(*end), _mm(radius)
    )
    if not body:
        raise RuntimeError(f"Could not create cylinder from {start} to {end}")
    return body


def _persist_bodies(
    component: adsk.fusion.Component,
    feature_name: str,
    named_temporary_bodies: Sequence[Tuple[str, adsk.fusion.BRepBody]],
    appearance: Optional[adsk.core.Appearance] = None,
) -> List[adsk.fusion.BRepBody]:
    base_feature = component.features.baseFeatures.add()
    if not base_feature:
        raise RuntimeError(f"Could not create base feature {feature_name}")
    base_feature.name = feature_name
    if not base_feature.startEdit():
        raise RuntimeError(f"Could not start editing base feature {feature_name}")
    persisted: List[adsk.fusion.BRepBody] = []
    try:
        for body_name, temporary_body in named_temporary_bodies:
            body = component.bRepBodies.add(temporary_body, base_feature)
            if not body:
                raise RuntimeError(f"Could not persist body {body_name}")
            body.name = body_name
            if appearance is not None:
                body.appearance = appearance
            persisted.append(body)
    finally:
        base_feature.finishEdit()
    return persisted


def _add_box(
    component: adsk.fusion.Component,
    body_name: str,
    x: float,
    y: float,
    z: float,
    width: float,
    depth: float,
    height: float,
    appearance: Optional[adsk.core.Appearance] = None,
    cuts: Sequence[Tuple[float, float, float, float, float, float]] = (),
    feature_name: Optional[str] = None,
) -> adsk.fusion.BRepBody:
    temporary = _temporary_box(x, y, z, width, depth, height)
    manager = adsk.fusion.TemporaryBRepManager.get()
    for cut in cuts:
        cutter = _temporary_box(*cut)
        if not manager.booleanOperation(
            temporary, cutter, adsk.fusion.BooleanTypes.DifferenceBooleanType
        ):
            raise RuntimeError(f"Boolean cut failed while creating {body_name}")
    return _persist_bodies(
        component,
        feature_name or f"Feature_{body_name}",
        ((body_name, temporary),),
        appearance,
    )[0]


def _add_box_union(
    component: adsk.fusion.Component,
    body_name: str,
    specs: Sequence[Tuple[float, float, float, float, float, float]],
    appearance: Optional[adsk.core.Appearance] = None,
    feature_name: Optional[str] = None,
) -> adsk.fusion.BRepBody:
    if not specs:
        raise ValueError(f"No box specs supplied for {body_name}")
    manager = adsk.fusion.TemporaryBRepManager.get()
    temporary = _temporary_box(*specs[0])
    for spec in specs[1:]:
        tool = _temporary_box(*spec)
        if not manager.booleanOperation(
            temporary, tool, adsk.fusion.BooleanTypes.UnionBooleanType
        ):
            raise RuntimeError(f"Boolean union failed while creating {body_name}")
    return _persist_bodies(
        component,
        feature_name or f"Feature_{body_name}",
        ((body_name, temporary),),
        appearance,
    )[0]


def _add_box_group(
    component: adsk.fusion.Component,
    feature_name: str,
    specs: Sequence[Tuple[str, float, float, float, float, float, float]],
    appearance: Optional[adsk.core.Appearance] = None,
) -> List[adsk.fusion.BRepBody]:
    transient = [(spec[0], _temporary_box(*spec[1:])) for spec in specs]
    return _persist_bodies(component, feature_name, transient, appearance)


def _add_cylinder(
    component: adsk.fusion.Component,
    body_name: str,
    start: Tuple[float, float, float],
    end: Tuple[float, float, float],
    radius: float,
    appearance: Optional[adsk.core.Appearance] = None,
    feature_name: Optional[str] = None,
) -> adsk.fusion.BRepBody:
    return _persist_bodies(
        component,
        feature_name or f"Feature_{body_name}",
        ((body_name, _temporary_cylinder(start, end, radius)),),
        appearance,
    )[0]


def _add_cylinder_group(
    component: adsk.fusion.Component,
    feature_name: str,
    specs: Sequence[
        Tuple[str, Tuple[float, float, float], Tuple[float, float, float], float]
    ],
    appearance: Optional[adsk.core.Appearance] = None,
) -> List[adsk.fusion.BRepBody]:
    transient = [
        (name, _temporary_cylinder(start, end, radius))
        for name, start, end, radius in specs
    ]
    return _persist_bodies(component, feature_name, transient, appearance)


def _find_library_appearance(
    application: adsk.core.Application,
    keywords: Sequence[str],
) -> Optional[adsk.core.Appearance]:
    lowered = tuple(word.lower() for word in keywords)
    fallback = None
    libraries = application.materialLibraries
    for library_index in range(libraries.count):
        appearances = libraries.item(library_index).appearances
        for appearance_index in range(appearances.count):
            candidate = appearances.item(appearance_index)
            name = candidate.name.lower()
            if fallback is None:
                fallback = candidate
            if any(word in name for word in lowered):
                return candidate
    return fallback


def _make_appearances(
    application: adsk.core.Application,
    design: adsk.fusion.Design,
) -> Dict[str, Optional[adsk.core.Appearance]]:
    definitions = {
        "wood": ("birch", "maple", "wood"),
        "dark": ("matte black", "black", "graphite"),
        "white": ("matte white", "white"),
        "blue": ("blue",),
        "green": ("green",),
        "metal": ("aluminum", "steel"),
        "red": ("red",),
        "orange": ("orange", "yellow"),
        "clear": ("glass", "transparent"),
    }
    result: Dict[str, Optional[adsk.core.Appearance]] = {}
    for role, keywords in definitions.items():
        custom_name = f"SPL_{role.title()}"
        existing = design.appearances.itemByName(custom_name)
        if existing:
            result[role] = existing
            continue
        source = _find_library_appearance(application, keywords)
        result[role] = design.appearances.addByCopy(source, custom_name) if source else None
    return result


def _add_outline_sketch(
    component: adsk.fusion.Component,
    name: str,
    x: float,
    y: float,
    width: float,
    depth: float,
) -> adsk.fusion.Sketch:
    sketch = component.sketches.add(component.xYConstructionPlane)
    sketch.name = name
    rectangle = sketch.sketchCurves.sketchLines.addTwoPointRectangle(
        _point(x, y, 0), _point(x + width, y + depth, 0)
    )
    for index in range(rectangle.count):
        rectangle.item(index).isConstruction = True
    sketch.isVisible = False
    return sketch


def _vertical_edges(body: adsk.fusion.BRepBody) -> adsk.core.ObjectCollection:
    edges = adsk.core.ObjectCollection.create()
    for index in range(body.edges.count):
        edge = body.edges.item(index)
        bounds = edge.boundingBox
        dz = bounds.maxPoint.z - bounds.minPoint.z
        dx = bounds.maxPoint.x - bounds.minPoint.x
        dy = bounds.maxPoint.y - bounds.minPoint.y
        if dz > 0.5 and dx < 1e-5 and dy < 1e-5:
            edges.add(edge)
    return edges


def _add_fillet(
    component: adsk.fusion.Component,
    bodies: Sequence[adsk.fusion.BRepBody],
    radius_expression: str,
    feature_name: str,
) -> adsk.fusion.FilletFeature:
    all_edges = adsk.core.ObjectCollection.create()
    for body in bodies:
        body_edges = _vertical_edges(body)
        for index in range(body_edges.count):
            all_edges.add(body_edges.item(index))
    if all_edges.count == 0:
        raise RuntimeError(f"No vertical edges found for {feature_name}")
    fillets = component.features.filletFeatures
    fillet_input = fillets.createInput()
    if not fillet_input.addConstantRadiusEdgeSet(
        all_edges, _value(radius_expression), False
    ):
        raise RuntimeError(f"Could not define {feature_name}")
    feature = fillets.add(fillet_input)
    if not feature:
        raise RuntimeError(f"Could not create {feature_name}")
    feature.name = feature_name
    return feature


def _create_parameters(design: adsk.fusion.Design) -> None:
    parameters = design.userParameters
    base_parameters = (
        ("LockerWidth", "300 mm", "mm"),
        ("LockerHeight", "250 mm", "mm"),
        ("LockerDepth", "220 mm", "mm"),
        ("PanelThickness", "10 mm", "mm"),
        ("DoorThickness", "10 mm", "mm"),
        ("TechnicalShelfThickness", "10 mm", "mm"),
        ("DoorGap", "1.5 mm", "mm"),
        ("OuterFillet", "5 mm", "mm"),
        ("SmallFillet", "2 mm", "mm"),
        ("StorageClearWidth", "260 mm", "mm"),
        ("StorageClearHeight", "170 mm", "mm"),
        ("StorageClearDepth", "190 mm", "mm"),
        ("DoorOpenAngle", "105 deg", "deg"),
        ("OLEDWindowWidth", "29 mm", "mm"),
        ("OLEDWindowHeight", "15 mm", "mm"),
        ("LEDStripLength", "240 mm", "mm"),
        ("LEDStripWidth", "10 mm", "mm"),
        ("LEDStripThickness", "2.5 mm", "mm"),
    )
    derived_parameters = (
        ("InternalWidth", "LockerWidth - 2 * PanelThickness", "mm"),
        ("InternalHeight", "LockerHeight - 2 * PanelThickness", "mm"),
        ("InternalDepth", "LockerDepth - 2 * PanelThickness", "mm"),
        ("SideServiceMargin", "(InternalWidth - StorageClearWidth) / 2", "mm"),
        ("RearCableVoidDepth", "InternalDepth - StorageClearDepth", "mm"),
        (
            "TechnicalClearHeight",
            "LockerHeight - 2 * PanelThickness - TechnicalShelfThickness - StorageClearHeight",
            "mm",
        ),
        (
            "FrontTechnicalFasciaHeight",
            "PanelThickness + TechnicalClearHeight + TechnicalShelfThickness",
            "mm",
        ),
        ("StorageOpeningWidth", "StorageClearWidth", "mm"),
        ("StorageOpeningHeight", "StorageClearHeight", "mm"),
        ("DoorWidth", "StorageOpeningWidth - 2 * DoorGap", "mm"),
        ("DoorHeight", "StorageOpeningHeight - 2 * DoorGap", "mm"),
    )
    for name, expression, units in base_parameters + derived_parameters:
        parameter = parameters.add(
            name,
            _value(expression),
            units,
            "Smart Privacy Locker design parameter",
        )
        if not parameter:
            raise RuntimeError(f"Could not create user parameter {name}")


def _create_enclosure(
    root: adsk.fusion.Component,
    appearances: Dict[str, Optional[adsk.core.Appearance]],
) -> Tuple[adsk.fusion.Occurrence, adsk.fusion.Component, Dict[str, adsk.fusion.BRepBody]]:
    enclosure_occurrence, enclosure = _make_component(root, "01_Enclosure")
    enclosure_occurrence.isGroundToParent = True
    _add_outline_sketch(enclosure, "Sketch_Enclosure_Base", -150, 0, 300, 220)
    _add_outline_sketch(enclosure, "Sketch_Storage_Opening", -130, 10, 260, 190)

    bodies: Dict[str, adsk.fusion.BRepBody] = {}
    bodies["Left_Panel"] = _add_box(
        enclosure, "Left_Panel", -150, 0, 0, 10, 220, 250, appearances["wood"],
        feature_name="Extrude_Left_Panel"
    )
    bodies["Right_Panel"] = _add_box(
        enclosure, "Right_Panel", 140, 0, 0, 10, 220, 250, appearances["wood"],
        feature_name="Extrude_Right_Panel"
    )
    bodies["Bottom_Panel"] = _add_box(
        enclosure, "Bottom_Panel", -140, 0, 0, 280, 210, 10, appearances["wood"],
        feature_name="Extrude_Bottom_Panel"
    )
    bodies["Top_Panel"] = _add_box(
        enclosure, "Top_Panel", -140, 0, 240, 280, 210, 10, appearances["wood"],
        feature_name="Extrude_Top_Panel"
    )
    bodies["Back_Panel"] = _add_box(
        enclosure,
        "Back_Panel",
        -140,
        210,
        10,
        280,
        10,
        230,
        appearances["wood"],
        # Service cut-outs keep the mounted DC jack and rocker switch from
        # occupying the same closed volume as the plywood rear panel.
        cuts=(
            # 0.2 mm radial/per-side installation clearance.  The exterior
            # retaining hardware added below overlaps the surrounding panel,
            # so neither device is left floating in an oversized opening.
            (72.8, 209, 209.8, 10.4, 12, 10.4),
            (93.8, 209, 200.8, 24.4, 12, 16.4),
        ),
        feature_name="Extrude_Back_Panel"
    )
    bodies["Technical_Shelf"] = _add_box(
        enclosure,
        "Technical_Shelf",
        -140,
        10,
        180,
        280,
        200,
        10,
        appearances["wood"],
        # Dedicated pass-throughs for the latch linkage and the three cable
        # bundles that enter the protected technical compartment.
        cuts=(
            (127, 25, 179, 14, 15, 12),
            (127, 139, 179, 14, 16, 12),
            (118, 65, 179, 20, 38, 12),
            (-19, 141, 179, 17, 19, 12),
            (99, 35, 179, 21, 58, 12),
            (-124, 192, 179, 12, 16, 12),
        ),
        feature_name="Extrude_Technical_Shelf"
    )
    bodies["Front_Technical_Fascia"] = _add_box(
        enclosure,
        "Front_Technical_Fascia",
        -140,
        0,
        180,
        280,
        10,
        60,
        appearances["dark"],
        cuts=((-120.5, -1, 191.5, 241, 12, 47),),
        feature_name="Cut_Technical_Cover_Opening",
    )
    bodies["Left_Service_Channel"] = _add_box(
        enclosure, "Left_Service_Channel", -140, 10, 10, 10, 190, 170,
        appearances["dark"], feature_name="Extrude_Left_Service_Channel"
    )
    bodies["Right_Service_Channel"] = _add_box_union(
        enclosure,
        "Right_Service_Channel",
        (
            # Front reveal closes the visible right-side gap while preserving
            # the intended 1.5 mm clearance around the closed door.
            (130, 0, 10, 10, 10, 170),
            # This narrow rib joins the reveal to the deeper cable channel.
            (139, 10, 10, 1, 30, 170),
            (138, 40, 10, 2, 160, 170),
        ),
        appearances["dark"],
        feature_name="Extrude_Right_Service_Channel_With_Front_Reveal",
    )
    bodies["Rear_Cable_Cover"] = _add_box(
        enclosure, "Rear_Cable_Cover", -130, 200, 10, 260, 5, 170,
        appearances["dark"], feature_name="Extrude_Rear_Cable_Cover"
    )

    # Four fixed bosses give the removable technical cover screws a real
    # receiver.  Each boss is unioned to a short bridge which overlaps the
    # remaining side fascia, making it a connected enclosure-side mount.
    cover_boss_specs = {
        "Cover_Boss_TL": (
            (-116, 8.5, 227, 8, 4, 8),
            (-122, 8.5, 227, 6.5, 1.5, 8),
        ),
        "Cover_Boss_TR": (
            (108, 8.5, 227, 8, 4, 8),
            (115.5, 8.5, 227, 6.5, 1.5, 8),
        ),
        "Cover_Boss_BL": (
            (-116, 8.5, 195, 8, 4, 8),
            (-122, 8.5, 195, 6.5, 1.5, 8),
        ),
        "Cover_Boss_BR": (
            (108, 8.5, 195, 8, 4, 8),
            (115.5, 8.5, 195, 6.5, 1.5, 8),
        ),
    }
    for boss_name, boss_specs in cover_boss_specs.items():
        bodies[boss_name] = _add_box_union(
            enclosure,
            boss_name,
            boss_specs,
            appearances["dark"],
            feature_name=f"Feature_{boss_name}",
        )

    _add_fillet(
        enclosure,
        (bodies["Left_Panel"], bodies["Right_Panel"]),
        "OuterFillet",
        "Fillet_External_Edges",
    )
    return enclosure_occurrence, enclosure, bodies


def _create_door_and_nested_parts(
    root: adsk.fusion.Component,
    appearances: Dict[str, Optional[adsk.core.Appearance]],
) -> Tuple[
    adsk.fusion.Occurrence,
    adsk.fusion.Component,
    adsk.fusion.Occurrence,
    adsk.fusion.Occurrence,
]:
    door_occurrence, door = _make_component(root, "02_Door")
    _add_outline_sketch(door, "Sketch_Door_Profile", -128.5, 0, 257, 10)
    door_body = _add_box(
        door,
        "Door_Panel",
        -128.5,
        0,
        11.5,
        257,
        10,
        167,
        appearances["wood"],
        cuts=((111, -1, 82, 14, 4, 22),),
        feature_name="Cut_Door_Pull_Recess",
    )
    _add_box_group(
        door,
        "Feature_Door_Hinge_Leaves",
        (
            ("Upper_Hinge_Door_Leaf", -134.5, 2, 128, 6, 6, 8),
            ("Lower_Hinge_Door_Leaf", -134.5, 2, 48, 6, 6, 8),
        ),
        appearances["metal"],
    )
    _add_fillet(door, (door_body,), "SmallFillet", "Fillet_Door_Edges")

    magnet_occurrence, magnet = _make_component(door, "09_MC38_Door_Magnet")
    _add_box(
        magnet, "MC38_Door_Magnet", 120.5, 10, 125, 8, 8, 28,
        appearances["white"], feature_name="Feature_MC38_Door_Magnet"
    )

    striker_occurrence, striker = _make_component(door, "05B_Door_Striker")
    _add_box_group(
        striker,
        "Feature_CB2_Door_Striker",
        (
            ("CB2_Door_Striker_Base", 118, 10, 165, 6, 2, 14),
            ("CB2_Door_Striker_Lower_Rail", 124, 10, 165, 4, 2, 3),
            ("CB2_Door_Striker_Upper_Rail", 124, 10, 176, 4, 2, 3),
        ),
        appearances["metal"],
    )
    return door_occurrence, door, magnet_occurrence, striker_occurrence


def _create_hinges(
    root: adsk.fusion.Component,
    appearances: Dict[str, Optional[adsk.core.Appearance]],
) -> Tuple[adsk.fusion.Occurrence, adsk.fusion.Occurrence]:
    occurrences = []
    for name, z0 in (("03_Left_Upper_Hinge", 125), ("04_Left_Lower_Hinge", 45)):
        occurrence, component = _make_component(root, name)
        _add_cylinder(
            component,
            "Hinge_Barrel",
            (-134.5, 5, z0),
            (-134.5, 5, z0 + 25),
            4,
            appearances["metal"],
            feature_name="Feature_Hinge_Barrel",
        )
        _add_box(
            component,
            "Hinge_Frame_Leaf",
            -140,
            2,
            z0 + 14,
            5.5,
            6,
            8,
            appearances["metal"],
            feature_name="Feature_Hinge_Frame_Leaf",
        )
        occurrences.append(occurrence)
    return occurrences[0], occurrences[1]


def _create_lock_and_servo(
    root: adsk.fusion.Component,
    appearances: Dict[str, Optional[adsk.core.Appearance]],
) -> Dict[str, adsk.fusion.Occurrence]:
    result: Dict[str, adsk.fusion.Occurrence] = {}

    lock_occurrence, lock = _make_component(root, "05_Locking_Mechanism")
    result["lock"] = lock_occurrence
    _latch_occurrence, latch = _make_component(lock, "05A_Latch")
    _add_box_group(
        latch,
        "Feature_CB2_Latch",
        (
            ("CB2_Latch", 126, 10, 168, 10, 10, 8),
            ("CB2_Latch_Guide", 130, 18, 166, 8, 18, 12),
            # Directly couples the latch body to the vertical drop linkage.
            # The previous model left a measured 10 mm open mechanical gap.
            ("CB2_Latch_Coupler", 132, 18, 172, 4, 14, 4),
            ("CB2_Linkage_Horizontal", 134, 32, 207, 4, 114, 5),
        ),
        appearances["metal"],
    )
    _add_cylinder(
        latch,
        "CB2_Linkage_Servo_Vertical",
        (134, 146, 172),
        (134, 146, 225),
        2.0,
        appearances["metal"],
        feature_name="Feature_CB2_Linkage_Servo_Vertical",
    )
    _add_cylinder(
        latch,
        "CB2_Linkage_Latch_Drop",
        (134, 32, 174),
        (134, 32, 210),
        2.0,
        appearances["metal"],
        feature_name="Feature_CB2_Linkage_Latch_Drop",
    )

    servo_occurrence, servo = _make_component(root, "06_Servo_SG90")
    result["servo"] = servo_occurrence
    _add_box_group(
        servo,
        "Feature_Servo_SG90_Body",
        (
            ("CB2_Servo_Lock", 104, 140, 196, 23, 12, 24),
            ("Servo_Left_Mounting_Ear", 100, 141, 198, 4, 10, 4),
            ("Servo_Right_Mounting_Ear", 127, 141, 198, 4, 10, 4),
        ),
        appearances["blue"],
    )
    _add_cylinder(
        servo,
        "Servo_Output_Shaft",
        (124, 146, 220),
        (124, 146, 224),
        2.5,
        appearances["metal"],
    )
    _add_box(
        servo,
        "Servo_Horn",
        114,
        144.5,
        224,
        20,
        3,
        2,
        appearances["white"],
        feature_name="Feature_Servo_Horn",
    )
    _add_cylinder_group(
        servo,
        "Feature_Servo_Connector_Pins",
        (
            ("Servo_Pin_PWM", (110, 136, 204), (110, 140, 204), 0.7),
            ("Servo_Pin_5V", (114, 136, 204), (114, 140, 204), 0.7),
            ("Servo_Pin_GND", (118, 136, 204), (118, 140, 204), 0.7),
        ),
        appearances["metal"],
    )

    mount_occurrence, mount = _make_component(root, "07_Servo_Mount")
    result["mount"] = mount_occurrence
    _add_box_group(
        mount,
        "Feature_Servo_Mount",
        (
            ("Servo_Mount_Base", 98, 136, 193, 34, 20, 3),
            ("Servo_Mount_Left_Wall", 98, 136, 196, 3, 20, 28),
            ("Servo_Mount_Right_Wall", 129, 136, 196, 3, 20, 28),
        ),
        appearances["dark"],
    )
    return result


def _create_sensors_and_display(
    root: adsk.fusion.Component,
    appearances: Dict[str, Optional[adsk.core.Appearance]],
) -> Dict[str, adsk.fusion.Occurrence]:
    result: Dict[str, adsk.fusion.Occurrence] = {}

    sensor_occurrence, sensor = _make_component(root, "08_MC38_Frame_Sensor")
    result["mc38"] = sensor_occurrence
    _add_box(
        sensor, "MC38_Frame_Reed_Sensor", 131, 10, 125, 8, 8, 28,
        appearances["white"], feature_name="Feature_MC38_Frame_Reed_Sensor"
    )
    _add_cylinder(
        sensor,
        "MC38_Sensor_Lead",
        (135, 18, 139),
        (135, 35, 155),
        1,
        appearances["red"],
        feature_name="Feature_MC38_Sensor_Lead",
    )
    _add_cylinder(
        sensor,
        "MC38_Ground_Lead",
        (137, 18, 139),
        (137, 37, 155),
        1,
        appearances["dark"],
        feature_name="Feature_MC38_Ground_Lead",
    )

    dht_occurrence, dht = _make_component(root, "10_DHT22")
    result["dht"] = dht_occurrence
    _add_box(
        dht, "DHT22_Body", -7.5, 194, 96, 15, 6, 15,
        appearances["white"], feature_name="Feature_DHT22_Body"
    )
    vent_specs = []
    for index in range(5):
        vent_specs.append((f"DHT22_Vent_{index + 1}", -6 + index * 2.7, 193.5, 99, 1.2, 0.8, 9))
    _add_box_group(dht, "Feature_DHT22_Vents", vent_specs, appearances["dark"])
    _add_cylinder_group(
        dht,
        "Feature_DHT22_Pins",
        (
            ("DHT22_Pin_3V3", (-4, 197, 92), (-4, 197, 96), 0.65),
            ("DHT22_Pin_DATA", (0, 197, 92), (0, 197, 96), 0.65),
            ("DHT22_Pin_GND", (4, 197, 92), (4, 197, 96), 0.65),
        ),
        appearances["metal"],
    )

    oled_occurrence, oled = _make_component(root, "11_OLED_SSD1306")
    result["oled"] = oled_occurrence
    _add_box(oled, "OLED_PCB", -19, 8.5, 203, 38, 4, 23, appearances["blue"])
    _add_box_group(
        oled,
        "Feature_OLED_Bezel_Frame",
        (
            ("OLED_Bezel_Left", -16.5, 0.0, 205, 2, 0.5, 19),
            ("OLED_Bezel_Right", 14.5, 0.0, 205, 2, 0.5, 19),
            ("OLED_Bezel_Top", -14.5, 0.0, 222, 29, 0.5, 2),
            ("OLED_Bezel_Bottom", -14.5, 0.0, 205, 29, 0.5, 2),
        ),
        appearances["dark"],
    )
    _add_box(
        oled, "OLED_Display_Window", -14.5, 0, 207, 29, 0.4, 15,
        appearances["dark"], feature_name="Feature_OLED_Display_Window"
    )
    _add_cylinder_group(
        oled,
        "Feature_OLED_I2C_Pins",
        (
            ("OLED_Pin_3V3", (-6, 12.5, 213), (-6, 16, 213), 0.65),
            ("OLED_Pin_GND", (-2, 12.5, 213), (-2, 16, 213), 0.65),
            ("OLED_Pin_SDA", (2, 12.5, 213), (2, 16, 213), 0.65),
            ("OLED_Pin_SCL", (6, 12.5, 213), (6, 16, 213), 0.65),
        ),
        appearances["metal"],
    )
    return result


def _create_led_strip(
    root: adsk.fusion.Component,
    appearances: Dict[str, Optional[adsk.core.Appearance]],
) -> adsk.fusion.Occurrence:
    occurrence, led = _make_component(root, "12_LED_Strip_WS2812B")
    _add_box(
        led,
        "LED_Strip_Base",
        -120,
        25,
        177.5,
        240,
        10,
        2.5,
        appearances["white"],
        feature_name="Feature_LED_Strip_Base",
    )
    packages = []
    for index in range(12):
        packages.append(
            (f"LED_Package_{index + 1:02d}", -114 + index * 20, 27.5, 175.5, 8, 5, 2)
        )
    _add_box_group(led, "Feature_LED_Packages", packages, appearances["orange"])
    _add_box_group(
        led,
        "Feature_LED_Connection_Pads",
        (
            # Connector tongues project through the front edge of the strip,
            # below the shelf.  Leads then rise through its dedicated cutout.
            ("LED_Pad_5V", 106, 35, 177.8, 4, 3, 2),
            ("LED_Pad_DATA", 110, 35, 177.8, 4, 3, 2),
            ("LED_Pad_GND", 114, 35, 177.8, 4, 3, 2),
        ),
        appearances["metal"],
    )
    return occurrence


def _create_electronics(
    root: adsk.fusion.Component,
    appearances: Dict[str, Optional[adsk.core.Appearance]],
) -> Dict[str, adsk.fusion.Occurrence]:
    result: Dict[str, adsk.fusion.Occurrence] = {}

    esp_occurrence, esp = _make_component(root, "13_ESP32_DevKit")
    result["esp32"] = esp_occurrence
    _add_box(esp, "ESP32_PCB", -27.5, 112, 204, 55, 28, 3, appearances["blue"])
    _add_box(esp, "ESP32_RF_Module", -10, 116, 207, 20, 18, 3, appearances["metal"])
    _add_box(esp, "ESP32_USB_Type_C", -6, 108, 205, 12, 5, 5, appearances["metal"])
    _add_box_group(
        esp,
        "Feature_ESP32_Pin_Headers",
        (
            ("ESP32_Left_Header", -25.5, 113, 207, 3, 26, 4),
            ("ESP32_Right_Header", 22.5, 113, 207, 3, 26, 4),
        ),
        appearances["dark"],
    )
    _add_cylinder_group(
        esp,
        "Feature_ESP32_Breadboard_Standoffs",
        (
            ("ESP32_Standoff_LF", (-24, 116, 203), (-24, 116, 204), 0.8),
            ("ESP32_Standoff_RF", (24, 116, 203), (24, 116, 204), 0.8),
            ("ESP32_Standoff_LR", (-24, 137, 203), (-24, 137, 204), 0.8),
            ("ESP32_Standoff_RR", (24, 137, 203), (24, 137, 204), 0.8),
        ),
        appearances["metal"],
    )
    _add_cylinder_group(
        esp,
        "Feature_ESP32_Logical_Pin_Tails",
        (
            ("ESP32_Pin_5V", (24, 116, 211), (24, 116, 214), 0.65),
            ("ESP32_Pin_GND", (24, 120, 211), (24, 120, 214), 0.65),
            ("ESP32_Pin_CB2_Servo_PWM", (24, 124, 211), (24, 124, 214), 0.65),
            ("ESP32_Pin_CB3_Buzzer", (24, 128, 211), (24, 128, 214), 0.65),
            ("ESP32_Pin_YC3_LED_DATA", (24, 132, 211), (24, 132, 214), 0.65),
            ("ESP32_Pin_YC3_MOSFET_GATE", (24, 136, 211), (24, 136, 214), 0.65),
            ("ESP32_Pin_3V3", (-24, 116, 211), (-24, 116, 214), 0.65),
            ("ESP32_Pin_YC1_DHT_DATA", (-24, 120, 211), (-24, 120, 214), 0.65),
            ("ESP32_Pin_YC1_I2C_SDA", (-24, 124, 211), (-24, 124, 214), 0.65),
            ("ESP32_Pin_YC1_I2C_SCL", (-24, 128, 211), (-24, 128, 214), 0.65),
            ("ESP32_Pin_CB1_MC38", (-24, 132, 211), (-24, 132, 214), 0.65),
        ),
        appearances["metal"],
    )

    breadboard_occurrence, breadboard = _make_component(root, "14_Breadboard_830")
    result["breadboard"] = breadboard_occurrence
    _add_box(
        breadboard, "Breadboard_830_Base", -82.5, 100, 193, 165, 55, 10,
        appearances["white"], feature_name="Feature_Breadboard_830_Base"
    )
    _add_box(
        breadboard,
        "Breadboard_Rail_Red_5V_SW",
        -78,
        104,
        203,
        156,
        2,
        0.8,
        appearances["red"],
        feature_name="Feature_Breadboard_Rail_5V_SW",
    )
    _add_box(
        breadboard,
        "Breadboard_Rail_Blue_GND",
        -78,
        149,
        203,
        156,
        2,
        0.8,
        appearances["blue"],
        feature_name="Feature_Breadboard_Rail_GND",
    )
    _add_box(
        breadboard,
        "Breadboard_Center_Groove",
        -78,
        126.5,
        203,
        156,
        2,
        0.8,
        appearances["dark"],
        feature_name="Feature_Breadboard_Center_Groove",
    )
    # A light-weight two-row hole grid makes the 830-point breadboard
    # identifiable without creating hundreds of expensive cut features.
    hole_markers = []
    for row_index, y_value in enumerate((116.0, 137.0), start=1):
        for column_index in range(18):
            x_value = -73.0 + column_index * 8.6
            hole_markers.append(
                (
                    f"Breadboard_Hole_R{row_index}_C{column_index + 1:02d}",
                    (x_value, y_value, 203.0),
                    (x_value, y_value, 203.5),
                    0.65,
                )
            )
    _add_cylinder_group(
        breadboard,
        "Feature_Breadboard_Simplified_Hole_Grid",
        hole_markers,
        appearances["dark"],
    )

    mosfet_occurrence, mosfet = _make_component(root, "15_MOSFET_D4184")
    result["mosfet"] = mosfet_occurrence
    _add_box(mosfet, "MOSFET_D4184_PCB", 88, 113, 193, 30, 18, 3, appearances["green"])
    _add_box(mosfet, "MOSFET_D4184_Package", 94, 119, 196, 10, 6, 5, appearances["dark"])
    _add_box(mosfet, "MOSFET_Terminal_Block", 106, 115, 196, 10, 14, 6, appearances["blue"])
    _add_cylinder_group(
        mosfet,
        "Feature_MOSFET_Logical_Pins",
        (
            ("MOSFET_Pin_GATE", (96, 121, 201), (96, 121, 204), 0.7),
            ("MOSFET_Pin_SOURCE_GND", (108, 126, 202), (108, 126, 205), 0.7),
            ("MOSFET_Pin_DRAIN_LOAD", (114, 120, 202), (114, 120, 205), 0.7),
        ),
        appearances["metal"],
    )

    buzzer_occurrence, buzzer = _make_component(root, "16_Active_Buzzer")
    result["buzzer"] = buzzer_occurrence
    _add_box(buzzer, "Active_Buzzer_PCB", 98, 58, 193, 24, 24, 3, appearances["green"])
    _add_cylinder(
        buzzer,
        "Active_Buzzer_5V",
        (110, 70, 196),
        (110, 70, 209),
        7,
        appearances["dark"],
        feature_name="Feature_Active_Buzzer_5V",
    )
    _add_cylinder_group(
        buzzer,
        "Feature_Buzzer_Logical_Pins",
        (
            ("Buzzer_Pin_5V", (94, 64, 194.5), (98, 64, 194.5), 0.65),
            ("Buzzer_Pin_GND", (94, 70, 194.5), (98, 70, 194.5), 0.65),
            ("Buzzer_Pin_SIGNAL", (94, 76, 194.5), (98, 76, 194.5), 0.65),
        ),
        appearances["metal"],
    )
    return result


def _create_power_and_cover(
    root: adsk.fusion.Component,
    appearances: Dict[str, Optional[adsk.core.Appearance]],
) -> Dict[str, adsk.fusion.Occurrence]:
    result: Dict[str, adsk.fusion.Occurrence] = {}

    jack_occurrence, jack = _make_component(root, "17_DC_Jack")
    result["jack"] = jack_occurrence
    _add_cylinder(
        jack, "DC_Jack_Barrel", (78, 208, 215), (78, 223, 215), 5,
        appearances["dark"], feature_name="Feature_DC_Jack_Barrel"
    )
    _add_cylinder(jack, "DC_Jack_Flange", (78, 207, 215), (78, 210, 215), 7, appearances["metal"])
    _add_box(
        jack,
        "DC_Jack_Retaining_Nut",
        70.5,
        220,
        207.5,
        15,
        3,
        15,
        appearances["metal"],
        cuts=((72.75, 219.5, 209.75, 10.5, 4, 10.5),),
        feature_name="Feature_DC_Jack_Retaining_Nut",
    )
    _add_cylinder_group(
        jack,
        "Feature_DC_Jack_Logical_Terminals",
        (
            ("DC_Jack_Positive_Terminal", (75, 204, 215), (75, 208, 215), 0.8),
            ("DC_Jack_Ground_Terminal", (81, 204, 215), (81, 208, 215), 0.8),
        ),
        appearances["metal"],
    )

    switch_occurrence, switch = _make_component(root, "18_Power_Switch")
    result["switch"] = switch_occurrence
    _add_box(switch, "Power_Switch_Housing", 94, 210, 201, 24, 10, 16, appearances["dark"])
    # The rocker must protrude through the exterior rear face at y=220 mm.
    # One millimetre remains embedded in the housing for a connected assembly.
    _add_box(switch, "Power_Switch_Rocker", 98, 219, 204, 16, 3, 10, appearances["red"])
    _add_box(
        switch,
        "Power_Switch_Bezel",
        92,
        220,
        199,
        28,
        2,
        20,
        appearances["dark"],
        cuts=((94, 219.5, 201, 24, 3, 16),),
        feature_name="Feature_Power_Switch_Bezel",
    )
    _add_cylinder_group(
        switch,
        "Feature_Power_Switch_Logical_Terminals",
        (
            ("Power_Switch_Input_Terminal", (99, 206, 212), (99, 210, 212), 0.8),
            ("Power_Switch_Output_Terminal", (113, 206, 212), (113, 210, 212), 0.8),
        ),
        appearances["metal"],
    )

    cover_occurrence, cover = _make_component(root, "19_Technical_Compartment_Cover")
    result["cover"] = cover_occurrence
    _add_outline_sketch(cover, "Sketch_OLED_Window", -14.5, 0, 29, 15)
    cuts = [(-14.5, -1, 207, 29, 11, 15)]
    for index in range(4):
        cuts.append((72 + index * 10, -1, 228, 5, 11, 4))
    for screw_x, screw_z in ((-112, 231), (112, 231), (-112, 199), (112, 199)):
        cuts.append((screw_x - 2.5, -1, screw_z - 2.5, 5, 11, 5))
    _add_box(
        cover,
        "Technical_Compartment_Cover",
        -120,
        0.5,
        192,
        240,
        8,
        46,
        appearances["dark"],
        cuts=tuple(cuts),
        feature_name="Cut_OLED_Window_And_Vents",
    )
    screw_specs = (
        ("Cover_Screw_TL", (-112, 0, 231), (-112, 12.5, 231), 2),
        ("Cover_Screw_TR", (112, 0, 231), (112, 12.5, 231), 2),
        ("Cover_Screw_BL", (-112, 0, 199), (-112, 12.5, 199), 2),
        ("Cover_Screw_BR", (112, 0, 199), (112, 12.5, 199), 2),
    )
    _add_cylinder_group(cover, "Feature_Cover_Screws", screw_specs, appearances["metal"])
    _add_cylinder_group(
        cover,
        "Feature_Cover_Screw_Heads",
        (
            ("Cover_Screw_TL_Head", (-112, 0, 231), (-112, 0.8, 231), 3.5),
            ("Cover_Screw_TR_Head", (112, 0, 231), (112, 0.8, 231), 3.5),
            ("Cover_Screw_BL_Head", (-112, 0, 199), (-112, 0.8, 199), 3.5),
            ("Cover_Screw_BR_Head", (112, 0, 199), (112, 0.8, 199), 3.5),
        ),
        appearances["metal"],
    )

    tray_occurrence, tray = _make_component(root, "20_Electronics_Mounting_Tray")
    result["tray"] = tray_occurrence
    _add_box(
        tray,
        "Electronics_Mounting_Tray",
        -120,
        25,
        190,
        240,
        170,
        3,
        appearances["dark"],
        cuts=(
            (98, 77, 189, 22, 33, 6),
            (-21, 134, 189, 19, 21, 6),
            (-124, 190, 189, 14, 18, 6),
        ),
        feature_name="Cut_Tray_Cable_Pass_Throughs",
    )
    _add_box_group(
        tray,
        "Feature_Tray_Mounting_Tabs",
        (
            ("Tray_Tab_FL", -125, 25, 190, 5, 15, 8),
            ("Tray_Tab_FR", 120, 25, 190, 5, 15, 8),
            ("Tray_Tab_RL", -125, 180, 190, 5, 15, 8),
            ("Tray_Tab_RR", 120, 180, 190, 5, 15, 8),
        ),
        appearances["metal"],
    )
    return result


def _create_cable_management(
    root: adsk.fusion.Component,
    appearances: Dict[str, Optional[adsk.core.Appearance]],
) -> Tuple[adsk.fusion.Occurrence, Dict[str, Dict[str, object]]]:
    occurrence, cables = _make_component(root, "21_Cable_Management")
    _add_box_union(
        cables,
        "Left_Cable_Retainer",
        (
            (-130, 198, 45, 5, 2, 30),
            (-125.5, 196, 45, 2, 4, 30),
        ),
        appearances["dark"],
        feature_name="Feature_Left_Cable_Retainer",
    )
    _add_box_union(
        cables,
        "Right_Cable_Retainer",
        (
            (133, 198, 45, 5, 2, 30),
            (129.5, 196, 45, 4, 4, 30),
        ),
        appearances["dark"],
        feature_name="Feature_Right_Cable_Retainer",
    )
    _add_box(
        cables,
        "Rear_Cable_Tray",
        -125,
        205,
        20,
        250,
        3,
        145,
        appearances["dark"],
        feature_name="Feature_Rear_Cable_Tray",
    )

    # Explicit distribution buses.  Their colours and body names are part of
    # the 3D wiring contract used by the fresh-reopen connectivity audit.
    _add_cylinder(
        cables,
        "BUS_5V_SW",
        (-76, 105, 204.45),
        (76, 105, 204.45),
        0.65,
        appearances["red"],
        feature_name="Feature_BUS_5V_SW",
    )
    _add_cylinder(
        cables,
        "BUS_GND",
        (-76, 150, 204.45),
        (76, 150, 204.45),
        0.65,
        appearances["dark"],
        feature_name="Feature_BUS_GND",
    )
    _add_cylinder(
        cables,
        "BUS_3V3",
        (-76, 110, 203.65),
        (-40, 110, 203.65),
        0.65,
        appearances["orange"],
        feature_name="Feature_BUS_3V3",
    )

    route_specs = (
        # Raw DC and switched distribution.  The positive rail must pass
        # through the physical rocker switch; ground returns directly.
        ("PWR_DC_POS_TO_SWITCH", "red", 0.80,
         ((75,204,215),(75,202,218),(86,202,225),(92,202,225),(99,206,212)),
         ("17_DC_Jack","DC_Jack_Positive_Terminal"),
         ("18_Power_Switch","Power_Switch_Input_Terminal"), ("CB1","CB2","CB3","YC1","YC3"), "5V_RAW"),
        ("PWR_SWITCHED_5V_TO_BUS", "red", 0.80,
         ((113,206,212),(124,204,224),(130,166,232),(136,100,232),(136,95,236),(-10,95,236),(-10,105,204.45)),
         ("18_Power_Switch","Power_Switch_Output_Terminal"),
         ("21_Cable_Management","BUS_5V_SW"), ("CB1","CB2","CB3","YC1","YC3"), "5V_SW"),
        ("PWR_DC_NEG_TO_GND_BUS", "dark", 0.80,
         ((81,204,215),(81,198,218),(54,198,224),(44,175,226),(44,155,220),(76,155,218),(76,150,204.45)),
         ("17_DC_Jack","DC_Jack_Ground_Terminal"),
         ("21_Cable_Management","BUS_GND"), ("CB1","CB2","CB3","YC1","YC3"), "GND"),
        ("PWR_ESP32_5V", "red", 0.55,
         ((30,105,204.45),(30,110,215),(24,116,216),(24,116,214)),
         ("21_Cable_Management","BUS_5V_SW"), ("13_ESP32_DevKit","ESP32_Pin_5V"),
         ("CB1","CB2","CB3","YC1","YC3","YC12"), "5V_SW"),
        ("PWR_ESP32_GND", "dark", 0.55,
         ((30,150,204.45),(16,146,215),(16,124,216),(24,120,216),(24,120,214)),
         ("21_Cable_Management","BUS_GND"), ("13_ESP32_DevKit","ESP32_Pin_GND"),
         ("CB1","CB2","CB3","YC1","YC3","YC12"), "GND"),
        ("PWR_ESP32_3V3_FEED", "orange", 0.55,
         ((-24,116,214),(-24,116,216),(-34,110,216),(-40,110,203.65)),
         ("13_ESP32_DevKit","ESP32_Pin_3V3"), ("21_Cable_Management","BUS_3V3"),
         ("CB1","YC1"), "3V3"),

        # CB1: passive reed contact has one signal and one ground conductor.
        ("CB1_MC38_SIG", "green", 0.55,
         ((135,35,155),(133,55,170),(132,75,185),(130,96,195),(130,104,224),(118,112,226),(80,112,234),(40,116,234),(-40,116,232),(-42,140,232),(-30,140,220),(-24,132,216),(-24,132,214)),
         ("08_MC38_Frame_Sensor","MC38_Sensor_Lead"), ("13_ESP32_DevKit","ESP32_Pin_CB1_MC38"),
         ("CB1","YC4","YC6"), "MC38_SIG"),
        ("CB1_MC38_GND", "dark", 0.55,
         ((137,37,155),(135,55,170),(134,75,185),(132,96,195),(134,105,228),(122,118,230),(105,140,234),(-80,140,234),(-80,150,218),(-76,150,204.45)),
         ("08_MC38_Frame_Sensor","MC38_Ground_Lead"), ("21_Cable_Management","BUS_GND"),
         ("CB1","YC4","YC6"), "GND"),

        # CB2: SG90 receives its own 5 V, GND and PWM conductors.
        ("CB2_SERVO_PWM", "orange", 0.55,
         ((24,124,214),(24,124,216),(26,154,230),(48,164,230),(88,165,230),(110,132,230),(110,132,204),(110,136,204)),
         ("13_ESP32_DevKit","ESP32_Pin_CB2_Servo_PWM"), ("06_Servo_SG90","Servo_Pin_PWM"),
         ("CB2",), "SERVO_PWM"),
        ("CB2_SERVO_5V", "red", 0.55,
         ((60,105,204.45),(76,112,222),(90,124,226),(114,128,226),(114,132,204),(114,136,204)),
         ("21_Cable_Management","BUS_5V_SW"), ("06_Servo_SG90","Servo_Pin_5V"),
         ("CB2",), "5V_SW"),
        ("CB2_SERVO_GND", "dark", 0.55,
         ((60,150,204.45),(70,172,224),(94,172,230),(118,132,230),(118,132,204),(118,136,204)),
         ("21_Cable_Management","BUS_GND"), ("06_Servo_SG90","Servo_Pin_GND"),
         ("CB2",), "GND"),

        # CB3: the modeled buzzer is explicitly a 3-pin active module.
        ("CB3_BUZZER_SIG", "green", 0.55,
         ((24,128,214),(24,128,216),(40,112,218),(62,96,220),(82,90,220),(90,76,214),(94,76,194.5)),
         ("13_ESP32_DevKit","ESP32_Pin_CB3_Buzzer"), ("16_Active_Buzzer","Buzzer_Pin_SIGNAL"),
         ("CB3","YC6"), "BUZZER_SIG"),
        ("CB3_BUZZER_5V", "red", 0.55,
         ((45,105,204.45),(64,100,216),(78,84,218),(90,64,214),(94,64,194.5)),
         ("21_Cable_Management","BUS_5V_SW"), ("16_Active_Buzzer","Buzzer_Pin_5V"),
         ("CB3","YC6"), "5V_SW"),
        ("CB3_BUZZER_GND", "dark", 0.55,
         ((50,150,204.45),(54,138,218),(70,122,228),(76,100,228),(84,84,226),(90,70,214),(94,70,194.5)),
         ("21_Cable_Management","BUS_GND"), ("16_Active_Buzzer","Buzzer_Pin_GND"),
         ("CB3","YC6"), "GND"),

        # YC1: DHT22 local sensing and the four-wire I2C OLED path.
        ("YC1_DHT22_3V3", "orange", 0.55,
         ((-4,197,92),(-4,196,88),(-122,196,88),(-122,196,202),(-120,194,208),(-120,170,208),(-100,163,218),(-100,125,222),(-50,110,203.65)),
         ("10_DHT22","DHT22_Pin_3V3"), ("21_Cable_Management","BUS_3V3"), ("YC1",), "3V3"),
        ("YC1_DHT22_DATA", "green", 0.55,
         ((0,197,92),(0,197.5,84),(-119,197.5,84),(-119,197.5,205),(-117,194,211),(-117,170,211),(-96,166,220),(-70,155,224),(-48,150,220),(-34,130,218),(-24,120,216),(-24,120,214)),
         ("10_DHT22","DHT22_Pin_DATA"), ("13_ESP32_DevKit","ESP32_Pin_YC1_DHT_DATA"), ("YC1",), "DHT_DATA"),
        ("YC1_DHT22_GND", "dark", 0.55,
         ((4,197,92),(4,199,80),(-116,199,80),(-116,199,208),(-114,194,214),(-114,170,214),(-92,171,222),(-75,175,226),(-70,150,204.45)),
         ("10_DHT22","DHT22_Pin_GND"), ("21_Cable_Management","BUS_GND"), ("YC1",), "GND"),
        ("YC1_OLED_3V3", "orange", 0.55,
         ((-6,16,213),(-10,55,218),(-26,92,220),(-60,110,218),(-60,110,203.65)),
         ("11_OLED_SSD1306","OLED_Pin_3V3"), ("21_Cable_Management","BUS_3V3"), ("YC1",), "3V3"),
        ("YC1_OLED_GND", "dark", 0.55,
         ((-2,16,213),(-5,55,220),(-18,95,222),(-60,145,220),(-60,150,204.45)),
         ("11_OLED_SSD1306","OLED_Pin_GND"), ("21_Cable_Management","BUS_GND"), ("YC1",), "GND"),
        ("YC1_OLED_SDA", "blue", 0.55,
         ((2,16,213),(5,55,218),(0,90,220),(-12,110,220),(-24,124,216),(-24,124,214)),
         ("11_OLED_SSD1306","OLED_Pin_SDA"), ("13_ESP32_DevKit","ESP32_Pin_YC1_I2C_SDA"), ("YC1",), "I2C_SDA"),
        ("YC1_OLED_SCL", "blue", 0.55,
         ((6,16,213),(10,55,220),(8,92,222),(-8,112,222),(-24,128,216),(-24,128,214)),
         ("11_OLED_SSD1306","OLED_Pin_SCL"), ("13_ESP32_DevKit","ESP32_Pin_YC1_I2C_SCL"), ("YC1",), "I2C_SCL"),

        # YC3: WS2812B data is direct from ESP32; D4184 switches the LED
        # ground path.  This avoids the old ambiguous LED-to-MOSFET tube.
        ("YC3_LED_5V", "red", 0.55,
         ((108,38,178.8),(108,42,178.8),(108,60,185),(108,88,190),(104,98,216),(96,90,226),(96,90,232),(68,90,232),(68,105,204.45)),
         ("12_LED_Strip_WS2812B","LED_Pad_5V"), ("21_Cable_Management","BUS_5V_SW"), ("YC3",), "5V_SW"),
        ("YC3_LED_DATA", "green", 0.55,
         ((112,38,178.8),(112,42,178.8),(112,60,185),(112,88,190),(108,98,218),(80,100,222),(60,110,226),(40,128,224),(24,132,216),(24,132,214)),
         ("12_LED_Strip_WS2812B","LED_Pad_DATA"), ("13_ESP32_DevKit","ESP32_Pin_YC3_LED_DATA"), ("YC3",), "WS2812_DATA"),
        ("YC3_LED_GND_TO_MOSFET_LOAD", "dark", 0.55,
         ((116,38,178.8),(116,42,178.8),(116,60,185),(116,88,190),(116,100,216),(120,108,216),(114,120,208),(114,120,205)),
         ("12_LED_Strip_WS2812B","LED_Pad_GND"), ("15_MOSFET_D4184","MOSFET_Pin_DRAIN_LOAD"), ("YC3",), "LED_GND_SWITCHED"),
        ("YC3_MOSFET_SOURCE_TO_GND", "dark", 0.55,
         ((108,126,205),(108,126,208),(86,140,216),(70,146,218),(68,150,204.45)),
         ("15_MOSFET_D4184","MOSFET_Pin_SOURCE_GND"), ("21_Cable_Management","BUS_GND"), ("YC3",), "GND"),
        ("YC3_MOSFET_GATE", "orange", 0.55,
         ((96,121,204),(96,121,208),(82,118,216),(62,136,222),(44,144,222),(24,136,216),(24,136,214)),
         ("15_MOSFET_D4184","MOSFET_Pin_GATE"), ("13_ESP32_DevKit","ESP32_Pin_YC3_MOSFET_GATE"), ("YC3",), "MOSFET_GATE"),
    )

    grouped_specs: Dict[str, List[Tuple[str, Tuple[float, float, float], Tuple[float, float, float], float]]] = {}
    routing_contract: Dict[str, Dict[str, object]] = {}
    for route_name, colour, radius, points, source, target, function_ids, net_name in route_specs:
        segment_names = []
        for segment_index in range(len(points) - 1):
            body_name = f"{route_name}_S{segment_index + 1:02d}"
            grouped_specs.setdefault(colour, []).append(
                (body_name, points[segment_index], points[segment_index + 1], radius)
            )
            segment_names.append(body_name)
        routing_contract[route_name] = {
            "net": net_name,
            "colour": colour,
            "radius_mm": radius,
            "points_mm": [list(point) for point in points],
            "segment_bodies": segment_names,
            "source": list(source),
            "target": list(target),
            "functional_ids": list(function_ids),
        }

    for colour, specs in grouped_specs.items():
        _add_cylinder_group(
            cables,
            f"Feature_Wiring_{colour.title()}",
            tuple(specs),
            appearances[colour],
        )
    return occurrence, routing_contract


def _create_door_joint(
    design: adsk.fusion.Design,
    root: adsk.fusion.Component,
    enclosure_occurrence: adsk.fusion.Occurrence,
    door_occurrence: adsk.fusion.Occurrence,
) -> adsk.fusion.AsBuiltJoint:
    axis_sketch = root.sketches.add(root.xYConstructionPlane)
    axis_sketch.name = "Sketch_Door_Hinge_Axis"
    axis_sketch.is3D = True
    axis_line = axis_sketch.sketchCurves.sketchLines.addByTwoPoints(
        _point(-134.5, 5, 0), _point(-134.5, 5, 250)
    )
    axis_line.isConstruction = True
    axis_sketch.isVisible = False
    geometry = adsk.fusion.JointGeometry.createByCurve(
        axis_line, adsk.fusion.JointKeyPointTypes.MiddleKeyPoint
    )
    if not geometry:
        raise RuntimeError("Could not create joint geometry")
    joint_input = root.asBuiltJoints.createInput(
        enclosure_occurrence, door_occurrence, geometry
    )
    if not joint_input:
        raise RuntimeError("Could not create as-built joint input")
    if not joint_input.setAsRevoluteJointMotion(
        adsk.fusion.JointDirections.CustomJointDirection, axis_line
    ):
        raise RuntimeError("Could not configure revolute joint motion")
    joint = root.asBuiltJoints.add(joint_input)
    if not joint:
        raise RuntimeError("Could not create door revolute joint")
    joint.name = "Joint_Door_Revolute"
    motion = adsk.fusion.RevoluteJointMotion.cast(joint.jointMotion)
    if not motion:
        raise RuntimeError("Door joint did not produce RevoluteJointMotion")
    limits = motion.rotationLimits
    door_angle_parameter = design.userParameters.itemByName("DoorOpenAngle")
    if not door_angle_parameter:
        raise RuntimeError("DoorOpenAngle user parameter is unavailable")
    limits.minimumValue = 0.0
    limits.maximumValue = door_angle_parameter.value
    limits.restValue = 0.0
    limits.isMinimumValueEnabled = True
    limits.isMaximumValueEnabled = True
    # Enabling a rest value causes Fusion to snap back to 0 degrees whenever
    # the design recomputes, which prevents an API-driven 105-degree pose.
    limits.isRestValueEnabled = False
    motion.rotationValue = 0.0
    return joint


def _set_joint_angle(joint: adsk.fusion.AsBuiltJoint, degrees: float) -> None:
    motion = adsk.fusion.RevoluteJointMotion.cast(joint.jointMotion)
    if not motion:
        raise RuntimeError("Door joint motion is unavailable")
    motion.rotationValue = math.radians(degrees)
    adsk.doEvents()


def _set_camera(
    viewport: adsk.core.Viewport,
    eye: Tuple[float, float, float],
    target: Tuple[float, float, float],
    up: Tuple[float, float, float] = (0, 0, 1),
    perspective: bool = True,
    margin_factor: float = 1.12,
) -> None:
    camera = viewport.camera
    camera.eye = _point(*eye)
    camera.target = _point(*target)
    camera.upVector = _vector(*up)
    camera.cameraType = (
        adsk.core.CameraTypes.PerspectiveCameraType
        if perspective
        else adsk.core.CameraTypes.OrthographicCameraType
    )
    camera.isFitView = True
    camera.isSmoothTransition = False
    viewport.camera = camera
    adsk.doEvents()
    if not viewport.fit():
        raise RuntimeError("Fusion viewport.fit() failed")
    adsk.doEvents()
    # Fusion's fit-view can leave anti-aliased edge pixels exactly on the
    # raster boundary.  Expand the fitted view so every report image has a
    # deliberate neutral margin and no part is visually cropped.
    fitted_camera = viewport.camera
    fitted_camera.isFitView = False
    fitted_camera.viewExtents = fitted_camera.viewExtents * margin_factor
    viewport.camera = fitted_camera
    adsk.doEvents()
    viewport.refresh()


def _save_named_view(
    design: adsk.fusion.Design,
    viewport: adsk.core.Viewport,
    name: str,
) -> None:
    existing = None
    for index in range(design.namedViews.count):
        candidate = design.namedViews.item(index)
        if candidate.name == name:
            existing = candidate
            break
    if existing and not existing.isBuiltIn:
        existing.deleteMe()

    # Fusion archive import can multiply the eye-to-target distance of a
    # stored perspective camera.  The rendered PNG still looks correct in the
    # source session, but applying that Named View after reopening the F3D can
    # make the locker appear as a tiny dot.  Store an equivalent orthographic
    # camera instead: its framing is governed by viewExtents and is stable
    # across export/import.  The active viewport remains perspective, so the
    # report images keep their intended appearance.
    named_camera = viewport.camera
    if named_camera.cameraType != adsk.core.CameraTypes.OrthographicCameraType:
        distance = named_camera.eye.distanceTo(named_camera.target)
        perspective_angle = named_camera.perspectiveAngle
        named_camera.cameraType = adsk.core.CameraTypes.OrthographicCameraType
        named_camera.isFitView = False
        named_camera.isSmoothTransition = False
        named_camera.viewExtents = (
            2.0 * distance * math.tan(perspective_angle / 2.0) * 1.15
        )
    created = design.namedViews.add(named_camera, name)
    if not created:
        raise RuntimeError(f"Could not create named view {name}")


def _save_image(viewport: adsk.core.Viewport, path: str) -> None:
    options = adsk.core.SaveImageFileOptions.create(path)
    options.width = IMAGE_WIDTH
    options.height = IMAGE_HEIGHT
    options.isBackgroundTransparent = True
    options.isAntiAliased = True
    if not viewport.saveAsImageFileWithOptions(options):
        raise RuntimeError(f"Fusion could not save image {path}")
    if not os.path.isfile(path) or os.path.getsize(path) == 0:
        raise RuntimeError(f"Fusion produced a missing or empty image {path}")


def _create_named_views_and_images(
    design: adsk.fusion.Design,
    root: adsk.fusion.Component,
    joint: adsk.fusion.AsBuiltJoint,
    occurrences: Dict[str, adsk.fusion.Occurrence],
    enclosure_bodies: Dict[str, adsk.fusion.BRepBody],
) -> Dict[str, str]:
    application = adsk.core.Application.get()
    viewport = application.activeViewport
    viewport.visualStyle = adsk.core.VisualStyles.ShadedWithVisibleEdgesOnlyVisualStyle

    # Report images must not contain the modeling grid, origin axes, or joint
    # glyphs.  The built-in grid toggle is a two-item list control in Fusion
    # 2704; select its explicit Grid Off item so reruns remain idempotent.
    grid_command = application.userInterface.commandDefinitions.itemById(
        "ViewLayoutGridOnCommand"
    )
    grid_definition = adsk.core.ListControlDefinition.cast(
        grid_command.controlDefinition
    )
    if grid_definition:
        for item_index in range(grid_definition.listItems.count):
            item = grid_definition.listItems.item(item_index)
            if item.name.lower() == "grid off" and not item.isSelected:
                item.isSelected = True
                break
    for component_index in range(design.allComponents.count):
        component = design.allComponents.item(component_index)
        component.isOriginFolderLightBulbOn = False
        component.isConstructionFolderLightBulbOn = False
        component.isJointsFolderLightBulbOn = False
    joint.isLightBulbOn = False
    adsk.doEvents()

    cover = occurrences["cover"]
    door = occurrences["door"]
    cover.isLightBulbOn = True
    door.isLightBulbOn = True
    _set_joint_angle(joint, 0)
    _set_camera(viewport, (480, -520, 360), (0, 95, 125))
    _save_named_view(design, viewport, "01_Exterior_Closed")
    _save_named_view(design, viewport, "Door_Closed_0deg")
    _save_named_view(design, viewport, "VIVA_00_START_HERE")
    _save_named_view(design, viewport, "VIVA_02_Exterior_Closed_Isometric")
    _save_image(viewport, IMAGE_A)

    _set_camera(viewport, (0, -620, 135), (0, 100, 125), perspective=False)
    _save_named_view(design, viewport, "02_Exterior_Front")
    _save_named_view(design, viewport, "VIVA_01_Exterior_Front")
    _save_named_view(design, viewport, "VIVA_06_Dimension_Front")
    _save_named_view(design, viewport, "VIVA_13_Annotated_OLED_Context")
    _save_image(viewport, RAW_DIMENSION)

    _set_camera(viewport, (420, 620, 330), (0, 110, 145))
    _save_named_view(design, viewport, "03_Exterior_Rear")
    _save_named_view(design, viewport, "VIVA_05_Rear_Power")
    _save_named_view(design, viewport, "VIVA_12_Annotated_Power_Context")
    _save_image(viewport, RAW_REAR)

    cover.isLightBulbOn = False
    _set_joint_angle(joint, 105)
    _set_camera(viewport, (440, -590, 285), (-35, 65, 125))
    _save_named_view(design, viewport, "04_Interior_Open")
    _save_named_view(design, viewport, "Door_Open_105deg")
    _save_named_view(design, viewport, "VIVA_03_Interior_Open")
    _save_named_view(design, viewport, "VIVA_08_Annotated_Interior_Context")
    _save_image(viewport, IMAGE_B)
    _save_image(viewport, RAW_ANNOTATED)

    _set_camera(viewport, (0, -620, 145), (0, 110, 125), perspective=False)
    _save_named_view(design, viewport, "05_Interior_Front")

    enclosure_proxy = occurrences["enclosure"].createForAssemblyContext(
        occurrences["locker_root"]
    )
    if not enclosure_proxy:
        raise RuntimeError("Could not create root-context enclosure proxy for technical view")
    top_panel = enclosure_bodies["Top_Panel"].createForAssemblyContext(enclosure_proxy)
    front_fascia = enclosure_bodies["Front_Technical_Fascia"].createForAssemblyContext(
        enclosure_proxy
    )
    if not top_panel or not front_fascia:
        raise RuntimeError("Could not create enclosure body proxies for technical view")
    top_panel.isLightBulbOn = False
    front_fascia.isLightBulbOn = False
    door.isLightBulbOn = False
    adsk.doEvents()
    _set_camera(viewport, (350, -330, 500), (5, 120, 208), margin_factor=1.08)
    _save_named_view(design, viewport, "06_Technical_Compartment")
    _save_named_view(design, viewport, "Technical_Compartment_Cover_Removed")
    _save_named_view(design, viewport, "VIVA_04_Technical_Compartment")
    _save_named_view(design, viewport, "VIVA_09_Annotated_Electronics_Context")
    _save_named_view(design, viewport, "VIVA_14_Annotated_DHT_LED_Context")
    _save_image(viewport, IMAGE_D)
    top_panel.isLightBulbOn = True
    front_fascia.isLightBulbOn = True
    door.isLightBulbOn = True
    adsk.doEvents()

    _set_camera(viewport, (430, -350, 330), (122, 85, 195))
    _save_named_view(design, viewport, "07_Locking_Mechanism_Detail")
    _save_named_view(design, viewport, "VIVA_10_Annotated_Lock_Context")
    _save_image(viewport, RAW_LOCK)

    _set_camera(viewport, (430, -380, 270), (128, 20, 140))
    _save_named_view(design, viewport, "08_MC38_Detail")
    _save_named_view(design, viewport, "VIVA_11_Annotated_MC38_Context")
    _save_image(viewport, RAW_SENSOR)

    _set_joint_angle(joint, 0)
    cover.isLightBulbOn = True
    exploded_keys = (
        "door",
        "upper_hinge",
        "lower_hinge",
        "cover",
        "tray",
        "breadboard",
        "esp32",
        "mosfet",
        "servo",
        "mc38",
        "dht",
        "oled",
        "led",
    )
    translations = {
        "door": (-80, -85, 0),
        "upper_hinge": (-45, -35, 18),
        "lower_hinge": (-45, -35, -18),
        "cover": (0, -75, 25),
        "tray": (0, -25, 38),
        "breadboard": (0, -35, 55),
        "esp32": (-28, -42, 78),
        "mosfet": (34, -42, 75),
        "servo": (65, -28, 45),
        "mc38": (38, -20, 0),
        "dht": (0, -35, 0),
        "oled": (0, -60, 25),
        "led": (0, -35, -22),
    }
    saved_transforms: Dict[str, adsk.core.Matrix3D] = {}
    exploded_occurrences: Dict[str, adsk.fusion.Occurrence] = {}
    assembly_root_occurrence = occurrences["locker_root"]
    joint.isSuppressed = True
    for key in exploded_keys:
        occurrence = occurrences[key].createForAssemblyContext(assembly_root_occurrence)
        if not occurrence:
            raise RuntimeError(f"Could not create root-context proxy for exploded component {key}")
        exploded_occurrences[key] = occurrence
        saved_transforms[key] = occurrence.transform2.copy()
        matrix = occurrence.transform2.copy()
        translation = matrix.translation
        dx, dy, dz = translations[key]
        matrix.translation = adsk.core.Vector3D.create(
            translation.x + _mm(dx), translation.y + _mm(dy), translation.z + _mm(dz)
        )
        occurrence.transform2 = matrix
    adsk.doEvents()
    _set_camera(viewport, (590, -720, 430), (-30, 60, 145))
    _save_named_view(design, viewport, "09_Exploded_View")
    _save_image(viewport, IMAGE_E)
    for key in exploded_keys:
        exploded_occurrences[key].transform2 = saved_transforms[key]
    joint.isSuppressed = False
    _set_joint_angle(joint, 0)
    cover.isLightBulbOn = True
    adsk.doEvents()

    _set_camera(viewport, (0, -620, 135), (0, 100, 125), perspective=False)
    _save_named_view(design, viewport, "10_Dimensioned_View")

    _set_camera(viewport, (620, 100, 145), (0, 100, 125), perspective=False)
    _save_named_view(design, viewport, "VIVA_07_Dimension_Side")

    return {
        "2.1A_Exterior_Closed.png": IMAGE_A,
        "2.1B_Interior_Open.png": IMAGE_B,
        "2.1D_Technical_Compartment.png": IMAGE_D,
        "2.1E_Exploded_View.png": IMAGE_E,
        "raw_annotated_base.png": RAW_ANNOTATED,
        "raw_dimension_base.png": RAW_DIMENSION,
        "raw_rear_view.png": RAW_REAR,
        "raw_lock_detail.png": RAW_LOCK,
        "raw_mc38_detail.png": RAW_SENSOR,
    }


def _feature_health(design: adsk.fusion.Design) -> List[Dict[str, str]]:
    issues: List[Dict[str, str]] = []
    healthy = adsk.fusion.FeatureHealthStates.HealthyFeatureHealthState
    unknown = adsk.fusion.FeatureHealthStates.UnknownFeatureHealthState
    timeline = design.timeline
    for index in range(timeline.count):
        timeline_object = timeline.item(index)
        entity = timeline_object.entity
        if entity is None or not hasattr(entity, "healthState"):
            continue
        state = entity.healthState
        if state in (healthy, unknown):
            continue
        message = getattr(entity, "errorOrWarningMessage", "") or ""
        issues.append(
            {
                "index": str(index),
                "name": getattr(entity, "name", entity.objectType),
                "state": str(state),
                "message": message,
            }
        )
    return issues


def _bounding_box_mm(root: adsk.fusion.Component) -> Dict[str, float]:
    bounds = root.boundingBox
    return {
        "min_x": round(bounds.minPoint.x * 10.0, 4),
        "min_y": round(bounds.minPoint.y * 10.0, 4),
        "min_z": round(bounds.minPoint.z * 10.0, 4),
        "max_x": round(bounds.maxPoint.x * 10.0, 4),
        "max_y": round(bounds.maxPoint.y * 10.0, 4),
        "max_z": round(bounds.maxPoint.z * 10.0, 4),
        "width": round((bounds.maxPoint.x - bounds.minPoint.x) * 10.0, 4),
        "depth": round((bounds.maxPoint.y - bounds.minPoint.y) * 10.0, 4),
        "height": round((bounds.maxPoint.z - bounds.minPoint.z) * 10.0, 4),
    }


def _body_box_mm(body: adsk.fusion.BRepBody) -> Dict[str, float]:
    bounds = body.boundingBox
    return {
        "min_x": round(bounds.minPoint.x * 10.0, 4),
        "min_y": round(bounds.minPoint.y * 10.0, 4),
        "min_z": round(bounds.minPoint.z * 10.0, 4),
        "max_x": round(bounds.maxPoint.x * 10.0, 4),
        "max_y": round(bounds.maxPoint.y * 10.0, 4),
        "max_z": round(bounds.maxPoint.z * 10.0, 4),
        "width": round((bounds.maxPoint.x - bounds.minPoint.x) * 10.0, 4),
        "depth": round((bounds.maxPoint.y - bounds.minPoint.y) * 10.0, 4),
        "height": round((bounds.maxPoint.z - bounds.minPoint.z) * 10.0, 4),
    }


def _component_by_name(
    components: Sequence[adsk.fusion.Component],
    name: str,
) -> adsk.fusion.Component:
    for component in components:
        if component.name == name:
            return component
    raise RuntimeError(f"Missing component for closure audit: {name}")


def _body_by_name(
    components: Sequence[adsk.fusion.Component],
    component_name: str,
    body_name: str,
) -> adsk.fusion.BRepBody:
    component = _component_by_name(components, component_name)
    body = component.bRepBodies.itemByName(body_name)
    if not body:
        raise RuntimeError(f"Missing body {component_name}/{body_name}")
    return body


def _assembly_body_by_name(
    design: adsk.fusion.Design,
    component_name: str,
    body_name: str,
) -> adsk.fusion.BRepBody:
    root = design.rootComponent
    for occurrence_index in range(root.allOccurrences.count):
        occurrence = root.allOccurrences.item(occurrence_index)
        if occurrence.component.name != component_name:
            continue
        for body_index in range(occurrence.bRepBodies.count):
            body = occurrence.bRepBodies.item(body_index)
            if body.name == body_name:
                return body
    raise RuntimeError(f"Missing assembly body {component_name}/{body_name}")


def _minimum_distance_mm(
    first: adsk.core.Base,
    second: adsk.core.Base,
) -> float:
    result = adsk.core.Application.get().measureManager.measureMinimumDistance(first, second)
    if not result:
        raise RuntimeError("Fusion minimum-distance measurement returned null")
    return round(result.value * 10.0, 6)


def _routing_connectivity_audit(
    design: adsk.fusion.Design,
    components: Sequence[adsk.fusion.Component],
    routing_contract: Dict[str, Dict[str, object]],
) -> Dict[str, object]:
    required_routes = {
        "PWR_DC_POS_TO_SWITCH",
        "PWR_SWITCHED_5V_TO_BUS",
        "PWR_DC_NEG_TO_GND_BUS",
        "PWR_ESP32_5V",
        "PWR_ESP32_GND",
        "PWR_ESP32_3V3_FEED",
        "CB1_MC38_SIG",
        "CB1_MC38_GND",
        "CB2_SERVO_PWM",
        "CB2_SERVO_5V",
        "CB2_SERVO_GND",
        "CB3_BUZZER_SIG",
        "CB3_BUZZER_5V",
        "CB3_BUZZER_GND",
        "YC1_DHT22_3V3",
        "YC1_DHT22_DATA",
        "YC1_DHT22_GND",
        "YC1_OLED_3V3",
        "YC1_OLED_GND",
        "YC1_OLED_SDA",
        "YC1_OLED_SCL",
        "YC3_LED_5V",
        "YC3_LED_DATA",
        "YC3_LED_GND_TO_MOSFET_LOAD",
        "YC3_MOSFET_SOURCE_TO_GND",
        "YC3_MOSFET_GATE",
    }
    actual_routes = set(routing_contract)
    if actual_routes != required_routes:
        raise RuntimeError(
            "Routing contract mismatch: "
            f"missing={sorted(required_routes - actual_routes)}, "
            f"unexpected={sorted(actual_routes - required_routes)}"
        )

    endpoint_rows = []
    continuity_rows = []
    expected_segment_bodies = set()
    for route_name in sorted(routing_contract):
        route = routing_contract[route_name]
        segment_names = list(route["segment_bodies"])
        if not segment_names:
            raise RuntimeError(f"Route {route_name} has no segment bodies")
        expected_segment_bodies.update(segment_names)
        segment_bodies = []
        for segment_name in segment_names:
            segment = _assembly_body_by_name(
                design, "21_Cable_Management", segment_name
            )
            segment_bodies.append(segment)

        source_component, source_body_name = route["source"]
        target_component, target_body_name = route["target"]
        source_body = _assembly_body_by_name(
            design, str(source_component), str(source_body_name)
        )
        target_body = _assembly_body_by_name(
            design, str(target_component), str(target_body_name)
        )
        source_gap = _minimum_distance_mm(segment_bodies[0], source_body)
        target_gap = _minimum_distance_mm(segment_bodies[-1], target_body)
        if source_gap > 0.1 or target_gap > 0.1:
            raise RuntimeError(
                f"Route {route_name} endpoint gap failed: "
                f"source={source_gap} mm, target={target_gap} mm"
            )
        endpoint_rows.append(
            {
                "route": route_name,
                "source": route["source"],
                "target": route["target"],
                "source_gap_mm": source_gap,
                "target_gap_mm": target_gap,
            }
        )

        route_max_gap = 0.0
        for index in range(len(segment_bodies) - 1):
            gap = _minimum_distance_mm(segment_bodies[index], segment_bodies[index + 1])
            route_max_gap = max(route_max_gap, gap)
            if gap > 0.01:
                raise RuntimeError(
                    f"Route {route_name} is discontinuous between "
                    f"{segment_names[index]} and {segment_names[index + 1]}: {gap} mm"
                )
        continuity_rows.append(
            {
                "route": route_name,
                "segment_count": len(segment_bodies),
                "maximum_internal_gap_mm": round(route_max_gap, 6),
            }
        )

    actual_segment_bodies = {
        body.name
        for occurrence_index in range(design.rootComponent.allOccurrences.count)
        for occurrence in (design.rootComponent.allOccurrences.item(occurrence_index),)
        if occurrence.component.name == "21_Cable_Management"
        for body_index in range(occurrence.bRepBodies.count)
        for body in (occurrence.bRepBodies.item(body_index),)
        if "_S" in body.name and body.name[-2:].isdigit()
    }
    if actual_segment_bodies != expected_segment_bodies:
        raise RuntimeError(
            "Orphan or missing cable segments: "
            f"missing={sorted(expected_segment_bodies - actual_segment_bodies)}, "
            f"orphan={sorted(actual_segment_bodies - expected_segment_bodies)}"
        )

    # Explicit graph invariants prevent the old jack-to-load bypass and prove
    # that the switch is the only positive path feeding the 5 V bus.
    if routing_contract["PWR_DC_POS_TO_SWITCH"]["target"] != [
        "18_Power_Switch", "Power_Switch_Input_Terminal"
    ]:
        raise RuntimeError("Raw positive power does not terminate at the switch input")
    if routing_contract["PWR_SWITCHED_5V_TO_BUS"]["source"] != [
        "18_Power_Switch", "Power_Switch_Output_Terminal"
    ]:
        raise RuntimeError("Switched 5 V does not originate at the switch output")
    return {
        "status": "PASS",
        "route_count": len(routing_contract),
        "segment_body_count": len(expected_segment_bodies),
        "endpoint_tolerance_mm": 0.1,
        "continuity_tolerance_mm": 0.01,
        "endpoint_results": endpoint_rows,
        "continuity_results": continuity_rows,
        "topology": {
            "positive": "DC jack -> power switch -> BUS_5V_SW",
            "negative": "DC jack -> BUS_GND",
            "pin_level_qualifier": (
                "Logical CAD pin names are verified geometrically; numeric ESP32 GPIO "
                "assignment remains a firmware/pinout decision outside the submitted report."
            ),
        },
    }


def _mechanical_integration_audit(
    design: adsk.fusion.Design,
    components: Sequence[adsk.fusion.Component],
) -> Dict[str, object]:
    contact_pairs = (
        ("latch_coupler_to_latch", "05A_Latch", "CB2_Latch_Coupler", "05A_Latch", "CB2_Latch"),
        ("latch_coupler_to_drop", "05A_Latch", "CB2_Latch_Coupler", "05A_Latch", "CB2_Linkage_Latch_Drop"),
        ("jack_flange_to_back_panel", "17_DC_Jack", "DC_Jack_Flange", "01_Enclosure", "Back_Panel"),
        ("jack_nut_to_back_panel", "17_DC_Jack", "DC_Jack_Retaining_Nut", "01_Enclosure", "Back_Panel"),
        ("switch_bezel_to_back_panel", "18_Power_Switch", "Power_Switch_Bezel", "01_Enclosure", "Back_Panel"),
        ("left_retainer_to_left_channel", "21_Cable_Management", "Left_Cable_Retainer", "01_Enclosure", "Left_Service_Channel"),
        ("left_retainer_to_rear_cover", "21_Cable_Management", "Left_Cable_Retainer", "01_Enclosure", "Rear_Cable_Cover"),
        ("right_retainer_to_right_channel", "21_Cable_Management", "Right_Cable_Retainer", "01_Enclosure", "Right_Service_Channel"),
        ("right_retainer_to_rear_cover", "21_Cable_Management", "Right_Cable_Retainer", "01_Enclosure", "Rear_Cable_Cover"),
    )
    results = {}
    for label, c1, b1, c2, b2 in contact_pairs:
        gap = _minimum_distance_mm(
            _assembly_body_by_name(design, c1, b1),
            _assembly_body_by_name(design, c2, b2),
        )
        if gap > 0.01:
            raise RuntimeError(f"Mechanical integration {label} has {gap} mm gap")
        results[label] = gap

    for suffix in ("LF", "RF", "LR", "RR"):
        standoff = _assembly_body_by_name(
            design, "13_ESP32_DevKit", f"ESP32_Standoff_{suffix}"
        )
        for target_name in ("Breadboard_830_Base",):
            gap = _minimum_distance_mm(
                standoff,
                _assembly_body_by_name(design, "14_Breadboard_830", target_name),
            )
            if gap > 0.01:
                raise RuntimeError(f"ESP32 standoff {suffix} misses breadboard: {gap} mm")
            results[f"esp32_standoff_{suffix.lower()}_to_breadboard"] = gap
        pcb_gap = _minimum_distance_mm(
            standoff,
            _assembly_body_by_name(design, "13_ESP32_DevKit", "ESP32_PCB"),
        )
        if pcb_gap > 0.01:
            raise RuntimeError(f"ESP32 standoff {suffix} misses PCB: {pcb_gap} mm")
        results[f"esp32_standoff_{suffix.lower()}_to_pcb"] = pcb_gap

    for corner, z_code in (("TL", "TL"), ("TR", "TR"), ("BL", "BL"), ("BR", "BR")):
        shaft = _assembly_body_by_name(design, "19_Technical_Compartment_Cover", f"Cover_Screw_{corner}")
        head = _assembly_body_by_name(design, "19_Technical_Compartment_Cover", f"Cover_Screw_{corner}_Head")
        boss = _assembly_body_by_name(design, "01_Enclosure", f"Cover_Boss_{z_code}")
        cover = _assembly_body_by_name(
            design, "19_Technical_Compartment_Cover", "Technical_Compartment_Cover"
        )
        shaft_boss_gap = _minimum_distance_mm(shaft, boss)
        head_cover_gap = _minimum_distance_mm(head, cover)
        if shaft_boss_gap > 0.01 or head_cover_gap > 0.01:
            raise RuntimeError(
                f"Cover fastener {corner} failed: shaft/boss={shaft_boss_gap}, "
                f"head/cover={head_cover_gap} mm"
            )
        results[f"cover_screw_{corner.lower()}_to_boss"] = shaft_boss_gap
        results[f"cover_head_{corner.lower()}_to_cover"] = head_cover_gap
    return {"status": "PASS", "contact_tolerance_mm": 0.01, "results": results}


def _door_reveal_closure_audit(
    design: adsk.fusion.Design,
    components: Sequence[adsk.fusion.Component],
) -> Dict[str, object]:
    enclosure = _component_by_name(components, "01_Enclosure")
    door = _component_by_name(components, "02_Door")
    door_panel = door.bRepBodies.itemByName("Door_Panel")
    right_reveal = enclosure.bRepBodies.itemByName("Right_Service_Channel")
    right_panel = enclosure.bRepBodies.itemByName("Right_Panel")
    if not door_panel or not right_reveal or not right_panel:
        raise RuntimeError("Door reveal closure audit could not find required bodies")

    door_box = _body_box_mm(door_panel)
    reveal_box = _body_box_mm(right_reveal)
    panel_box = _body_box_mm(right_panel)
    door_gap = design.userParameters.itemByName("DoorGap")
    if not door_gap:
        raise RuntimeError("DoorGap parameter missing during closure audit")
    allowed_gap = round(door_gap.value * 10.0 + 0.25, 4)
    visible_side_gap = round(reveal_box["min_x"] - door_box["max_x"], 4)
    if visible_side_gap < -0.01 or visible_side_gap > allowed_gap:
        raise RuntimeError(
            "Right-side door reveal gap is not closed: "
            f"{visible_side_gap} mm, allowed <= {allowed_gap} mm"
        )
    if reveal_box["min_y"] > 0.1 or reveal_box["max_y"] < 10.0:
        raise RuntimeError("Right-side door reveal does not cover the front face")
    if reveal_box["min_z"] > door_box["min_z"] or reveal_box["max_z"] < door_box["max_z"]:
        raise RuntimeError("Right-side door reveal does not cover the door height")
    if abs(panel_box["min_x"] - reveal_box["max_x"]) > 0.1:
        raise RuntimeError("Right-side door reveal does not meet the right side panel")

    reveal_volume_cm3 = round(right_reveal.volume, 6)
    if not right_reveal.isValid or not right_reveal.isSolid:
        raise RuntimeError("Right-side door reveal is not a valid solid")
    if right_reveal.lumps.count != 1:
        raise RuntimeError("Right-side door reveal is not one connected solid")
    if abs(reveal_volume_cm3 - 76.5) > 0.01:
        raise RuntimeError(
            "Right-side door reveal volume changed unexpectedly: "
            f"{reveal_volume_cm3} cm^3"
        )

    front_face_evidence = []
    for face_index in range(right_reveal.faces.count):
        face = right_reveal.faces.item(face_index)
        face_box = _body_box_mm(face)
        if abs(face_box["min_y"]) <= 0.01 and abs(face_box["max_y"]) <= 0.01:
            front_face_evidence.append(
                {
                    "index": face_index,
                    "x_range_mm": [face_box["min_x"], face_box["max_x"]],
                    "z_range_mm": [face_box["min_z"], face_box["max_z"]],
                    "area_cm2": round(face.area, 6),
                }
            )
    full_front_faces = [
        face
        for face in front_face_evidence
        if face["x_range_mm"] == [130.0, 140.0]
        and face["z_range_mm"] == [10.0, 180.0]
    ]
    if len(full_front_faces) != 1 or abs(full_front_faces[0]["area_cm2"] - 17.0) > 0.01:
        raise RuntimeError("Right-side reveal has no full 10 x 170 mm front face at y=0")
    return {
        "method": "body bounding boxes at closed-door rest state",
        "door_right_edge_x_mm": door_box["max_x"],
        "right_reveal_left_edge_x_mm": reveal_box["min_x"],
        "right_reveal_right_edge_x_mm": reveal_box["max_x"],
        "right_panel_inner_edge_x_mm": panel_box["min_x"],
        "visible_side_gap_mm": visible_side_gap,
        "allowed_gap_mm": allowed_gap,
        "front_reveal_y_range_mm": [reveal_box["min_y"], reveal_box["max_y"]],
        "vertical_coverage_mm": [reveal_box["min_z"], reveal_box["max_z"]],
        "solid_volume_cm3": reveal_volume_cm3,
        "connected_lump_count": right_reveal.lumps.count,
        "front_face_evidence": full_front_faces[0],
        "status": "PASS",
    }


def _validate_model(
    design: adsk.fusion.Design,
    root: adsk.fusion.Component,
    joint: adsk.fusion.AsBuiltJoint,
    required_component_names: Sequence[str],
    routing_contract: Dict[str, Dict[str, object]],
) -> Dict[str, object]:
    if not design.computeAll():
        raise RuntimeError("Fusion Compute All did not complete")
    health_issues = _feature_health(design)
    if health_issues:
        raise RuntimeError("Timeline health issues: " + json.dumps(health_issues, ensure_ascii=False))

    components = [
        design.allComponents.item(index) for index in range(design.allComponents.count)
    ]
    component_names = [component.name for component in components]
    missing_components = sorted(set(required_component_names) - set(component_names))
    if missing_components:
        raise RuntimeError(f"Missing required components: {missing_components}")

    default_names = []
    invalid_bodies = []
    solid_count = 0
    body_count = 0
    for component in components:
        if component.name.startswith("Component"):
            default_names.append(component.name)
        for sketch_index in range(component.sketches.count):
            sketch = component.sketches.item(sketch_index)
            if sketch.name.startswith("Sketch") and "_" not in sketch.name:
                default_names.append(sketch.name)
        for body_index in range(component.bRepBodies.count):
            body = component.bRepBodies.item(body_index)
            body_count += 1
            if body.name.startswith("Body"):
                default_names.append(body.name)
            if body.isSolid:
                solid_count += 1
            if not body.isValid or not body.isSolid:
                invalid_bodies.append(body.name)
    if default_names:
        raise RuntimeError(f"Default object names remain: {default_names}")
    if invalid_bodies:
        raise RuntimeError(f"Invalid or non-solid bodies: {invalid_bodies}")

    bounds = _bounding_box_mm(root)
    for key, expected in (("width", 300.0), ("height", 250.0), ("depth", 223.0)):
        if abs(float(bounds[key]) - expected) > 0.5:
            raise RuntimeError(f"Bounding box {key}={bounds[key]} mm, expected {expected} mm")

    enclosure_bounds = _body_box_mm(
        _body_by_name(components, "01_Enclosure", "Right_Panel")
    )
    if enclosure_bounds["max_y"] != 220.0:
        raise RuntimeError("Nominal enclosure rear plane is not y=220 mm")

    if design.userParameters.count != 29:
        raise RuntimeError(f"Expected 29 user parameters, found {design.userParameters.count}")
    if design.designType != adsk.fusion.DesignTypes.ParametricDesignType:
        raise RuntimeError("Capture Design History is not enabled")

    storage_clear_space = {}
    for output_key, parameter_name in (
        ("width", "StorageClearWidth"),
        ("height", "StorageClearHeight"),
        ("depth", "StorageClearDepth"),
    ):
        parameter = design.userParameters.itemByName(parameter_name)
        if not parameter:
            raise RuntimeError(f"Missing storage-clear parameter {parameter_name}")
        storage_clear_space[output_key] = round(parameter.value * 10.0, 4)

    motion = adsk.fusion.RevoluteJointMotion.cast(joint.jointMotion)
    limits = motion.rotationLimits
    if not limits.isMinimumValueEnabled or not limits.isMaximumValueEnabled:
        raise RuntimeError("Door joint limits are not enabled")
    if abs(math.degrees(limits.minimumValue)) > 1e-4:
        raise RuntimeError("Door joint minimum is not 0 degrees")
    if abs(math.degrees(limits.maximumValue) - 105.0) > 1e-3:
        raise RuntimeError("Door joint maximum is not 105 degrees")
    _set_joint_angle(joint, 0)
    door_reveal_closure = _door_reveal_closure_audit(design, components)
    mechanical_integration = _mechanical_integration_audit(design, components)
    routing_connectivity = _routing_connectivity_audit(
        design, components, routing_contract
    )

    return {
        "component_count_including_root": len(components),
        # Every component in this build has one occurrence; nested door parts are
        # included in design.allComponents as well.
        "occurrence_count": len(components) - 1,
        "body_count": body_count,
        "solid_body_count": solid_count,
        "user_parameter_count": design.userParameters.count,
        "timeline_count": design.timeline.count,
        "timeline_health_issues": health_issues,
        "bounding_box_mm": bounds,
        "nominal_enclosure_mm": {
            "width": 300.0,
            "depth": 220.0,
            "height": 250.0,
            "rear_plane_y": enclosure_bounds["max_y"],
        },
        "storage_clear_space_mm": storage_clear_space,
        "storage_clear_space_verification": {
            "method": "evaluated Fusion user parameters and enclosure boundary coordinates",
            "x_limits_mm": [-130.0, 130.0],
            "y_limits_mm": [10.0, 200.0],
            "z_limits_mm": [10.0, 180.0],
            "note": "nominal clear envelope; rear DHT22 instrumentation locally projects 6 mm into this volume",
        },
        "door_reveal_closure": door_reveal_closure,
        "mechanical_integration": mechanical_integration,
        "routing_connectivity": routing_connectivity,
        "routing_contract": routing_contract,
        "door_joint": {
            "name": joint.name,
            "type": "Revolute",
            "minimum_degrees": 0,
            "maximum_degrees": 105,
            "rest_degrees": 0,
            "drive_test": "pending",
        },
        "capture_design_history": True,
    }


def _drive_test(
    design: adsk.fusion.Design,
    door_occurrence: adsk.fusion.Occurrence,
    joint: adsk.fusion.AsBuiltJoint,
) -> Dict[str, object]:
    _set_joint_angle(joint, 0)
    closed = door_occurrence.boundingBox
    closed_center_y = (closed.minPoint.y + closed.maxPoint.y) * 5.0
    _set_joint_angle(joint, 105)
    opened = door_occurrence.boundingBox
    opened_center_y = (opened.minPoint.y + opened.maxPoint.y) * 5.0
    opened_min_x = opened.minPoint.x * 10.0
    opened_min_y = opened.minPoint.y * 10.0
    opens_outward = opened_center_y < closed_center_y - 20.0
    opens_left = opened_min_x < -150.0
    _set_joint_angle(joint, 0)
    if not opens_outward or not opens_left:
        raise RuntimeError(
            "Door joint drive test failed: "
            f"closed_center_y={closed_center_y:.3f}, opened_center_y={opened_center_y:.3f}, "
            f"opened_min_x={opened_min_x:.3f}, opened_min_y={opened_min_y:.3f}"
        )
    return {
        "passed": True,
        "closed_center_y_mm": round(closed_center_y, 3),
        "opened_center_y_mm": round(opened_center_y, 3),
        "opened_min_x_mm": round(opened_min_x, 3),
        "opened_min_y_mm": round(opened_min_y, 3),
    }


def _export_design(design: adsk.fusion.Design) -> Dict[str, object]:
    export_manager = design.exportManager
    candidate_f3d = os.path.join(STAGING_DIR, "Smart_Privacy_Locker_2_1.f3d")
    candidate_step = os.path.join(STAGING_DIR, "Smart_Privacy_Locker_2_1.step")
    archive_options = export_manager.createFusionArchiveExportOptions(candidate_f3d)
    if not archive_options or not export_manager.execute(archive_options):
        raise RuntimeError("Fusion archive export failed")
    step_options = export_manager.createSTEPExportOptions(candidate_step, design.rootComponent)
    if not step_options or not export_manager.execute(step_options):
        raise RuntimeError("STEP export failed")
    for path in (candidate_f3d, candidate_step):
        if not os.path.isfile(path) or os.path.getsize(path) == 0:
            raise RuntimeError(f"Exported file is missing or empty: {path}")
    os.replace(candidate_f3d, F3D_PATH)
    os.replace(candidate_step, STEP_PATH)
    return {
        "f3d": {"path": F3D_PATH, "bytes": os.path.getsize(F3D_PATH)},
        "step": {"path": STEP_PATH, "bytes": os.path.getsize(STEP_PATH)},
    }


def run(_context: str):
    _ensure_directories()
    _open_log()
    application = adsk.core.Application.get()
    if not application:
        raise RuntimeError("Autodesk Fusion application is unavailable")

    _stage(1, "Checking Fusion connection...")
    _log(f"Fusion version: {application.version}")
    _log(f"Workspace: {WORKSPACE}")

    _stage(2, "Creating document...")
    document = application.documents.add(adsk.core.DocumentTypes.FusionDesignDocumentType)
    if not document:
        raise RuntimeError("Could not create Fusion design document")
    document.name = "Smart_Privacy_Locker"
    design = adsk.fusion.Design.cast(application.activeProduct)
    if not design:
        raise RuntimeError("Active product is not a Fusion Design")
    design.designType = adsk.fusion.DesignTypes.ParametricDesignType
    design.fusionUnitsManager.distanceDisplayUnits = adsk.fusion.DistanceUnits.MillimeterDistanceUnits
    root = design.rootComponent
    locker_occurrence, locker = _make_component(root, "Smart_Privacy_Locker")
    locker_occurrence.isGrounded = True

    _stage(3, "Creating user parameters...")
    _create_parameters(design)

    _stage(4, "Creating enclosure...")
    appearances = _make_appearances(application, design)
    enclosure_occurrence, _enclosure, _enclosure_bodies = _create_enclosure(locker, appearances)

    _stage(5, "Creating door...")
    door_occurrence, _door, magnet_occurrence, striker_occurrence = _create_door_and_nested_parts(
        locker, appearances
    )

    _stage(6, "Creating hinges and joint...")
    upper_hinge, lower_hinge = _create_hinges(locker, appearances)
    joint = _create_door_joint(design, locker, enclosure_occurrence, door_occurrence)

    _stage(7, "Creating locking mechanism...")
    lock_parts = _create_lock_and_servo(locker, appearances)

    _stage(8, "Creating sensors...")
    sensors = _create_sensors_and_display(locker, appearances)

    _stage(9, "Creating electronics...")
    led_occurrence = _create_led_strip(locker, appearances)
    electronics = _create_electronics(locker, appearances)
    power = _create_power_and_cover(locker, appearances)

    _stage(10, "Creating cable management...")
    cable_occurrence, routing_contract = _create_cable_management(locker, appearances)

    _stage(11, "Applying appearances...")
    grounded_occurrence_count = _ground_static_assembly(locker)
    adsk.doEvents()

    required_components = (
        "01_Enclosure",
        "02_Door",
        "03_Left_Upper_Hinge",
        "04_Left_Lower_Hinge",
        "05_Locking_Mechanism",
        "06_Servo_SG90",
        "07_Servo_Mount",
        "08_MC38_Frame_Sensor",
        "09_MC38_Door_Magnet",
        "10_DHT22",
        "11_OLED_SSD1306",
        "12_LED_Strip_WS2812B",
        "13_ESP32_DevKit",
        "14_Breadboard_830",
        "15_MOSFET_D4184",
        "16_Active_Buzzer",
        "17_DC_Jack",
        "18_Power_Switch",
        "19_Technical_Compartment_Cover",
        "20_Electronics_Mounting_Tray",
        "21_Cable_Management",
    )

    _stage(12, "Running geometry checks...")
    summary = _validate_model(
        design, root, joint, required_components, routing_contract
    )
    summary["grounded_occurrence_count"] = grounded_occurrence_count
    summary["door_joint"]["drive_test"] = _drive_test(design, door_occurrence, joint)

    occurrences = {
        "locker_root": locker_occurrence,
        "enclosure": enclosure_occurrence,
        "door": door_occurrence,
        "upper_hinge": upper_hinge,
        "lower_hinge": lower_hinge,
        "lock": lock_parts["lock"],
        "servo": lock_parts["servo"],
        "mount": lock_parts["mount"],
        "mc38": sensors["mc38"],
        "dht": sensors["dht"],
        "oled": sensors["oled"],
        "led": led_occurrence,
        "esp32": electronics["esp32"],
        "breadboard": electronics["breadboard"],
        "mosfet": electronics["mosfet"],
        "buzzer": electronics["buzzer"],
        "jack": power["jack"],
        "switch": power["switch"],
        "cover": power["cover"],
        "tray": power["tray"],
        "cables": cable_occurrence,
        "magnet": magnet_occurrence,
        "striker": striker_occurrence,
    }

    _stage(13, "Creating named views...")
    images = _create_named_views_and_images(
        design, locker, joint, occurrences, _enclosure_bodies
    )

    _stage(14, "Exporting files...")
    _set_joint_angle(joint, 0)
    power["cover"].isLightBulbOn = True
    design.computeAll()
    summary["exports"] = _export_design(design)
    summary["fusion_images"] = {
        name: {"path": path, "bytes": os.path.getsize(path)} for name, path in images.items()
    }
    summary["root_component"] = locker.name
    summary["fusion_container_root"] = root.name
    summary["named_view_count"] = design.namedViews.count
    summary["fusion_version"] = application.version
    summary["created_at"] = _dt.datetime.now().astimezone().isoformat(timespec="seconds")
    summary["document_name"] = document.name
    summary["verification_result"] = "Fusion build and pre-export validation passed"
    with open(SUMMARY_PATH, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(summary, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    _stage(15, "Verification completed.")
    _log(json.dumps(summary, ensure_ascii=False))
    if _LOG_HANDLE is not None:
        _LOG_HANDLE.close()
