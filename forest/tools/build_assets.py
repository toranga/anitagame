# Blender 4 headless build. Characters are fused organic meshes with armatures
# and animation clips. Trees come from the bundled Sapling generator.
import math
import os
import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "models")
os.makedirs(OUT, exist_ok=True)


def wipe():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for act in list(bpy.data.actions):
        bpy.data.actions.remove(act)
    for coll in (bpy.data.meshes, bpy.data.metaballs, bpy.data.armatures, bpy.data.materials, bpy.data.curves):
        for item in list(coll):
            if item.users == 0:
                coll.remove(item)


def smooth(obj):
    for p in obj.data.polygons:
        p.use_smooth = True


def mat(name, color, rough=0.5, metal=0.0, emit=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = strength
    return m


def assign(obj, material):
    obj.data.materials.append(material)
    smooth(obj)


def chain(mb, points, radius):
    for p in points:
        el = mb.data.elements.new(type="BALL")
        el.co = p
        el.radius = radius
        el.stiffness = 2.0


def fuse(points_radii, resolution=0.03):
    bpy.ops.object.metaball_add(type="BALL", radius=0.2, location=(0, 0, 0))
    mb = bpy.context.active_object
    mb.data.resolution = resolution
    mb.data.render_resolution = resolution * 0.7
    first = True
    for co, radius in points_radii:
        if first:
            el = mb.data.elements[0]
            first = False
        else:
            el = mb.data.elements.new(type="BALL")
        el.co = co
        el.radius = radius
        el.stiffness = 2.0
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.active_object
    smooth(obj)
    print(obj.name, "faces", len(obj.data.polygons))
    return obj


def decimate(obj, target):
    faces = len(obj.data.polygons)
    if faces <= target:
        return
    mod = obj.modifiers.new("dec", "DECIMATE")
    mod.ratio = target / faces
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier="dec")
    smooth(obj)


