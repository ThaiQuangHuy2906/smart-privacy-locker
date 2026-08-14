"""Reopen the Fusion archive and STEP exports and verify their live geometry."""

from __future__ import annotations

import datetime as _dt
import hashlib
import json
import math
import os
import runpy

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
F3D_PATH = os.path.join(OUTPUT_DIR, "Smart_Privacy_Locker_2_1.f3d")
STEP_PATH = os.path.join(OUTPUT_DIR, "Smart_Privacy_Locker_2_1.step")
RESULT_PATH = os.path.join(OUTPUT_DIR, "fusion_reopen_verification.json")
SUMMARY_PATH = os.path.join(OUTPUT_DIR, "fusion_build_summary.json")
GENERATOR_PATH = os.path.join(
    WORKSPACE,
    "02_FUSION_AUTOMATION",
    "01_TAO_MO_HINH",
    "create_smart_privacy_locker.py",
)


def _bounds_mm(component: adsk.fusion.Component):
    box = component.boundingBox
    return {
        "min_x": round(box.minPoint.x * 10, 4),
        "min_y": round(box.minPoint.y * 10, 4),
        "min_z": round(box.minPoint.z * 10, 4),
        "max_x": round(box.maxPoint.x * 10, 4),
        "max_y": round(box.maxPoint.y * 10, 4),
        "max_z": round(box.maxPoint.z * 10, 4),
        "width": round((box.maxPoint.x - box.minPoint.x) * 10, 4),
        "depth": round((box.maxPoint.y - box.minPoint.y) * 10, 4),
        "height": round((box.maxPoint.z - box.minPoint.z) * 10, 4),
    }


def _health_issues(design: adsk.fusion.Design):
    issues = []
    bad = (
        adsk.fusion.FeatureHealthStates.WarningFeatureHealthState,
        adsk.fusion.FeatureHealthStates.ErrorFeatureHealthState,
    )
    for index in range(design.timeline.count):
        item = design.timeline.item(index)
        entity = item.entity
        if entity is None or not hasattr(entity, "healthState"):
            continue
        if entity.healthState in bad:
            issues.append(
                {
                    "index": index,
                    "name": getattr(entity, "name", entity.objectType),
                    "message": getattr(entity, "errorOrWarningMessage", ""),
                }
            )
    return issues


def _solid_counts(design: adsk.fusion.Design):
    bodies = 0
    solids = 0
    invalid = []
    for component_index in range(design.allComponents.count):
        component = design.allComponents.item(component_index)
        for body_index in range(component.bRepBodies.count):
            body = component.bRepBodies.item(body_index)
            bodies += 1
            if body.isSolid:
                solids += 1
            if not body.isValid or not body.isSolid:
                invalid.append(f"{component.name}/{body.name}")
    return bodies, solids, invalid


def _verify_envelope(bounds):
    expected = {"width": 300.0, "height": 250.0, "depth": 223.0}
    for key, value in expected.items():
        if abs(bounds[key] - value) > 0.5:
            raise RuntimeError(f"{key}={bounds[key]} mm after reopen; expected {value} mm")


