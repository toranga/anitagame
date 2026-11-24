/**
 * Low-poly oil lantern. Poly Haven's Lantern_01 is CC0 but the mesh buffer
 * alone is about 865 KB before textures, which will not fit the size budget.
 * This cage is original, then meshopt-compressed.
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../models/lantern.glb");

const iron = new THREE.MeshStandardMaterial({
  name: "iron",
  color: 0x2c261f,
  metalness: 0.82,
  roughness: 0.38,
});
const glass = new THREE.MeshStandardMaterial({
  name: "glass",
  color: 0xfff0cc,
  emissive: 0xffb050,
  emissiveIntensity: 0.22,
  metalness: 0.04,
  roughness: 0.08,
  transparent: true,
  opacity: 0.38,
  side: THREE.DoubleSide,
});

const root = new THREE.Group();
root.name = "lantern";

function add(geo, mat, x, y, z, rx, ry, rz) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx || 0, ry || 0, rz || 0);
  root.add(mesh);
  return mesh;
}

add(new THREE.CylinderGeometry(0.075, 0.09, 0.05, 8), iron, 0, 0.03, 0);
add(new THREE.TorusGeometry(0.078, 0.008, 6, 10), iron, 0, 0.07, 0, Math.PI / 2);
add(new THREE.CylinderGeometry(0.062, 0.07, 0.2, 8, 1, true), glass, 0, 0.18, 0);
for (let i = 0; i < 8; i++) {
  const a = (i / 8) * Math.PI * 2;
  add(new THREE.BoxGeometry(0.012, 0.2, 0.012), iron, Math.cos(a) * 0.07, 0.18, Math.sin(a) * 0.07);
}
add(new THREE.TorusGeometry(0.074, 0.008, 6, 10), iron, 0, 0.29, 0, Math.PI / 2);
add(new THREE.CylinderGeometry(0.05, 0.078, 0.045, 8), iron, 0, 0.325, 0);
add(new THREE.CylinderGeometry(0.028, 0.04, 0.05, 8), iron, 0, 0.365, 0);
add(new THREE.TorusGeometry(0.055, 0.008, 6, 14, Math.PI), iron, 0, 0.39, 0);

const exporter = new GLTFExporter();
const glb = await exporter.parseAsync(root, { binary: true });
const raw = out.replace(/\.glb$/, ".raw.glb");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(raw, Buffer.from(glb));
execSync(`npx --yes @gltf-transform/cli@4.1.0 meshopt "${raw}" "${out}"`, { stdio: "inherit" });
console.log("lantern bytes", statSync(out).size);