def new_armature(name, bones):
    arm_data = bpy.data.armatures.new(name)
    arm = bpy.data.objects.new(name, arm_data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    for bname, head, tail, parent in bones:
        b = arm_data.edit_bones.new(bname)
        b.head = head
        b.tail = tail
        if parent:
            b.parent = arm_data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def autoweight(mesh, arm):
    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")


def key_clip(arm, name, frames):
    if arm.animation_data is None:
        arm.animation_data_create()
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    arm.animation_data.action = action
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (0, 0, 0)
    for frame, pose in frames:
        for bone, rot in pose.items():
            if bone not in arm.pose.bones:
                continue
            pb = arm.pose.bones[bone]
            pb.rotation_euler = tuple(math.radians(v) for v in rot)
            pb.keyframe_insert("rotation_euler", frame=frame)
    for fc in action.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = "BEZIER"
    return action


def export(path, objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_skins=True,
        export_morph=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_yup=True,
    )
    print("wrote", os.path.basename(path), os.path.getsize(path))


def sphere(name, radius, loc, segs=12):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=loc, segments=segs, ring_count=max(6, segs // 2))
    obj = bpy.context.active_object
    obj.name = name
    smooth(obj)
    return obj


def build_hero():
    wipe()
    pts = []
    def P(x, y, z, r):
        pts.append(((x, y, z), r))
    # torso, hips, neck, head — athletic, readable at game scale
    P(0, 0, 1.28, 0.22)
    P(0, -0.04, 1.16, 0.19)
    P(0, 0, 1.02, 0.15)
    P(0, 0.02, 0.88, 0.2)
    P(0, 0, 1.44, 0.09)
    P(0, -0.04, 1.64, 0.16)
    P(0.24, 0, 1.36, 0.12)
    P(-0.24, 0, 1.36, 0.12)
    P(0, 0.08, 1.72, 0.13)
    P(0, 0.12, 1.55, 0.11)
    for s in (1, -1):
        z, x = 1.32, 0.22
        for i in range(10):
            P(s * x, 0, z, 0.075 - i * 0.002)
            x += 0.032
            z -= 0.042
        z, x = 0.8, 0.1
        for i in range(12):
            P(s * x, -0.015 if z < 0.2 else 0, z, 0.095 - i * 0.003)
            z -= 0.062
    body = fuse(pts, 0.02)
    body.name = "body"
    decimate(body, 2800)
    skin = mat("skin", (0.62, 0.40, 0.26), 0.48)
    assign = body.data.materials.append(skin)

    bones = [
        ("root", (0, 0, 0.05), (0, 0, 0.3), None),
        ("hips", (0, 0, 0.9), (0, 0, 1.05), "root"),
        ("spine", (0, 0, 1.05), (0, 0, 1.22), "hips"),
        ("chest", (0, 0, 1.22), (0, 0, 1.42), "spine"),
        ("neck", (0, 0, 1.42), (0, 0, 1.52), "chest"),
        ("head", (0, 0, 1.52), (0, 0, 1.75), "neck"),
        ("thigh.L", (0.08, 0, 0.88), (0.09, 0, 0.48), "hips"),
        ("shin.L", (0.09, 0, 0.48), (0.09, -0.02, 0.08), "thigh.L"),
        ("foot.L", (0.09, -0.02, 0.08), (0.09, -0.14, 0.03), "shin.L"),
        ("thigh.R", (-0.08, 0, 0.88), (-0.09, 0, 0.48), "hips"),
        ("shin.R", (-0.09, 0, 0.48), (-0.09, -0.02, 0.08), "thigh.R"),
        ("foot.R", (-0.09, -0.02, 0.08), (-0.09, -0.14, 0.03), "shin.R"),
        ("upper_arm.L", (0.18, 0, 1.32), (0.38, 0, 1.12), "chest"),
        ("forearm.L", (0.38, 0, 1.12), (0.52, 0, 0.92), "upper_arm.L"),
        ("hand.L", (0.52, 0, 0.92), (0.58, -0.02, 0.86), "forearm.L"),
        ("upper_arm.R", (-0.18, 0, 1.32), (-0.38, 0, 1.12), "chest"),
        ("forearm.R", (-0.38, 0, 1.12), (-0.52, 0, 0.92), "upper_arm.R"),
        ("hand.R", (-0.52, 0, 0.92), (-0.58, -0.02, 0.86), "forearm.R"),
    ]
    arm = new_armature("hero_rig", bones)
    autoweight(body, arm)

    extras = [body, arm]
    red = mat("bodice", (0.7, 0.08, 0.1), 0.4)
    blue = mat("skirt", (0.1, 0.2, 0.62), 0.5)
    gold = mat("gold", (0.9, 0.68, 0.2), 0.25, 1)
    bootm = mat("boot", (0.55, 0.05, 0.07), 0.4)
    hairm = mat("hair", (0.06, 0.04, 0.03), 0.55)
    capem = mat("cape", (0.55, 0.05, 0.08), 0.65)
    lassom = mat("lasso", (1, 0.8, 0.3), 0.2, 0.15, (1, 0.72, 0.15), 4)

    def rigid(obj, bone):
        vg = obj.vertex_groups.new(name=bone)
        vg.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
        mod = obj.modifiers.new("Armature", "ARMATURE")
        mod.object = arm
        obj.parent = arm
        extras.append(obj)

    # Clothing shells.
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.16, location=(0, -0.02, 1.24), segments=16, ring_count=10)
    bodice = bpy.context.active_object
    bodice.name = "bodice"
    bodice.scale = (1.15, 0.75, 0.85)
    bpy.ops.object.transform_apply(scale=True)
    bodice.data.materials.append(red)
    rigid(bodice, "chest")

    bpy.ops.mesh.primitive_cone_add(radius1=0.28, radius2=0.14, depth=0.28, location=(0, 0, 0.78), vertices=16)
    skirt = bpy.context.active_object
    skirt.name = "skirt"
    skirt.data.materials.append(blue)
    rigid(skirt, "hips")

    for s, bone in ((1, "foot.L"), (-1, "foot.R")):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.055, depth=0.28, location=(s * 0.09, -0.04, 0.14), vertices=10)
        boot = bpy.context.active_object
        boot.name = "boot" + ("L" if s > 0 else "R")
        boot.data.materials.append(bootm)
        rigid(boot, bone)
        bpy.ops.mesh.primitive_cylinder_add(radius=0.05, depth=0.06, location=(s * 0.46, 0, 1.02), vertices=10)
        br = bpy.context.active_object
        br.name = "bracer" + ("L" if s > 0 else "R")
        br.data.materials.append(gold)
        rigid(br, "forearm." + ("L" if s > 0 else "R"))

    hair = sphere("hair", 0.15, (0, 0.03, 1.64), 16)
    hair.scale = (1.05, 1.15, 1.2)
    bpy.ops.object.transform_apply(scale=True)
    hair.data.materials.append(hairm)
    rigid(hair, "head")
    # Long hair down the back.
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.1, location=(0, 0.08, 1.25), segments=12, ring_count=8)
    locks = bpy.context.active_object
    locks.name = "locks"
    locks.scale = (0.7, 0.45, 1.8)
    bpy.ops.object.transform_apply(scale=True)
    locks.data.materials.append(hairm)
    rigid(locks, "head")

    bpy.ops.mesh.primitive_torus_add(major_radius=0.11, minor_radius=0.015, location=(0, -0.08, 1.7), major_segments=16, minor_segments=6)
    tiara = bpy.context.active_object
    tiara.name = "tiara"
    tiara.scale = (1, 0.7, 0.45)
    bpy.ops.object.transform_apply(scale=True)
    tiara.data.materials.append(gold)
    rigid(tiara, "head")
    star = sphere("star", 0.025, (0, -0.12, 1.74), 8)
    star.data.materials.append(mat("starcol", (0.75, 0.08, 0.1), 0.35))
    rigid(star, "head")

    for s, nm in ((1, "L"), (-1, "R")):
        eye = sphere("eye" + nm, 0.028, (s * 0.045, -0.155, 1.62), 10)
        eye.data.materials.append(mat("white", (0.95, 0.95, 0.93), 0.2))
        rigid(eye, "head")
        iris = sphere("iris" + nm, 0.013, (s * 0.045, -0.178, 1.62), 8)
        iris.data.materials.append(mat("iris", (0.25, 0.12, 0.05), 0.3))
        rigid(iris, "head")

    face = sphere("face", 0.02, (0, -0.13, 1.56), 8)
    face.data.materials.append(skin)
    rigid(face, "head")

    bpy.ops.mesh.primitive_torus_add(major_radius=0.09, minor_radius=0.012, location=(0.62, -0.02, 0.9), major_segments=16, minor_segments=6)
    lasso = bpy.context.active_object
    lasso.name = "lasso"
    lasso.data.materials.append(lassom)
    rigid(lasso, "hand.R")

    # Cape plane weighted to the chest so it follows, with a little swing in the clips.
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0.16, 0.95))
    cape = bpy.context.active_object
    cape.name = "cape"
    cape.scale = (0.55, 0.08, 0.85)
    bpy.ops.object.transform_apply(scale=True)
    cape.data.materials.append(capem)
    rigid(cape, "chest")

    walk = {
        1: {"thigh.L": (28, 0, 0), "shin.L": (-12, 0, 0), "thigh.R": (-28, 0, 0), "shin.R": (18, 0, 0),
            "upper_arm.L": (-22, 0, 0), "upper_arm.R": (22, 0, 0)},
        8: {"thigh.L": (-28, 0, 0), "shin.L": (18, 0, 0), "thigh.R": (28, 0, 0), "shin.R": (-12, 0, 0),
            "upper_arm.L": (22, 0, 0), "upper_arm.R": (-22, 0, 0)},
        16: {"thigh.L": (28, 0, 0), "shin.L": (-12, 0, 0), "thigh.R": (-28, 0, 0), "shin.R": (18, 0, 0),
             "upper_arm.L": (-22, 0, 0), "upper_arm.R": (22, 0, 0)},
    }
    key_clip(arm, "idle", [(1, {"chest": (3, 0, 0)}), (10, {"chest": (-3, 0, 0)}), (20, {"chest": (3, 0, 0)})])
    key_clip(arm, "walk", [(f, walk[f]) for f in (1, 8, 16)])
    run = {f: {k: (v[0] * 1.55, 0, 0) for k, v in p.items()} for f, p in walk.items()}
    key_clip(arm, "run", [(f, run[f]) for f in (1, 8, 16)])
    key_clip(arm, "scared_idle", [
        (1, {"upper_arm.L": (-60, 0, -35), "upper_arm.R": (-60, 0, 35), "head": (-10, 0, 0)}),
        (8, {"upper_arm.L": (-50, 0, -45), "upper_arm.R": (-70, 0, 45), "head": (-14, 5, 0)}),
        (16, {"upper_arm.L": (-60, 0, -35), "upper_arm.R": (-60, 0, 35), "head": (-10, 0, 0)}),
    ])
    key_clip(arm, "scared_run", [(f, {**run[f], "upper_arm.L": (-35, 0, -25), "upper_arm.R": (-35, 0, 25)}) for f in (1, 8, 16)])
    key_clip(arm, "jump", [
        (1, {"thigh.L": (50, 0, 0), "thigh.R": (50, 0, 0), "shin.L": (-60, 0, 0), "shin.R": (-60, 0, 0)}),
        (6, {"thigh.L": (-10, 0, 0), "thigh.R": (-10, 0, 0)}),
        (12, {"thigh.L": (50, 0, 0), "thigh.R": (50, 0, 0), "shin.L": (-60, 0, 0), "shin.R": (-60, 0, 0)}),
    ])
    key_clip(arm, "lasso", [
        (1, {"upper_arm.R": (10, 0, 30), "forearm.R": (0, 0, 0)}),
        (6, {"upper_arm.R": (-90, 0, 15), "forearm.R": (-30, 0, 0)}),
        (12, {"upper_arm.R": (20, 0, 40), "forearm.R": (15, 0, 0)}),
    ])
    key_clip(arm, "crouch", [
        (1, {"thigh.L": (75, 0, 0), "thigh.R": (75, 0, 0), "shin.L": (-90, 0, 0), "shin.R": (-90, 0, 0), "spine": (30, 0, 0)}),
        (10, {"thigh.L": (70, 0, 0), "thigh.R": (70, 0, 0), "shin.L": (-80, 0, 0), "shin.R": (-80, 0, 0), "spine": (26, 0, 0)}),
        (20, {"thigh.L": (75, 0, 0), "thigh.R": (75, 0, 0), "shin.L": (-90, 0, 0), "shin.R": (-90, 0, 0), "spine": (30, 0, 0)}),
    ])

    keep = [obj for obj in bpy.data.objects if obj.type in {"MESH", "ARMATURE"}]
    export(os.path.join(OUT, "hero.glb"), keep)
    shot(os.path.join(OUT, "..", "..", "..", "tmp") if False else "/tmp/hero_front.png", (0.2, -2.6, 1.15))


