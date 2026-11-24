"""Turn downloaded CC0 packs into the forest GLBs.

Sources (see forest/CREDITS.md):
- Quaternius Universal Base Characters, female superhero body, and Hair Long
- Quaternius Universal Animation Library (in-place clips)
- Quaternius Ultimate Nature Pack (trees, rocks, grass, logs)
- Quaternius Cute Animated Monsters, Alien Tall
"""
import math
import os

import bmesh
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


def flatten_chest(obj, chest_z):
    """Pull the front of the ribcage in so the body reads as athletic."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for v in bm.verts:
        if abs(v.co.z - chest_z) > 0.15 or v.co.y > 0.02:
            continue
        v.co.x *= 0.82
        v.co.y = v.co.y * 0.62
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def torso_shell(src, name, material, z0, z1, xlim):
    obj = src.copy()
    obj.data = src.data.copy()
    obj.name = name
    bpy.context.scene.collection.objects.link(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    doomed = [v for v in bm.verts if v.co.z < z0 or v.co.z > z1 or abs(v.co.x) > xlim]
    bmesh.ops.delete(bm, geom=doomed, context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.materials.clear()
    obj.data.materials.append(material)
    shell = obj.modifiers.new("shell", "SOLIDIFY")
    shell.thickness = 0.018
    shell.offset = 1
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier="shell")
    return obj


def star_image():
    img = bpy.data.images.new("skirt_stars", 128, 128)
    px = [0.08, 0.16, 0.52, 1.0] * (128 * 128)

    def plot(x, y):
        if 0 <= x < 128 and 0 <= y < 128:
            i = (y * 128 + x) * 4
            px[i:i + 3] = (0.95, 0.93, 0.82)

    def star(cx, cy, r):
        for i in range(5):
            a0 = -math.pi / 2 + i * math.tau / 5
            a1 = a0 + math.tau / 10
            x0, y0 = cx + math.cos(a0) * r, cy + math.sin(a0) * r
            x1, y1 = cx + math.cos(a1) * r * 0.4, cy + math.sin(a1) * r * 0.4
            steps = 8
            for s in range(steps + 1):
                t = s / steps
                plot(int(cx + (x0 - cx) * t), int(cy + (y0 - cy) * t))
                plot(int(cx + (x1 - cx) * t), int(cy + (y1 - cy) * t))
                plot(int(x0), int(y0))

    for cx, cy, r in (
        (24, 30, 8), (70, 22, 6), (108, 40, 9), (40, 78, 7),
        (88, 70, 10), (20, 110, 6), (64, 108, 8), (110, 100, 7),
        (96, 48, 5), (50, 52, 5),
    ):
        star(cx, cy, r)
    img.pixels.foreach_set(px)
    img.pack()
    return img


def skirt_material(image):
    m = mat("skirt", (0.1, 0.16, 0.5), 0.55)
    nodes = m.node_tree.nodes
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    m.node_tree.links.new(tex.outputs["Color"], nodes["Principled BSDF"].inputs["Base Color"])
    return m


def flared_skirt(arm, hips, knee_z, material):
    mesh = bpy.data.meshes.new("skirt")
    obj = bpy.data.objects.new("skirt", mesh)
    bpy.context.scene.collection.objects.link(obj)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    segs, rings = 20, 7
    top = hips.z + 0.02
    bot = knee_z + 0.02
    verts = []
    for r in range(rings):
        t = r / (rings - 1)
        z = top + (bot - top) * t
        rad = 0.16 + 0.2 * t
        ring = []
        for s in range(segs):
            a = s / segs * math.tau
            v = bm.verts.new((math.cos(a) * rad, math.sin(a) * rad, z))
            ring.append(v)
        verts.append(ring)
    bm.verts.ensure_lookup_table()
    for r in range(rings - 1):
        for s in range(segs):
            s2 = (s + 1) % segs
            face = bm.faces.new((verts[r][s], verts[r][s2], verts[r + 1][s2], verts[r + 1][s]))
            for loop in face.loops:
                co = loop.vert.co
                ang = (math.atan2(co.y, co.x) + math.pi) / math.tau
                height = (co.z - bot) / max(0.01, top - bot)
                loop[uv].uv = (ang, height)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(material)
    stick(obj, arm, "pelvis")
    return obj


def bone_cylinder(arm, bone_name, material, radius, name):
    bone = arm.data.bones[bone_name]
    head = arm.matrix_world @ bone.head_local
    tail = arm.matrix_world @ bone.tail_local
    mid = (head + tail) * 0.5
    length = (tail - head).length
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=max(0.08, length * 0.92), location=mid, vertices=10)
    obj = bpy.context.active_object
    obj.name = name
    direction = (tail - head)
    if direction.length > 1e-4:
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    bpy.ops.object.transform_apply(rotation=True)
    obj.data.materials.append(material)
    stick(obj, arm, bone_name)
    return obj


def add_cape(arm, chest):
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones
    spine = eb["spine_03"]
    prev = spine
    y = spine.head.y + 0.1
    z = spine.head.z - 0.02
    x = spine.head.x
    for i in range(1, 5):
        bone = eb.new("cape.%d" % i)
        bone.head = Vector((x, y, z))
        z -= 0.2
        bone.tail = Vector((x, y + 0.015, z))
        bone.parent = prev
        prev = bone
    bpy.ops.object.mode_set(mode="OBJECT")
    cape_m = mat("cape", (0.62, 0.07, 0.1), 0.65)
    mesh = bpy.data.meshes.new("cape")
    obj = bpy.data.objects.new("cape", mesh)
    bpy.context.scene.collection.objects.link(obj)
    bm = bmesh.new()
    cols, rows = 5, 4
    grid = []
    for r in range(rows):
        t = r / (rows - 1)
        zz = chest.z - 0.05 - t * 0.78
        width = 0.34 + t * 0.16
        row = []
        for c in range(cols):
            u = c / (cols - 1) - 0.5
            row.append(bm.verts.new((u * width, chest.y + 0.12 + t * 0.04, zz)))
        grid.append(row)
    for r in range(rows - 1):
        for c in range(cols - 1):
            bm.faces.new((grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]))
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(cape_m)
    for r, vert_row in enumerate(grid):
        # grid verts were copied into the mesh in the same order
        pass
    # Weight each horizontal band to its cape bone. Vertex order is row-major.
    names = ["cape.1", "cape.2", "cape.3", "cape.4"]
    groups = {n: obj.vertex_groups.new(name=n) for n in names}
    index = 0
    for r in range(rows):
        for _c in range(cols):
            groups[names[min(r, 3)]].add([index], 1.0, "REPLACE")
            index += 1
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    obj.parent = arm
    return obj


def add_readable_eyes(arm, eyes):
    xs = [v.co.x for v in eyes.data.vertices]
    if not xs:
        return
    mid = (min(xs) + max(xs)) * 0.5
    white = mat("heroEye", (0.95, 0.95, 0.93), 0.25)
    ink = mat("heroPupil", (0.12, 0.08, 0.06), 0.3)
    for sign, tag in ((1, "L"), (-1, "R")):
        cluster = [v.co for v in eyes.data.vertices if (v.co.x - mid) * sign > 0]
        if not cluster:
            continue
        center = sum(cluster, Vector()) / len(cluster)
        center.y -= 0.012
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.03, location=center, segments=10, ring_count=8)
        eye = bpy.context.active_object
        eye.name = "heroEye" + tag
        eye.data.materials.append(white)
        stick(eye, arm, "Head")
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.014, location=center + Vector((0, -0.02, 0)), segments=8, ring_count=6)
        pupil = bpy.context.active_object
        pupil.name = "heroPupil" + tag
        pupil.data.materials.append(ink)
        stick(pupil, arm, "Head")


def push_face_forward(obj, scale, nudge):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    if not bm.verts:
        bm.free()
        return
    center = sum((v.co for v in bm.verts), Vector()) / len(bm.verts)
    for v in bm.verts:
        v.co.x = center.x + (v.co.x - center.x) * scale
        v.co.z = center.z + (v.co.z - center.z) * scale
        v.co.y -= nudge
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def make_boot(arm, side, material, gold):
    calf = arm.data.bones["calf_" + side]
    foot = arm.data.bones["foot_" + side]
    knee = calf.head_local
    ankle = foot.head_local
    toe = foot.tail_local
    mesh = bpy.data.meshes.new("boot" + side)
    obj = bpy.data.objects.new("boot" + side.upper(), mesh)
    bpy.context.scene.collection.objects.link(obj)
    bm = bmesh.new()
    segs = 10

    def ring(origin, radius, axis_y=0.0):
        out = []
        for i in range(segs):
            a = i / segs * math.tau
            out.append(bm.verts.new((
                origin.x + math.cos(a) * radius,
                origin.y + axis_y + math.sin(a) * radius * 0.85,
                origin.z,
            )))
        return out

    shaft = [
        ring(knee, 0.075),
        ring((knee + ankle) * 0.5, 0.068),
        ring(ankle, 0.07),
    ]
    foot_rings = [
        ring(ankle, 0.062),
        ring((ankle + toe) * 0.5, 0.058, -0.01),
        ring(Vector((toe.x, toe.y - 0.02, max(0.03, toe.z))), 0.045, -0.01),
    ]
    rings = shaft + foot_rings
    for a, b in zip(rings, rings[1:]):
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(material)
    calf_g = obj.vertex_groups.new(name="calf_" + side)
    foot_g = obj.vertex_groups.new(name="foot_" + side)
    for i, v in enumerate(mesh.vertices):
        if v.co.z >= ankle.z - 0.01:
            calf_g.add([i], 1.0, "REPLACE")
        else:
            foot_g.add([i], 1.0, "REPLACE")
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    obj.parent = arm
    cuff_z = knee.z - 0.02
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.078, minor_radius=0.014,
        location=(knee.x, knee.y, cuff_z), major_segments=14, minor_segments=6,
    )
    cuff = bpy.context.active_object
    cuff.name = "bootgold" + side.upper()
    cuff.rotation_euler.x = math.pi / 2
    bpy.ops.object.transform_apply(rotation=True)
    cuff.data.materials.append(gold)
    stick(cuff, arm, "calf_" + side)


def dress_hero(arm):
    bpy.context.view_layer.update()
    body = next(o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith("Superhero"))
    chest = bone_pos(arm, "spine_03")
    hips = bone_pos(arm, "pelvis")
    knee = bone_pos(arm, "calf_l")
    head = bone_pos(arm, "Head")
    flatten_chest(body, chest.z)
    red = mat("bodice", (0.74, 0.09, 0.11), 0.42)
    gold = mat("gold", (0.95, 0.74, 0.25), 0.28)
    bootm = mat("boot", (0.62, 0.08, 0.1), 0.4)
    lasso_m = mat("lasso", (1.0, 0.82, 0.28), 0.25, emit=2.4)
    torso_shell(body, "bodice", red, hips.z + 0.02, chest.z + 0.18, 0.22)
    flared_skirt(arm, hips, knee.z, skirt_material(star_image()))
    for side, bone in (("L", "lowerarm_l"), ("R", "lowerarm_r")):
        bone_cylinder(arm, bone, gold, 0.048, "bracer" + side)
    for side in ("l", "r"):
        make_boot(arm, side, bootm, gold)
    eyes = next((o for o in bpy.data.objects if o.name == "Eyes"), None)
    if eyes:
        push_face_forward(eyes, 1.7, 0.025)
        add_readable_eyes(arm, eyes)
    brows = next((o for o in bpy.data.objects if o.name == "Eyebrows"), None)
    if brows:
        push_face_forward(brows, 1.35, 0.016)
    add_cape(arm, chest)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.12, minor_radius=0.018, location=(head.x, head.y - 0.02, head.z + 0.16), major_segments=18, minor_segments=6)
    tiara = bpy.context.active_object
    tiara.name = "tiara"
    tiara.scale = (1.15, 0.9, 0.55)
    bpy.ops.object.transform_apply(scale=True)
    tiara.data.materials.append(gold)
    stick(tiara, arm, "Head")
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.028, location=(head.x, head.y - 0.09, head.z + 0.09), segments=10, ring_count=8)
    star = bpy.context.active_object
    star.name = "star"
    star.data.materials.append(mat("starcol", (0.8, 0.1, 0.12), 0.35))
    stick(star, arm, "Head")
    bpy.ops.mesh.primitive_cylinder_add(radius=0.045, depth=0.012, location=(chest.x, chest.y - 0.14, chest.z + 0.02), vertices=16)
    emblem = bpy.context.active_object
    emblem.name = "emblem"
    emblem.rotation_euler.x = math.pi / 2
    bpy.ops.object.transform_apply(rotation=True)
    emblem.data.materials.append(gold)
    stick(emblem, arm, "spine_03")
    hip = Vector((hips.x + 0.14, hips.y - 0.06, hips.z - 0.04))
    bpy.ops.mesh.primitive_torus_add(major_radius=0.07, minor_radius=0.012, location=hip, major_segments=16, minor_segments=6)
    lasso = bpy.context.active_object
    lasso.name = "lasso"
    lasso.rotation_euler = (1.1, 0.4, 0.2)
    bpy.ops.object.transform_apply(rotation=True)
    lasso.data.materials.append(lasso_m)
    stick(lasso, arm, "pelvis")
    empty = bpy.data.objects.new("face", None)
    bpy.context.scene.collection.objects.link(empty)
    empty.parent = arm
    bpy.context.view_layer.update()
    print("hero bounds", mesh_bounds(meshes()))


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

    dress_hero(arm)
    export(os.path.join(OUT, "hero.glb"), [arm])


def paint(color):
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        node = m.node_tree.nodes.get("Principled BSDF")
        if node:
            node.inputs["Base Color"].default_value = (*color, 1)


def vert_weight(obj, index, name):
    group = obj.vertex_groups.get(name)
    if group is None:
        return 0.0
    try:
        return group.weight(index)
    except RuntimeError:
        return 0.0


def reshape_alien(mesh, arm):
    """Keep the skinned alien mesh. Round the head onto the head bone and stretch the torso up to it."""
    center = arm.data.bones["Head2"].head_local.copy() if "Head2" in arm.data.bones else arm.data.bones["Head"].head_local.copy()
    kinds = []
    for v in mesh.data.vertices:
        head_w = vert_weight(mesh, v.index, "Head") + vert_weight(mesh, v.index, "Head2") + vert_weight(mesh, v.index, "Head3")
        body_w = vert_weight(mesh, v.index, "Body") + vert_weight(mesh, v.index, "Mouth")
        kinds.append("head" if head_w >= body_w else "body")
    body_z = [v.co.z for v, k in zip(mesh.data.vertices, kinds) if k == "body"]
    z0 = min(body_z) if body_z else 0.0
    z1 = max(body_z) if body_z else 0.4
    target_top = center.z - 0.3
    for v, kind in zip(mesh.data.vertices, kinds):
        if kind == "head":
            d = v.co - center
            dist = d.length
            v.co = center + (d / dist * 0.34 if dist > 1e-5 else Vector((0.0, -0.34, 0.0)))
        else:
            t = (v.co.z - z0) / max(1e-4, z1 - z0)
            v.co.x *= 0.7
            v.co.y *= 0.7
            v.co.z = z0 + t * max(0.2, target_top - z0)
    mesh.data.update()
    for attr in list(mesh.data.color_attributes):
        mesh.data.color_attributes.remove(attr)
    print("alien reshaped, head", tuple(round(c, 2) for c in center), "body", round(z0, 2), round(target_top, 2))
    return center


def pose_arms(arm, action, clip):
    bpy.context.view_layer.objects.active = arm
    if bpy.context.object.mode != "POSE":
        bpy.ops.object.mode_set(mode="POSE")
    for bone in arm.pose.bones:
        if bone.name.startswith("arm_") or bone.name.startswith("forearm_"):
            bone.rotation_mode = "XYZ"
    bpy.ops.object.mode_set(mode="OBJECT")
    start, end = action.frame_range
    mid = (start + end) * 0.5

    def key(bone, frame, rot):
        path = 'pose.bones["%s"].rotation_euler' % bone
        for index, value in enumerate(rot):
            curve = action.fcurves.find(path, index=index)
            if curve is None:
                curve = action.fcurves.new(path, index=index)
            curve.keyframe_points.insert(frame, value)

    if clip == "wave":
        key("arm_R", start, (0.2, 0.0, 0.2))
        key("arm_R", mid, (-1.35, 0.0, 0.35))
        key("arm_R", end, (0.2, 0.0, 0.2))
        key("forearm_R", mid, (-0.6, 0.0, 0.0))
        return
    swing = 0.85 if clip in ("stalk", "chase", "lunge") else 0.25
    key("arm_L", start, (swing, 0.0, -0.25))
    key("arm_R", start, (-swing, 0.0, 0.25))
    key("arm_L", mid, (-swing, 0.0, -0.25))
    key("arm_R", mid, (swing, 0.0, 0.25))
    key("arm_L", end, (swing, 0.0, -0.25))
    key("arm_R", end, (-swing, 0.0, 0.25))


def add_stick_limb(arm, parent_name, names, points, radius, material):
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones
    prev = eb[parent_name]
    made = []
    for name, head, tail in zip(names, points, points[1:]):
        bone = eb.new(name)
        bone.head = Vector(head)
        bone.tail = Vector(tail)
        bone.parent = prev
        prev = bone
        made.append(name)
    bpy.ops.object.mode_set(mode="OBJECT")
    for name in made:
        bone_cylinder(arm, name, material, radius, name + "_mesh")
    return made


def build_monster():
    wipe()
    new = import_fbx(MON)
    print("monster actions", sorted(a.name for a in bpy.data.actions))
    arm = next(o for o in new if o.type == "ARMATURE")
    roots = [o for o in new if o.parent is None]
    fit_height(roots, 2.45)
    bpy.context.view_layer.update()
    alien = next(o for o in bpy.data.objects if o.type == "MESH")
    center = reshape_alien(alien, arm)
    for slot in alien.data.materials:
        if not slot or not slot.use_nodes:
            continue
        node = slot.node_tree.nodes.get("Principled BSDF")
        if not node:
            continue
        for link in list(slot.node_tree.links):
            if link.to_node == node and link.to_socket == node.inputs["Base Color"]:
                slot.node_tree.links.remove(link)
        node.inputs["Base Color"].default_value = (0.82, 0.09, 0.1, 1)
    dark = mat("limb", (0.07, 0.045, 0.05), 0.55)
    shoulder_z = center.z - 0.28
    for sign, tag in ((1, "L"), (-1, "R")):
        add_stick_limb(
            arm, "Body",
            ["arm_%s" % tag, "forearm_%s" % tag],
            [
                (sign * 0.28, center.y - 0.05, shoulder_z),
                (sign * 0.62, center.y - 0.12, shoulder_z - 0.85),
                (sign * 0.72, center.y - 0.16, 0.02),
            ],
            0.06, dark,
        )
    head_bone = "Head2" if "Head2" in arm.data.bones else "Head"
    head = center
    white = mat("eyeWhite", (0.96, 0.96, 0.94), 0.25)
    ink = mat("pupil", (0.06, 0.02, 0.03), 0.3)
    glow = mat("glowEye", (1.0, 0.86, 0.35), 0.2, emit=4.0)
    night_ink = mat("nightMouth", (0.12, 0.02, 0.03), 0.4)
    tooth_m = mat("tooth", (0.95, 0.93, 0.88), 0.3)
    hairm = mat("spikes", (0.04, 0.03, 0.035), 0.6)

    front = head.y - 0.3

    def feature(kind, name, material, loc, radius):
        if kind == "cone":
            bpy.ops.mesh.primitive_cone_add(radius1=radius, depth=radius * 3.2, location=loc, vertices=6)
        elif kind == "torus":
            bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=radius * 0.28, location=loc, major_segments=14, minor_segments=6)
        else:
            bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=loc, segments=12, ring_count=8)
        obj = bpy.context.active_object
        obj.name = name
        if kind == "torus":
            obj.rotation_euler = (math.pi / 2, 0, 0)
            bpy.ops.object.transform_apply(rotation=True)
        obj.data.materials.append(material)
        stick(obj, arm, head_bone)
        return obj

    for s, tag in ((1, "L"), (-1, "R")):
        feature("uv", "faceDayeye" + tag, white, (head.x + s * 0.11, front, head.z + 0.04), 0.09)
        feature("uv", "faceDaypup" + tag, ink, (head.x + s * 0.11, front - 0.04, head.z + 0.03), 0.04)
        feature("uv", "faceNighteye" + tag, glow, (head.x + s * 0.11, front - 0.02, head.z + 0.04), 0.065)
    feature("torus", "faceNightmouth", night_ink, (head.x, front - 0.02, head.z - 0.1), 0.11)
    for i, x in enumerate((-0.07, 0, 0.07)):
        feature("cone", "faceNighttooth" + str(i), tooth_m, (head.x + x, front - 0.03, head.z - 0.14), 0.018)
    for i, (x, dz) in enumerate(((-0.18, 0.42), (-0.06, 0.52), (0.08, 0.48), (0.2, 0.38), (0.0, 0.58))):
        feature("cone", "spike" + str(i), hairm, (head.x + x, head.y - 0.05, head.z + dz), 0.055)
    print("monster height", mesh_bounds(meshes())[1].z)
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
        pose_arms(arm, copy, clip)
        add_nla(arm, copy, clip)
    export(os.path.join(OUT, "monster.glb"), [arm])


if __name__ == "__main__":
    only = os.environ.get("ONLY", "")
    if only in ("", "props"):
        build_props()
    if only in ("", "hero"):
        build_hero()
    if only in ("", "monster"):
        build_monster()
    print("done")
