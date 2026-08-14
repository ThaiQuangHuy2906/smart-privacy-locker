"""Run native Fusion interference analysis over the complete door sweep.

This script is executed inside Autodesk Fusion through MCP after the exported
F3D archive has been reopened.  It records every positive-volume result,
classifies deliberate assembly overlaps, and fails if any unrelated component
or structural-panel collision remains.
"""

from __future__ import annotations

import datetime as _dt
import json
import math
import os
import re
from typing import Dict, Optional, Tuple

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
RESULT_PATH = os.path.join(
    WORKSPACE,
    "03_FUSION_BUILD_OUTPUT",
    "smart_privacy_locker_v2_1",
    "fusion_interference_verification.json",
)

SAMPLE_ANGLES_DEG = tuple(range(0, 106, 5))
VOLUME_TOLERANCE_CM3 = 1e-9
BUILD_SUMMARY_PATH = os.path.join(
    WORKSPACE, "03_FUSION_BUILD_OUTPUT", "smart_privacy_locker_v2_1", "fusion_build_summary.json"
)
ROUTE_SEGMENT_NAMES = set()
ROUTING_ENDPOINT_PAIRS = set()


def _find_joint(design: adsk.fusion.Design) -> adsk.fusion.AsBuiltJoint:
    for component_index in range(design.allComponents.count):
        component = design.allComponents.item(component_index)
        joint = component.asBuiltJoints.itemByName("Joint_Door_Revolute")
        if joint:
            return joint
    raise RuntimeError("Joint_Door_Revolute is missing")


def _component_name(body: adsk.fusion.BRepBody) -> str:
    context = body.assemblyContext
    if context:
        return context.component.name
    parent = body.parentComponent
    return parent.name if parent else "<unknown>"


def _intended_overlap_reason(
    name_one: str,
    component_one: str,
    name_two: str,
    component_two: str,
) -> Optional[str]:
    names = (name_one, name_two)
    joined = " | ".join(names)
    components = {component_one, component_two}

    qualified_pair = tuple(sorted((
        f"{component_one}/{name_one}", f"{component_two}/{name_two}"
    )))
    if qualified_pair in ROUTING_ENDPOINT_PAIRS:
        return "declared wiring-contract endpoint"

    if component_one == component_two:
        if component_one == "21_Cable_Management":
            # Do not hide cross-net cable collisions merely because all cable
            # bodies live in one organizational component.  Only consecutive
            # segments of the same declared route may overlap at their joint.
            first = re.match(r"^(.+)_S(\d{2})$", name_one)
            second = re.match(r"^(.+)_S(\d{2})$", name_two)
            if (
                first
                and second
                and first.group(1) == second.group(1)
                and abs(int(first.group(2)) - int(second.group(2))) == 1
            ):
                return "consecutive segments of one declared route"
            return None
        return "internal multi-body component interface"

    if "Hinge" in joined and (
        "02_Door" in components
        or "03_Left_Upper_Hinge" in components
        or "04_Left_Lower_Hinge" in components
    ):
        return "hinge knuckle/leaf assembly interface"

    if components == {"06_Servo_SG90", "07_Servo_Mount"}:
        return "servo mounting-ear engagement"

    if components == {"05A_Latch", "06_Servo_SG90"} and (
        "Linkage" in joined or "Servo_Horn" in joined
    ):
        return "servo horn/linkage mechanical connection"

    if (
        (name_one.startswith("Cover_Screw_") and name_two.startswith("Cover_Boss_"))
        or (name_two.startswith("Cover_Screw_") and name_one.startswith("Cover_Boss_"))
    ):
        return "cover screw threaded engagement with fixed boss"

    cable_name = None
    other_name = None
    if name_one.startswith("Cable_"):
        cable_name, other_name = name_one, name_two
    elif name_two.startswith("Cable_"):
        cable_name, other_name = name_two, name_one

    if name_one.startswith("Cable_") and name_two.startswith("Cable_"):
        return "insulated cable-bundle contact or segment continuity"

    if cable_name:
        allowed_endpoints = {
            "Cable_MC38": ("MC38",),
            "Cable_DHT22": ("DHT22", "ESP32"),
            "Cable_OLED": ("OLED", "ESP32"),
            "Cable_LED": ("LED_Strip", "MOSFET"),
            "Cable_Servo": ("Servo", "MOSFET"),
            "Cable_DC": ("DC_Jack", "MOSFET"),
        }
        for prefix, endpoint_tokens in allowed_endpoints.items():
            if cable_name.startswith(prefix) and any(
                token in other_name for token in endpoint_tokens
            ):
                return "modeled cable termination within connected device"

    return None