def build_monster():
    wipe()
    pts = []
    def P(x, y, z, r):
        pts.append(((x, y, z), r))
    # Long red body and big head.
    P(0, 0, 1.15, 0.3)
    P(0, 0, 1.45, 0.32)
    P(0, 0, 1.75, 0.3)
    P(0, 0, 2.05, 0.24)
    P(0, -0.01, 2.35, 0.28)
    P(0, -0.02, 2.7, 0.42)  # head
    for s in (1, -1):
        x, z = 0.16, 2.05
        for i in range(24):
            P(s * x, 0, z, 0.07)
            x += 0.028
            z -= 0.05
        z = 0.95
        for i in range(16):
            P(s * 0.08, 0, z, 0.06)
            z -= 0.05
    body = fuse(pts, 0.018)
    body.name = "body"
    decimate(body, 2200)
    red = mat("mred", (0.72, 0.04, 0.03), 0.4, 0, (0.4, 0.02, 0.01), 0.4)
    body.data.materials.append(red)
    bones = [
        ("root", (0, 0, 0.05), (0, 0, 0.4), None),
        ("hips", (0, 0, 0.55), (0, 0, 1.0), "root"),
        ("spine", (0, 0, 1.0), (0, 0, 1.8), "hips"),
        ("chest", (0, 0, 1.8), (0, 0, 2.3), "spine"),
        ("head", (0, 0, 2.35), (0, 0, 3.15), "chest"),
        ("upper_arm.L", (0.22, 0, 2.1), (0.55, 0, 1.4), "chest"),
        ("forearm.L", (0.55, 0, 1.4), (0.85, 0, 0.7), "upper_arm.L"),
        ("hand.L", (0.85, 0, 0.7), (0.98, -0.05, 0.55), "forearm.L"),
        ("upper_arm.R", (-0.22, 0, 2.1), (-0.55, 0, 1.4), "chest"),
        ("forearm.R", (-0.55, 0, 1.4), (-0.85, 0, 0.7), "upper_arm.R"),
        ("hand.R", (-0.85, 0, 0.7), (-0.98, -0.05, 0.55), "forearm.R"),
        ("thigh.L", (0.1, 0, 0.6), (0.1, 0, 0.25), "hips"),
        ("shin.L", (0.1, 0, 0.25), (0.1, 0, 0.02), "thigh.L"),
        ("thigh.R", (-0.1, 0, 0.6), (-0.1, 0, 0.25), "hips"),
        ("shin.R", (-0.1, 0, 0.25), (-0.1, 0, 0.02), "thigh.R"),
    ]
    arm = new_armature("monster_rig", bones)
    autoweight(body, arm)
    keep = [body, arm]
    black = mat("mblack", (0.02, 0.02, 0.02), 0.5)
    white = mat("mwhite", (0.95, 0.95, 0.92), 0.25)
    glow = mat("mglow", (1, 0.1, 0.04), 0.3, 0, (1, 0.05, 0), 2.2)

    def rigid(obj, bone):
        vg = obj.vertex_groups.new(name=bone)
        vg.add(list(range(len(obj.data.vertices))), 1, "REPLACE")
        mod = obj.modifiers.new("Armature", "ARMATURE")
        mod.object = arm
        obj.parent = arm
        keep.append(obj)

    for i, ang in enumerate((-0.6, -0.25, 0.05, 0.3, 0.55)):
        sp = sphere("spike%d" % i, 0.05, (math.sin(ang) * 0.18, 0.02, 3.05), 6)
        sp.scale = (0.45, 0.45, 1.6)
        bpy.ops.object.transform_apply(scale=True)
        sp.data.materials.append(black)
        rigid(sp, "head")
    for kind, emat in (("faceDay", white), ("faceNight", glow)):
        for s, side in ((1, "L"), (-1, "R")):
            eye = sphere(kind + "eye" + side, 0.11 if kind == "faceDay" else 0.12, (s * 0.16, -0.36, 2.75), 12)
            eye.data.materials.append(emat)
            rigid(eye, "head")
            if kind == "faceDay":
                pup = sphere(kind + "pup" + side, 0.04, (s * 0.16, -0.46, 2.75), 8)
                pup.data.materials.append(black)
                rigid(pup, "head")
        mark = sphere(kind, 0.02, (0, -0.3, 2.9), 6)
        mark.data.materials.append(red)
        rigid(mark, "head")

    sway = {
        1: {"upper_arm.L": (25, 0, 0), "upper_arm.R": (-20, 0, 0), "thigh.L": (20, 0, 0), "thigh.R": (-20, 0, 0)},
        8: {"upper_arm.L": (-25, 0, 0), "upper_arm.R": (20, 0, 0), "thigh.L": (-20, 0, 0), "thigh.R": (20, 0, 0)},
        16: {"upper_arm.L": (25, 0, 0), "upper_arm.R": (-20, 0, 0), "thigh.L": (20, 0, 0), "thigh.R": (-20, 0, 0)},
    }
    key_clip(arm, "idle", [(1, {"spine": (3, 0, 0)}), (10, {"spine": (-3, 0, 0)}), (20, {"spine": (3, 0, 0)})])
    key_clip(arm, "wave", [(1, {"upper_arm.R": (-110, 0, 20)}), (8, {"upper_arm.R": (-80, 0, 45)}), (16, {"upper_arm.R": (-110, 0, 20)})])
    key_clip(arm, "stalk", [(f, {k: (v[0] * 0.55, 0, 0) for k, v in p.items()}) for f, p in sway.items()])
    key_clip(arm, "chase", [(f, {k: (v[0] * 1.4, 0, 0) for k, v in p.items()}) for f, p in sway.items()])
    key_clip(arm, "lunge", [
        (1, {"spine": (35, 0, 0), "upper_arm.L": (-30, 0, -20), "upper_arm.R": (-30, 0, 20)}),
        (6, {"spine": (-15, 0, 0)}),
        (12, {"spine": (35, 0, 0), "upper_arm.L": (-30, 0, -20), "upper_arm.R": (-30, 0, 20)}),
    ])
    keep = [obj for obj in bpy.data.objects if obj.type in {"MESH", "ARMATURE"}]
    export(os.path.join(OUT, "monster.glb"), keep)
    shot("/tmp/monster_front.png", (0.3, -3.4, 1.6))