def _verify_archive(document: adsk.core.Document, build_summary, generator):
    design = adsk.fusion.Design.cast(document.products.itemByProductType("DesignProductType"))
    if not design:
        design = adsk.fusion.Design.cast(adsk.core.Application.get().activeProduct)
    if not design:
        raise RuntimeError("Reopened F3D does not contain a Fusion Design")
    design.timeline.moveToEnd()
    if not design.computeAll():
        raise RuntimeError("Compute All failed after reopening F3D")
    adsk.doEvents()
    issues = _health_issues(design)
    if issues:
        raise RuntimeError("Timeline warnings/errors after reopen: " + json.dumps(issues))
    bounds = _bounds_mm(design.rootComponent)
    _verify_envelope(bounds)
    bodies, solids, invalid = _solid_counts(design)
    if invalid:
        raise RuntimeError(f"Invalid bodies after reopen: {invalid}")
    if bodies != int(build_summary["body_count"]):
        raise RuntimeError(
            f"F3D body count changed after reopen: {bodies} vs {build_summary['body_count']}"
        )
    logical_root = None
    for component_index in range(design.allComponents.count):
        component = design.allComponents.item(component_index)
        if component.name == "Smart_Privacy_Locker":
            logical_root = component
            break
    if logical_root is None:
        raise RuntimeError("Logical root component Smart_Privacy_Locker is missing after reopen")
    component_names = {
        design.allComponents.item(index).name
        for index in range(design.allComponents.count)
    }
    required_components = {
        "01_Enclosure", "02_Door", "03_Left_Upper_Hinge", "04_Left_Lower_Hinge",
        "05_Locking_Mechanism", "05A_Latch", "05B_Door_Striker", "06_Servo_SG90",
        "07_Servo_Mount", "08_MC38_Frame_Sensor", "09_MC38_Door_Magnet", "10_DHT22",
        "11_OLED_SSD1306", "12_LED_Strip_WS2812B", "13_ESP32_DevKit",
        "14_Breadboard_830", "15_MOSFET_D4184", "16_Active_Buzzer", "17_DC_Jack",
        "18_Power_Switch", "19_Technical_Compartment_Cover",
        "20_Electronics_Mounting_Tray", "21_Cable_Management",
    }
    missing = sorted(required_components - component_names)
    if missing:
        raise RuntimeError(f"F3D is missing required components: {missing}")
    joint = logical_root.asBuiltJoints.itemByName("Joint_Door_Revolute")
    if not joint:
        raise RuntimeError("Door revolute joint missing after reopen")
    motion = adsk.fusion.RevoluteJointMotion.cast(joint.jointMotion)
    if not motion:
        raise RuntimeError("Door joint is not revolute after reopen")
    limits = motion.rotationLimits
    if not limits.isMinimumValueEnabled or not limits.isMaximumValueEnabled:
        raise RuntimeError("Door limits disabled after reopen")
    if abs(math.degrees(limits.minimumValue)) > 1e-4 or abs(math.degrees(limits.maximumValue) - 105) > 1e-3:
        raise RuntimeError("Door limits changed after reopen")
    motion.rotationValue = math.radians(105)
    adsk.doEvents()
    motion.rotationValue = 0.0
    adsk.doEvents()
    components = [
        design.allComponents.item(index)
        for index in range(design.allComponents.count)
    ]
    mechanical = generator["_mechanical_integration_audit"](design, components)
    routing = generator["_routing_connectivity_audit"](
        design, components, build_summary["routing_contract"]
    )
    named_views = [
        design.namedViews.item(index).name for index in range(design.namedViews.count)
    ]
    expected_viva = [f"VIVA_{index:02d}" for index in range(15)]
    if not all(any(name.startswith(prefix) for name in named_views) for prefix in expected_viva):
        raise RuntimeError("Fresh F3D is missing one or more VIVA_00..VIVA_14 named views")
    # Names alone do not prove a demo camera is usable.  Perspective cameras
    # can reopen with a corrupted eye distance and reduce the model to a dot.
    # Apply every VIVA camera and require the archive-stable orthographic form.
    named_view_apply_checks = []
    for index in range(design.namedViews.count):
        named_view = design.namedViews.item(index)
        if not named_view.name.startswith("VIVA_"):
            continue
        camera = named_view.camera
        if camera.cameraType != adsk.core.CameraTypes.OrthographicCameraType:
            raise RuntimeError(
                f"Named View {named_view.name} is not archive-stable orthographic"
            )
        if not (1.0 <= camera.viewExtents <= 100.0):
            raise RuntimeError(
                f"Named View {named_view.name} has unusable viewExtents={camera.viewExtents} cm"
            )
        if not named_view.apply():
            raise RuntimeError(f"Named View {named_view.name} could not be applied")
        adsk.doEvents()
        named_view_apply_checks.append(
            {
                "name": named_view.name,
                "camera_type": "orthographic",
                "view_extents_cm": round(camera.viewExtents, 6),
                "apply_result": "passed",
            }
        )
    start_view = design.namedViews.itemByName("VIVA_00_START_HERE")
    if not start_view or not start_view.apply():
        raise RuntimeError("VIVA_00_START_HERE could not be restored after camera audit")
    adsk.doEvents()
    return design, {
        "document_name": document.name,
        "fusion_container_root_name": design.rootComponent.name,
        "root_component_name": logical_root.name,
        "capture_design_history": design.designType == adsk.fusion.DesignTypes.ParametricDesignType,
        "component_count_including_root": design.allComponents.count,
        "body_count": bodies,
        "solid_body_count": solids,
        "user_parameter_count": design.userParameters.count,
        "timeline_count": design.timeline.count,
        "timeline_health_issues": issues,
        "bounding_box_mm": bounds,
        "mechanical_integration": mechanical,
        "routing_connectivity": routing,
        "named_view_count": len(named_views),
        "named_views": named_views,
        "named_view_apply_checks": named_view_apply_checks,
        "door_joint": {
            "name": joint.name,
            "minimum_degrees": round(math.degrees(limits.minimumValue), 6),
            "maximum_degrees": round(math.degrees(limits.maximumValue), 6),
            "drive_test_after_reopen": "passed",
        },
    }


