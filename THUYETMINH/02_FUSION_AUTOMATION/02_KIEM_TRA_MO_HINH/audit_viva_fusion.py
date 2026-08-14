"""Strict final audit for the Smart Privacy Locker viva model.

Run inside Autodesk Fusion.  The script measures the repaired door reveal,
rear power interface, mounted sensor/display locations, joint, grounding,
timeline health, and the complete solid inventory.  It leaves the door closed.
"""

import datetime as _dt
import json
import math

import adsk.core
import adsk.fusion


RESULT_PATH = r"C:\CodexFusionTemp\smart_privacy_locker_viva\final_model_audit.json"


def run(_context: str):
    app = adsk.core.Application.get()
    design = adsk.fusion.Design.cast(app.activeProduct)
    if not design:
        raise RuntimeError("Active product is not a Fusion Design")
    design.computeAll()
    root = design.rootComponent

    def all_occurrences():
        return [root.allOccurrences.item(i) for i in range(root.allOccurrences.count)]

    def find_occurrence(component_name: str):
        rows = [occ for occ in all_occurrences() if occ.component.name == component_name]
        if len(rows) != 1:
            raise RuntimeError(
                f"Expected exactly one occurrence for {component_name}, got {len(rows)}"
            )
        return rows[0]

    def find_body(body_name: str):
        rows = []
        for component_index in range(design.allComponents.count):
            component = design.allComponents.item(component_index)
            for body_index in range(component.bRepBodies.count):
                body = component.bRepBodies.item(body_index)
                if body.name == body_name:
                    rows.append(body)
        if len(rows) != 1:
            raise RuntimeError(
                f"Expected exactly one body for {body_name}, got {len(rows)}"
            )
        return rows[0]

    def bbox_mm(body):
        box = body.boundingBox
        return {
            "min": [round(value * 10, 4) for value in (
                box.minPoint.x, box.minPoint.y, box.minPoint.z
            )],
            "max": [round(value * 10, 4) for value in (
                box.maxPoint.x, box.maxPoint.y, box.maxPoint.z
            )],
        }

    component_names = [
        design.allComponents.item(i).name for i in range(design.allComponents.count)
    ]
    occurrences = all_occurrences()
    bodies = []
    invalid_bodies = []
    non_solid_bodies = []
    invisible_bodies = []
    for component_index in range(design.allComponents.count):
        component = design.allComponents.item(component_index)
        for body_index in range(component.bRepBodies.count):
            body = component.bRepBodies.item(body_index)
            bodies.append(body)
            qualified_name = f"{component.name}/{body.name}"
            if not body.isValid:
                invalid_bodies.append(qualified_name)
            if not body.isSolid:
                non_solid_bodies.append(qualified_name)
            if not body.isVisible:
                invisible_bodies.append(qualified_name)

    healthy = adsk.fusion.FeatureHealthStates.HealthyFeatureHealthState
    timeline_issues = []
    for index in range(design.timeline.count):
        timeline_object = design.timeline.item(index)
        entity = timeline_object.entity
        health = getattr(entity, "healthState", None)
        if health is not None and health != healthy:
            timeline_issues.append(
                {
                    "index": index,
                    "name": getattr(entity, "name", ""),
                    "health": str(health),
                    "message": getattr(entity, "errorOrWarningMessage", ""),
                }
            )

    reveal = find_body("Right_Service_Channel")
    door = find_body("Door_Panel")
    right_panel = find_body("Right_Panel")
    rocker = find_body("Power_Switch_Rocker")
    switch_housing = find_body("Power_Switch_Housing")
    dht = find_body("DHT22_Body")
    rear_cover = find_body("Rear_Cable_Cover")
    led = find_body("LED_Strip_Base")
    shelf = find_body("Technical_Shelf")
    oled_window = find_body("OLED_Display_Window")
    oled_pcb = find_body("OLED_PCB")

    reveal_box = bbox_mm(reveal)
    door_box = bbox_mm(door)
    right_panel_box = bbox_mm(right_panel)
    rocker_box = bbox_mm(rocker)
    housing_box = bbox_mm(switch_housing)
    dht_box = bbox_mm(dht)
    rear_cover_box = bbox_mm(rear_cover)
    led_box = bbox_mm(led)
    shelf_box = bbox_mm(shelf)

    front_face_areas_cm2 = []
    for face_index in range(reveal.faces.count):
        face = reveal.faces.item(face_index)
        face_box = face.boundingBox
        if abs(face_box.minPoint.y) < 1e-6 and abs(face_box.maxPoint.y) < 1e-6:
            front_face_areas_cm2.append(round(face.area, 6))

    door_joint = None
    for component_index in range(design.allComponents.count):
        component = design.allComponents.item(component_index)
        candidate = component.asBuiltJoints.itemByName("Joint_Door_Revolute")
        if candidate:
            door_joint = candidate
            break
    if not door_joint:
        raise RuntimeError("Joint_Door_Revolute is missing")
    motion = adsk.fusion.RevoluteJointMotion.cast(door_joint.jointMotion)
    if not motion:
        raise RuntimeError("Joint_Door_Revolute is not revolute")
    limits = motion.rotationLimits
    motion.rotationValue = math.radians(105)
    adsk.doEvents()
    driven_105 = round(math.degrees(motion.rotationValue), 6)
    motion.rotationValue = 0.0
    adsk.doEvents()
    driven_0 = round(math.degrees(motion.rotationValue), 6)

    door_occurrence = find_occurrence("02_Door")
    grounding = [
        {
            "occurrence": occurrence.fullPathName,
            "component": occurrence.component.name,
            "isGroundToParent": bool(occurrence.isGroundToParent),
        }
        for occurrence in occurrences
    ]
    ungrounded_static = [
        row for row in grounding
        if row["component"] != "02_Door" and not row["isGroundToParent"]
    ]

    named_views = [
        design.namedViews.item(i).name for i in range(design.namedViews.count)
    ]
    expected_named_view_prefixes = [f"VIVA_{index:02d}" for index in range(15)]

    required_components = [
        "01_Enclosure", "02_Door", "03_Left_Upper_Hinge",
        "04_Left_Lower_Hinge", "05A_Latch", "06_Servo_SG90",
        "07_Servo_Mount", "08_MC38_Frame_Sensor", "09_MC38_Door_Magnet",
        "10_DHT22", "11_OLED_SSD1306", "12_LED_Strip_WS2812B",
        "13_ESP32_DevKit", "14_Breadboard_830", "15_MOSFET_D4184",
        "16_Active_Buzzer", "17_DC_Jack", "18_Power_Switch",
    ]
    missing_components = [
        name for name in required_components if name not in component_names
    ]

    checks = {
        "body_count_140": len(bodies) == 140,
        "all_bodies_valid": not invalid_bodies,
        "all_bodies_solid": not non_solid_bodies,
        "timeline_healthy": not timeline_issues,
        "required_components_present": not missing_components,
        "door_reveal_gap_1_5_mm": abs(
            (reveal_box["min"][0] - door_box["max"][0]) - 1.5
        ) < 1e-6,
        "reveal_meets_right_panel": abs(
            reveal_box["max"][0] - right_panel_box["min"][0]
        ) < 1e-6,
        "reveal_spans_front_to_rear": (
            abs(reveal_box["min"][1]) < 1e-6
            and abs(reveal_box["max"][1] - 200.0) < 1e-6
        ),
        "reveal_valid_single_solid": (
            reveal.isValid and reveal.isSolid and reveal.lumps.count == 1
        ),
        "reveal_front_face_present": (
            bool(front_face_areas_cm2) and max(front_face_areas_cm2) >= 16.999
        ),
        "rocker_protrudes_2_mm": abs(rocker_box["max"][1] - 222.0) < 1e-6,
        "rocker_embeds_housing_1_mm": (
            abs(rocker_box["min"][1] - 219.0) < 1e-6
            and abs(housing_box["max"][1] - 220.0) < 1e-6
        ),
        "dht_touches_rear_cover": abs(
            dht_box["max"][1] - rear_cover_box["min"][1]
        ) < 1e-6,
        "led_touches_shelf_underside": abs(
            led_box["max"][2] - shelf_box["min"][2]
        ) < 1e-6,
        "joint_limits_0_to_105": (
            limits.isMinimumValueEnabled and limits.isMaximumValueEnabled
            and abs(math.degrees(limits.minimumValue)) < 1e-6
            and abs(math.degrees(limits.maximumValue) - 105.0) < 1e-6
        ),
        "joint_drive_0_105_0": (
            abs(driven_105 - 105.0) < 1e-6 and abs(driven_0) < 1e-6
        ),
        "door_only_dynamic": (
            not ungrounded_static and not door_occurrence.isGroundToParent
        ),
        "viva_named_views_present": all(
            any(name.startswith(prefix) for name in named_views)
            for prefix in expected_named_view_prefixes
        ),
    }

    result = {
        "verified_at": _dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        "document": app.activeDocument.name,
        "units": "mm unless stated",
        "counts": {
            "components": design.allComponents.count,
            "occurrences": root.allOccurrences.count,
            "bodies": len(bodies),
            "timeline": design.timeline.count,
            "user_parameters": design.userParameters.count,
            "named_views": len(named_views),
        },
        "checks": checks,
        "overall": "PASS" if all(checks.values()) else "FAIL",
        "invalid_bodies": invalid_bodies,
        "non_solid_bodies": non_solid_bodies,
        "invisible_bodies": invisible_bodies,
        "timeline_issues": timeline_issues,
        "missing_components": missing_components,
        "door_reveal": {
            "door_bbox": door_box,
            "reveal_bbox": reveal_box,
            "right_panel_bbox": right_panel_box,
            "gap_mm": round(reveal_box["min"][0] - door_box["max"][0], 4),
            "volume_cm3": round(reveal.volume, 6),
            "lumps": reveal.lumps.count,
            "faces": reveal.faces.count,
            "front_face_areas_cm2": front_face_areas_cm2,
        },
        "rear_power": {
            "rocker_bbox": rocker_box,
            "housing_bbox": housing_box,
            "protrusion_beyond_rear_plane_mm": round(
                rocker_box["max"][1] - 220.0, 4
            ),
            "embedded_depth_mm": round(220.0 - rocker_box["min"][1], 4),
        },
        "mounting_contacts": {
            "dht_bbox": dht_box,
            "rear_cover_bbox": rear_cover_box,
            "dht_contact_gap_mm": round(
                rear_cover_box["min"][1] - dht_box["max"][1], 4
            ),
            "led_bbox": led_box,
            "shelf_bbox": shelf_box,
            "led_shelf_gap_mm": round(
                shelf_box["min"][2] - led_box["max"][2], 4
            ),
            "oled_window_bbox": bbox_mm(oled_window),
            "oled_pcb_bbox": bbox_mm(oled_pcb),
        },
        "joint": {
            "name": door_joint.name,
            "minimum_degrees": round(math.degrees(limits.minimumValue), 6),
            "maximum_degrees": round(math.degrees(limits.maximumValue), 6),
            "driven_to_degrees": [driven_105, driven_0],
        },
        "grounding": {
            "door_isGroundToParent": bool(door_occurrence.isGroundToParent),
            "ungrounded_static": ungrounded_static,
            "rows": grounding,
        },
        "named_views": named_views,
    }
    with open(RESULT_PATH, "w", encoding="utf-8") as stream:
        json.dump(result, stream, ensure_ascii=True, indent=2)
        stream.write("\n")
    print(json.dumps({
        "path": RESULT_PATH,
        "overall": result["overall"],
        "checks": checks,
        "counts": result["counts"],
    }, ensure_ascii=True))