def _analyze_at_angle(
    design: adsk.fusion.Design,
    angle_degrees: float,
) -> Tuple[Dict[str, object], Dict[str, Dict[str, object]]]:
    entities = adsk.core.ObjectCollection.create()
    for occurrence_index in range(design.rootComponent.allOccurrences.count):
        occurrence = design.rootComponent.allOccurrences.item(occurrence_index)
        if occurrence.bRepBodies.count:
            entities.add(occurrence)

    interference_input = design.createInterferenceInput(entities)
    if not interference_input:
        raise RuntimeError("Fusion could not create an interference input")
    interference_input.areCoincidentFacesIncluded = False
    results = design.analyzeInterference(interference_input)
    if results is None:
        raise RuntimeError("Fusion analyzeInterference returned null")

    classified: Dict[str, Dict[str, object]] = {}
    serious_count = 0
    positive_count = 0
    maximum_volume_cm3 = 0.0
    for result_index in range(results.count):
        result = results.item(result_index)
        volume_cm3 = float(result.interferenceBody.volume)
        if volume_cm3 <= VOLUME_TOLERANCE_CM3:
            continue
        positive_count += 1
        maximum_volume_cm3 = max(maximum_volume_cm3, volume_cm3)
        body_one = adsk.fusion.BRepBody.cast(result.entityOne)
        body_two = adsk.fusion.BRepBody.cast(result.entityTwo)
        if not body_one or not body_two:
            raise RuntimeError("Interference result entity was not a BRepBody")
        component_one = _component_name(body_one)
        component_two = _component_name(body_two)
        name_one = body_one.name
        name_two = body_two.name
        reason = _intended_overlap_reason(
            name_one, component_one, name_two, component_two
        )
        if reason is None:
            serious_count += 1

        ordered = sorted(
            ((component_one, name_one), (component_two, name_two)),
            key=lambda item: (item[0], item[1]),
        )
        pair_key = " || ".join(f"{component}/{body}" for component, body in ordered)
        prior = classified.get(pair_key)
        current = {
            "component_one": ordered[0][0],
            "body_one": ordered[0][1],
            "component_two": ordered[1][0],
            "body_two": ordered[1][1],
            "classification": "intended" if reason else "serious",
            "reason": reason or "unrelated positive-volume collision",
            "maximum_volume_cm3": round(volume_cm3, 12),
            "maximum_volume_mm3": round(volume_cm3 * 1000.0, 6),
            "angles_degrees": [angle_degrees],
        }
        if prior:
            prior["maximum_volume_cm3"] = max(
                float(prior["maximum_volume_cm3"]), current["maximum_volume_cm3"]
            )
            prior["maximum_volume_mm3"] = round(
                float(prior["maximum_volume_cm3"]) * 1000.0, 6
            )
            prior["angles_degrees"].append(angle_degrees)
        else:
            classified[pair_key] = current

    return (
        {
            "angle_degrees": angle_degrees,
            "raw_result_count": results.count,
            "positive_volume_result_count": positive_count,
            "intended_positive_volume_count": positive_count - serious_count,
            "serious_positive_volume_count": serious_count,
            "maximum_volume_cm3": round(maximum_volume_cm3, 12),
        },
        classified,
    )