def _verify_step(document: adsk.core.Document, expected_body_count: int):
    design = adsk.fusion.Design.cast(document.products.itemByProductType("DesignProductType"))
    if not design:
        design = adsk.fusion.Design.cast(adsk.core.Application.get().activeProduct)
    if not design:
        raise RuntimeError("Imported STEP does not contain a Fusion Design")
    bounds = _bounds_mm(design.rootComponent)
    _verify_envelope(bounds)
    bodies, solids, invalid = _solid_counts(design)
    if invalid or solids == 0:
        raise RuntimeError(f"STEP import produced invalid bodies: {invalid}")
    if bodies != expected_body_count:
        raise RuntimeError(
            f"STEP body count changed after import: {bodies} vs {expected_body_count}"
        )
    return {
        "document_name": document.name,
        "body_count": bodies,
        "solid_body_count": solids,
        "bounding_box_mm": bounds,
        "invalid_bodies": invalid,
    }


def run(_context: str):
    app = adsk.core.Application.get()
    if not os.path.isfile(F3D_PATH) or os.path.getsize(F3D_PATH) == 0:
        raise RuntimeError("F3D export is missing or empty")
    if not os.path.isfile(STEP_PATH) or os.path.getsize(STEP_PATH) == 0:
        raise RuntimeError("STEP export is missing or empty")
    if not os.path.isfile(SUMMARY_PATH):
        raise RuntimeError("Fusion build summary is missing")
    with open(SUMMARY_PATH, "r", encoding="utf-8") as handle:
        build_summary = json.load(handle)
    generator = runpy.run_path(GENERATOR_PATH)

    archive_options = app.importManager.createFusionArchiveImportOptions(F3D_PATH)
    archive_document = app.importManager.importToNewDocument(archive_options)
    if not archive_document:
        raise RuntimeError("Could not reopen Fusion archive")
    archive_document.activate()
    archive_design, archive_result = _verify_archive(
        archive_document, build_summary, generator
    )

    step_options = app.importManager.createSTEPImportOptions(STEP_PATH)
    step_document = app.importManager.importToNewDocument(step_options)
    if not step_document:
        raise RuntimeError("Could not import STEP")
    step_document.activate()
    step_result = _verify_step(step_document, int(build_summary["body_count"]))
    step_document.close(False)
    archive_document.activate()

    result = {
        "verified_at": _dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        "f3d": archive_result,
        "step": step_result,
        "sha256": {
            "f3d": hashlib.sha256(open(F3D_PATH, "rb").read()).hexdigest().upper(),
            "step": hashlib.sha256(open(STEP_PATH, "rb").read()).hexdigest().upper(),
        },
        "verification_result": "passed",
    }
    with open(RESULT_PATH, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(result, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(json.dumps(result, ensure_ascii=False))