def key_clip(arm, name, frames):
    if arm.animation_data is None:
        arm.animation_data_create()
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    arm.animation_data.action = action
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (0, 0, 0)
    for frame, pose in frames:
        for bone, rot in pose.items():
            if bone not in arm.pose.bones:
                continue
            pb = arm.pose.bones[bone]
            pb.rotation_euler = tuple(math.radians(a) for a in rot)
            pb.keyframe_insert("rotation_euler", frame=frame)
    for fc in action.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = "BEZIER"


def shot(path, loc):
    bpy.ops.object.light_add(type="SUN", location=(2, -3, 5))
    bpy.context.active_object.data.energy = 4
    bpy.ops.object.camera_add(location=loc)
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(78), 0, math.radians(4))
    bpy.context.scene.camera = cam
    bpy.context.scene.render.engine = "BLENDER_EEVEE"
    bpy.context.scene.render.resolution_x = 480
    bpy.context.scene.render.resolution_y = 640
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def build_trees():
    bpy.ops.preferences.addon_enable(module="add_curve_sapling")
    specs = [
        ("tree_pine", dict(leafShape="hex", levels=3, scale=7.0, seed=2, baseSize=0.35, bevel=True, showLeaves=True, prune=True, leafScale=2.4, leafScaleX=1.1)),
        ("tree_oak", dict(leafShape="hex", levels=3, scale=6.2, seed=4, baseSize=0.22, bevel=True, showLeaves=True, prune=False, leafScale=2.8, leafScaleX=1.3)),
        ("tree_broad", dict(leafShape="rect", levels=3, scale=5.6, seed=8, baseSize=0.2, bevel=True, showLeaves=True, prune=True, leafScale=3.0, leafScaleX=1.4)),
    ]
    for name, params in specs:
        wipe()
        bark = mat("bark", (0.32, 0.2, 0.1), 0.85)
        leaf = mat("leaf", (0.12, 0.38, 0.1), 0.65)
        bpy.ops.curve.tree_add(**params)
        meshes = []
        for obj in list(bpy.data.objects):
            if obj.type == "CURVE":
                bpy.context.view_layer.objects.active = obj
                bpy.ops.object.select_all(action="DESELECT")
                obj.select_set(True)
                bpy.ops.object.convert(target="MESH")
            if "envelope" in obj.name.lower():
                bpy.data.objects.remove(obj, do_unlink=True)
        for obj in list(bpy.data.objects):
            if obj.type != "MESH":
                continue
            smooth(obj)
            obj.data = obj.data.copy()
            faces = len(obj.data.polygons)
            use_leaf = obj.name.lower().startswith("leav")
            limit = 1400 if use_leaf else 1800
            if faces > limit:
                decimate(obj, limit)
            obj.data.materials.clear()
            obj.data.materials.append(leaf if use_leaf else bark)
            for poly in obj.data.polygons:
                poly.material_index = 0
            print(name, obj.name, len(obj.data.polygons), obj.data.materials[0].name)
            meshes.append(obj)
        if not meshes:
            continue
        bpy.context.view_layer.update()
        minz = min((obj.matrix_world @ v.co).z for obj in meshes for v in obj.data.vertices)
        for obj in meshes:
            obj.location.z -= minz
        bpy.ops.object.select_all(action="DESELECT")
        for obj in meshes:
            obj.select_set(True)
        bpy.ops.object.transform_apply(location=True)
        export(os.path.join(OUT, name + ".glb"), meshes)

    wipe()
    rock = sphere("rock", 0.55, (0, 0, 0.25), 8)
    rock.scale = (1.4, 1.1, 0.75)
    bpy.ops.object.transform_apply(scale=True)
    rock.data.materials.append(mat("rock", (0.4, 0.38, 0.35), 0.9))
    # Sit on the ground.
    minz = min(v.co.z for v in rock.data.vertices)
    rock.location.z -= minz
    bpy.ops.object.transform_apply(location=True)
    export(os.path.join(OUT, "rock.glb"), [rock])


if __name__ == "__main__":
    build_hero()
    build_monster()
    build_trees()
    print("done")