def run(_context: str):
    global ROUTE_SEGMENT_NAMES, ROUTING_ENDPOINT_PAIRS
    application = adsk.core.Application.get()
    design = adsk.fusion.Design.cast(application.activeProduct)
    if not design:
        raise RuntimeError("Active document is not a Fusion Design")

    if not os.path.isfile(BUILD_SUMMARY_PATH):
        raise RuntimeError("Fusion build summary is missing for interference classification")
    with open(BUILD_SUMMARY_PATH, "r", encoding="utf-8") as handle:
        build_summary = json.load(handle)
    route_segment_names = set()
    endpoint_pairs = set()
    for route in build_summary["routing_contract"].values():
        segments = route["segment_bodies"]
        route_segment_names.update(segments)
        endpoint_pairs.add(tuple(sorted((
            f"21_Cable_Management/{segments[0]}",
            f"{route['source'][0]}/{route['source'][1]}",
        ))))
        endpoint_pairs.add(tuple(sorted((
            f"21_Cable_Management/{segments[-1]}",
            f"{route['target'][0]}/{route['target'][1]}",
        ))))
    ROUTE_SEGMENT_NAMES = route_segment_names
    ROUTING_ENDPOINT_PAIRS = endpoint_pairs

    joint = _find_joint(design)
    motion = adsk.fusion.RevoluteJointMotion.cast(joint.jointMotion)
    if not motion:
        raise RuntimeError("Door joint is not revolute")

    angle_results = []
    unique_pairs: Dict[str, Dict[str, object]] = {}
    try:
        for angle_degrees in SAMPLE_ANGLES_DEG:
            motion.rotationValue = math.radians(angle_degrees)
            adsk.doEvents()
            angle_result, angle_pairs = _analyze_at_angle(design, angle_degrees)
            angle_results.append(angle_result)
            for pair_key, pair_data in angle_pairs.items():
                prior = unique_pairs.get(pair_key)
                if prior:
                    prior["maximum_volume_cm3"] = max(
                        float(prior["maximum_volume_cm3"]),
                        float(pair_data["maximum_volume_cm3"]),
                    )
                    prior["maximum_volume_mm3"] = round(
                        float(prior["maximum_volume_cm3"]) * 1000.0, 6
                    )
                    prior["angles_degrees"] = sorted(
                        set(prior["angles_degrees"] + pair_data["angles_degrees"])
                    )
                else:
                    unique_pairs[pair_key] = pair_data
    finally:
        motion.rotationValue = 0.0
        adsk.doEvents()

    serious_pairs = [
        pair for pair in unique_pairs.values() if pair["classification"] == "serious"
    ]
    intended_pairs = [
        pair for pair in unique_pairs.values() if pair["classification"] == "intended"
    ]
    result = {
        "verified_at": _dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        "method": "Autodesk Fusion Design.analyzeInterference on body-bearing occurrences",
        "interference_volume_source": "BRepBody.volume in cm^3",
        "coincident_faces_included": False,
        "volume_tolerance_cm3": VOLUME_TOLERANCE_CM3,
        "sample_angles_degrees": list(SAMPLE_ANGLES_DEG),
        "body_count_before_and_after": sum(
            design.allComponents.item(index).bRepBodies.count
            for index in range(design.allComponents.count)
        ),
        "door_restored_to_degrees": 0,
        "angle_results": angle_results,
        "unique_intended_overlap_count": len(intended_pairs),
        "unique_serious_collision_count": len(serious_pairs),
        "intended_overlaps": sorted(
            intended_pairs,
            key=lambda row: float(row["maximum_volume_cm3"]),
            reverse=True,
        ),
        "serious_collisions": sorted(
            serious_pairs,
            key=lambda row: float(row["maximum_volume_cm3"]),
            reverse=True,
        ),
        "verification_result": "passed" if not serious_pairs else "failed",
        "interpretation": (
            "All positive-volume results are deliberate multi-body or mounting interfaces; "
            "no enclosure, shelf, back-panel, unrelated-component, or swept-door collision remains."
            if not serious_pairs
            else "One or more unrelated positive-volume collisions remain."
        ),
    }
    with open(RESULT_PATH, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(result, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(json.dumps(result, ensure_ascii=False))
    if serious_pairs:
        raise RuntimeError(
            f"Interference verification found {len(serious_pairs)} serious collision pair(s)"
        )
