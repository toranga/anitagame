"""Turn downloaded CC0 packs into the forest GLBs.

Sources (see forest/CREDITS.md):
- Quaternius Universal Base Characters, female superhero body, and Hair Long
- Quaternius Universal Animation Library (in-place clips)
- Quaternius Ultimate Nature Pack (trees, rocks, grass, logs)
- Quaternius Cute Animated Monsters, Alien Tall
"""
import math
import os

import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "forest", "models")
CHARS = "/tmp/assets/chars"
FBX = "/tmp/assets/fbx"
MON = "/tmp/assets/mon/Alien_Tall.fbx"
os.makedirs(OUT, exist_ok=True)


def wipe():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.images):
        for item in list(block):
            if item.users == 0:
                block.remove(item)
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)


def export(path, objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
        for child in obj.children_recursive:
            child.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_yup=True,
        export_skins=True,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_nla_strips=True,
    )
    print("wrote", os.path.basename(path), os.path.getsize(path))


def mesh_bounds(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for obj in objs:
        if obj.type != "MESH":
            continue
        for v in obj.data.vertices:
            p = obj.matrix_world @ v.co
            lo.x, lo.y, lo.z = min(lo.x, p.x), min(lo.y, p.y), min(lo.z, p.z)
            hi.x, hi.y, hi.z = max(hi.x, p.x), max(hi.y, p.y), max(hi.z, p.z)
    return lo, hi


def meshes():
    return [o for o in bpy.data.objects if o.type == "MESH"]


def armatures():
    return [o for o in bpy.data.objects if o.type == "ARMATURE"]


def import_fbx(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def import_gltf(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def fit_height(objs, height):
    bpy.context.view_layer.update()
    lo, hi = mesh_bounds(objs)
    h = hi.z - lo.z
    if h < 1e-4:
        return
    scale = height / h
    for obj in objs:
        if obj.parent is None:
            obj.scale = (obj.scale.x * scale, obj.scale.y * scale, obj.scale.z * scale)
            obj.location.z = (obj.location.z - lo.z) * scale
    bpy.context.view_layer.update()
    lo, hi = mesh_bounds(objs)
    for obj in objs:
        if obj.parent is None:
            obj.location.z -= lo.z
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objs:
        if obj.parent is None:
            obj.select_set(True)
    if bpy.context.selected_objects:
        bpy.context.view_layer.objects.active = bpy.context.selected_objects[0]
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def convert_prop(src, dest, height):
    wipe()
    new = import_fbx(src)
    roots = [o for o in new if o.parent is None]
    fit_height(roots or new, height)
    export(os.path.join(OUT, dest), roots or new)


def mat(name, color, rough=0.45, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    if emit:
        b.inputs["Emission Color"].default_value = (*color, 1)
        b.inputs["Emission Strength"].default_value = emit
    return m


def bone_pos(arm, name):
    bone = arm.data.bones[name]
    return arm.matrix_world @ bone.head_local


def stick(obj, arm, bone):
    group = obj.vertex_groups.new(name=bone)
    group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    obj.parent = arm


def add_nla(arm, action, name):
    if arm.animation_data is None:
        arm.animation_data_create()
    track = arm.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 1, action)
    strip.name = name


def build_props():
    jobs = [
        ("PineTree_1.fbx", "tree_pine.glb", 8.0),
        ("PineTree_2.fbx", "tree_pine2.glb", 7.2),
        ("CommonTree_1.fbx", "tree_oak.glb", 7.4),
        ("BirchTree_1.fbx", "tree_broad.glb", 7.0),
        ("Rock_1.fbx", "rock.glb", 0.7),
        ("Rock_2.fbx", "rock2.glb", 0.55),
        ("Grass.fbx", "grass.glb", 0.45),
        ("WoodLog.fbx", "log.glb", 0.4),
        ("TreeStump.fbx", "stump.glb", 0.55),
        ("Bush_1.fbx", "bush.glb", 0.9),
        ("Plant_1.fbx", "fern.glb", 0.55),
    ]
    for src, dest, height in jobs:
        print("prop", src)
        convert_prop(os.path.join(FBX, src), dest, height)


def build_hero():
    wipe()
    body = import_gltf(os.path.join(CHARS, "superhero_female_full_body.gltf"))
    arm = next(o for o in body if o.type == "ARMATURE")
    hair = import_gltf(os.path.join(CHARS, "hair_long.gltf"))
    hair_mesh = next(o for o in hair if o.type == "MESH")
    for mod in hair_mesh.modifiers:
        if mod.type == "ARMATURE":
            mod.object = arm
    hair_mesh.parent = arm
    hair_mesh.name = "hair"
    for obj in hair:
        if obj.type == "ARMATURE":
            bpy.data.objects.remove(obj, do_unlink=True)
    before_actions = set(bpy.data.actions)
    ual = import_gltf(os.path.join(CHARS, "ual1_standard.glb"))
    for obj in ual:
        bpy.data.objects.remove(obj, do_unlink=True)
    print("actions", sorted(a.name for a in bpy.data.actions))
    wanted = {
        "idle": "Idle_Loop",
        "walk": "Walk_Loop",
        "run": "Sprint_Loop",
        "scared_run": "Jog_Fwd_Loop",
        "jump": "Jump_Start",
        "crouch": "Crouch_Idle_Loop",
        "lasso": "Sword_Attack",
        "scared_idle": "Idle_Loop",
    }
    for clip, source in wanted.items():
        action = next(a for a in bpy.data.actions if a.name == source or a.name.startswith(source + "_"))
        if clip != source:
            action = action.copy()
            action.name = clip
        add_nla(arm, action, clip)

    bpy.context.view_layer.update()
    head = bone_pos(arm, "Head")
    chest = bone_pos(arm, "spine_03")
    hips = bone_pos(arm, "pelvis")
    hand = bone_pos(arm, "hand_r")

    def primitive(kind, name, material, bone, location, scale, rotation=(0, 0, 0)):
        if kind == "uv":
            bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=location, segments=16, ring_count=10)
        elif kind == "cone":
            bpy.ops.mesh.primitive_cone_add(radius1=1, depth=1, location=location, vertices=16)
        elif kind == "cyl":
            bpy.ops.mesh.primitive_cylinder_add(radius=1, depth=1, location=location, vertices=12)
        elif kind == "torus":
            bpy.ops.mesh.primitive_torus_add(major_radius=0.11, minor_radius=0.018, location=location, major_segments=20, minor_segments=8)
        else:
            bpy.ops.mesh.primitive_plane_add(size=1, location=location)
        obj = bpy.context.active_object
        obj.name = name
        obj.scale = scale
        obj.rotation_euler = rotation
        bpy.ops.object.transform_apply(scale=True, rotation=True)
        obj.data.materials.append(material)
        stick(obj, arm, bone)
        return obj

    red = mat("bodice", (0.72, 0.08, 0.1), 0.4)
    blue = mat("skirt", (0.12, 0.18, 0.55), 0.5)
    gold = mat("gold", (0.95, 0.72, 0.22), 0.28)
    boot = mat("boot", (0.55, 0.06, 0.08), 0.4)
    cape = mat("cape", (0.62, 0.06, 0.1), 0.6)
    lasso = mat("lasso", (1.0, 0.82, 0.3), 0.2, emit=3.0)
    primitive("uv", "bodice", red, "spine_03", (chest.x, chest.y - 0.04, chest.z), (0.18, 0.12, 0.17))
    primitive("cone", "skirt", blue, "pelvis", (hips.x, hips.y, hips.z - 0.2), (0.28, 0.28, 0.36), (math.pi, 0, 0))
    for side, bone in (("L", "lowerarm_l"), ("R", "lowerarm_r")):
        p = bone_pos(arm, bone)
        primitive("cyl", "bracer" + side, gold, bone, (p.x, p.y, p.z), (0.045, 0.045, 0.08))
    for side, bone in (("L", "foot_l"), ("R", "foot_r")):
        p = bone_pos(arm, bone)
        primitive("uv", "boot" + side, boot, bone, (p.x, p.y - 0.04, p.z + 0.02), (0.055, 0.1, 0.08))
    primitive("plane", "cape", cape, "spine_03", (chest.x, chest.y + 0.08, chest.z - 0.15), (0.42, 1, 0.7), (math.pi / 2, 0, 0))
    primitive("torus", "tiara", gold, "Head", (head.x, head.y - 0.02, head.z + 0.08), (1.15, 0.75, 0.45))
    primitive("uv", "star", mat("starcol", (0.8, 0.08, 0.1), 0.3), "Head", (head.x, head.y - 0.1, head.z + 0.1), (0.028, 0.02, 0.028))
    primitive("torus", "lasso", lasso, "hand_r", (hand.x, hand.y - 0.02, hand.z), (0.7, 0.7, 0.7))
    empty = bpy.data.objects.new("face", None)
    bpy.context.scene.collection.objects.link(empty)
    empty.parent = arm
    bpy.context.view_layer.update()
    print("hero bounds", mesh_bounds(meshes()))
    export(os.path.join(OUT, "hero.glb"), [arm])


def paint(color):
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        node = m.node_tree.nodes.get("Principled BSDF")
        if node:
            node.inputs["Base Color"].default_value = (*color, 1)


def build_monster():
    wipe()
    new = import_fbx(MON)
    print("monster actions", sorted(a.name for a in bpy.data.actions))
    print("monster bones", [b.name for b in next(o for o in new if o.type == "ARMATURE").data.bones][:40])
    arm = next(o for o in new if o.type == "ARMATURE")
    roots = [o for o in new if o.parent is None]
    fit_height(roots, 2.7)
    for obj in roots:
        obj.scale.x *= 0.5
        obj.scale.y *= 0.5
    bpy.ops.object.select_all(action="DESELECT")
    for obj in roots:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = roots[0]
    bpy.ops.object.transform_apply(scale=True)
    paint((0.78, 0.08, 0.09))
    bpy.context.view_layer.update()
    names = {b.name.lower(): b.name for b in arm.data.bones}
    head_name = names.get("head") or names.get("head_end") or next((n for n in names if "head" in n), None)
    print("head bone", head_name, "height", mesh_bounds(meshes())[1].z)
    if head_name:
        white = mat("eyeWhite", (0.95, 0.95, 0.93), 0.2)
        dark = mat("pupil", (0.05, 0.02, 0.02), 0.3)
        hairm = mat("spikes", (0.05, 0.04, 0.04), 0.6)
        night = mat("nightMouth", (0.15, 0.02, 0.03), 0.4)

        def pin(kind, name, material, loc, radius=0.08):
            if kind == "cone":
                bpy.ops.mesh.primitive_cone_add(radius1=radius, depth=radius * 3, location=(0, 0, 0), vertices=6)
            else:
                bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=(0, 0, 0), segments=12, ring_count=8)
            obj = bpy.context.active_object
            obj.name = name
            obj.data.materials.append(material)
            obj.parent = arm
            obj.parent_type = "BONE"
            obj.parent_bone = head_name
            obj.location = loc
            return obj

        for s, tag in ((1, "L"), (-1, "R")):
            pin("uv", "faceDayeye" + tag, white, (s * 0.08, 0.12, 0.06), 0.07)
            pin("uv", "faceDaypup" + tag, dark, (s * 0.08, 0.16, 0.06), 0.03)
        for i, x in enumerate((-0.08, -0.02, 0.04, 0.1)):
            pin("cone", "spike" + str(i), hairm, (x, 0.02, 0.16), 0.035)
        pin("uv", "faceNightmouth", night, (0, 0.14, -0.02), 0.05)
    # Map whatever clips the pack shipped to the names the game already plays.
    aliases = {
        "idle": ("idle",),
        "wave": ("yes", "wave", "talk"),
        "stalk": ("walk",),
        "chase": ("run", "sprint", "walk"),
        "lunge": ("attack", "bite", "punch", "hit"),
    }
    used = set()
    for clip, keys in aliases.items():
        action = None
        for key in keys:
            for candidate in bpy.data.actions:
                if key in candidate.name.lower() and candidate not in used:
                    action = candidate
                    break
            if action:
                break
        if action is None:
            print("missing clip", clip)
            continue
        copy = action.copy()
        copy.name = clip
        add_nla(arm, copy, clip)
    export(os.path.join(OUT, "monster.glb"), [arm])


if __name__ == "__main__":
    build_props()
    build_hero()
    build_monster()
    print("done")
