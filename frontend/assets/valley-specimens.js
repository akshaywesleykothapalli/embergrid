import * as T from "./vendor/three.module.min.js";

// A spray of lobed oak leaves on a stem, drawn once and shared by every oak leaf card.
let oakSpray;
function oakSprayTexture() {
  if (oakSpray) return oakSpray;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const g = canvas.getContext("2d");
  g.lineCap = "round";
  g.strokeStyle = "#8f9273";
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(128, 256);
  g.quadraticCurveTo(124, 200, 130, 150);
  g.stroke();
  const sprays = [[-1.05, 92, 150], [1.0, 96, 160], [-.48, 112, 128], [.52, 108, 138], [.04, 124, 132]];
  for (const [turn, length, joint] of sprays) {
    g.save();
    g.translate(128 + turn * 6, joint + 40);
    g.rotate(turn);
    const shade = g.createLinearGradient(0, 0, 0, -length);
    shade.addColorStop(0, "#c9d1ad");
    shade.addColorStop(1, turn > 0 ? "#fffbe4" : "#f1f6dc");
    g.fillStyle = shade;
    g.beginPath();
    g.moveTo(0, 0);
    for (const side of [1, -1]) {
      for (let i = 1; i <= 40; i++) {
        const t = side === 1 ? i / 40 : 1 - i / 40;
        const lobes = .6 + .4 * Math.abs(Math.sin(t * Math.PI * 4.5 + turn));
        g.lineTo(side * length * .29 * Math.sin(Math.PI * t) ** .7 * lobes, -length * t);
      }
    }
    g.fill();
    g.strokeStyle = "rgba(116,124,88,.55)";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, -length * .92);
    g.stroke();
    g.restore();
  }
  oakSpray = new T.CanvasTexture(canvas);
  oakSpray.colorSpace = T.SRGBColorSpace;
  oakSpray.anisotropy = 4;
  return oakSpray;
}

// Bend each leaf normal toward the outside of the crown, and darken leaves deep inside it,
// so the canopy lights as one rounded mass instead of thousands of separate cards.
function shadeCrown(geometry) {
  geometry.computeBoundingBox();
  const half = geometry.boundingBox.getSize(new T.Vector3()).multiplyScalar(.5);
  const center = geometry.boundingBox.getCenter(new T.Vector3());
  center.y -= half.y * .15;
  const {position, normal, color} = geometry.attributes;
  const out = new T.Vector3();
  const face = new T.Vector3();
  for (let i = 0; i < position.count; i++) {
    out.fromBufferAttribute(position, i).sub(center).divide(half);
    const depth = T.MathUtils.smoothstep(out.length(), .2, 1);
    const under = T.MathUtils.smoothstep(out.y, -.7, .5);
    out.divide(half).normalize();
    face.fromBufferAttribute(normal, i);
    if (face.dot(out) < 0) face.negate();
    face.lerp(out, .75).normalize();
    normal.setXYZ(i, face.x, face.y, face.z);
    const light = .5 + .5 * depth * (.6 + .4 * under);
    color.setXYZ(i, color.getX(i) * light * (.93 + .14 * depth),
      color.getY(i) * light * (.97 + .06 * depth), color.getZ(i) * light * (1.08 - .16 * depth));
  }
}

// Reference specimens use branching wood and individual foliage geometry.
export function createSpecimen(kind, time) {
  const oak = kind === "oak";
  let seed = oak ? 4087 : 6213;
  const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const wood = {position: [], color: [], uv: [], index: [], sections: []};
  const foliage = {position: [], color: [], index: [], uv: oak ? [] : undefined};
  const up = new T.Vector3(0, 1, 0);
  const axis = new T.Vector3(0, 0, 1);
  const color = new T.Color();
  const vector = (x, y, z) => new T.Vector3(x, y, z);
  const offset = (point, angle, length, rise) =>
    point.clone().add(vector(Math.cos(angle) * length, rise, Math.sin(angle) * length));

  function tube(points, radii, sides) {
    const start = wood.index.length;
    const first = wood.position.length / 3;
    const shade = .84 + rand() * .25;
    for (let ring = 0; ring < points.length; ring++) {
      const tangent = points[Math.min(ring + 1, points.length - 1)].clone()
        .sub(points[Math.max(ring - 1, 0)]).normalize();
      const normal = tangent.clone().cross(Math.abs(tangent.y) > .9 ? axis : up).normalize();
      const binormal = tangent.clone().cross(normal);
      for (let j = 0; j <= sides; j++) {
        const angle = (j % sides) / sides * Math.PI * 2;
        const radius = radii[ring] * (1 + .11 * Math.sin(angle * 3 + ring * .4));
        const vertex = points[ring].clone().addScaledVector(normal, Math.cos(angle)*radius)
          .addScaledVector(binormal, Math.sin(angle)*radius);
        wood.position.push(vertex.x, vertex.y, vertex.z);
        color.set(oak ? "#736450" : "#685440").multiplyScalar(shade * (.86 + .23 * Math.sin(angle * 5 + .7) ** 2));
        wood.color.push(color.r, color.g, color.b);
        wood.uv.push(j / sides, points[ring].y * 5 + ring * .06);
        if (ring && j) {
          const i = first + ring * (sides + 1) + j;
          wood.index.push(i - sides - 2, i - sides - 1, i - 1, i - sides - 1, i, i - 1);
        }
      }
    }
    wood.sections.push([start, wood.index.length - start]);
  }

  function leaf(base, angle, length, width, rise, palette) {
    const first = foliage.position.length / 3;
    if (oak) {
      // One card per leaf position, rooted at the twig and rolled a little off the horizontal.
      const tip = offset(base, angle, length * 1.8, rise);
      const side = vector(-Math.sin(angle), Math.sin(first * 2.39) * .7, Math.cos(angle))
        .normalize().multiplyScalar(width * 2.4);
      color.set(palette).multiplyScalar(.68 + rand() * .63);
      for (const p of [base.clone().sub(side), base.clone().add(side), tip.clone().add(side), tip.clone().sub(side)]) {
        foliage.position.push(p.x, p.y, p.z);
        foliage.color.push(color.r, color.g, color.b);
      }
      foliage.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      foliage.index.push(first, first+1, first+2, first, first+2, first+3);
      return;
    }
    const tip = offset(base, angle, length, rise);
    const mid = base.clone().lerp(tip, .46);
    const left = offset(mid, angle + Math.PI / 2, width, 0);
    const right = offset(mid, angle - Math.PI / 2, width, rise * .16);
    const ridge = mid.clone().add(vector(0, width * .35, 0));
    color.set(palette).multiplyScalar(.68 + rand() * .63);
    for (const p of [base, left, tip, right, ridge]) {
      foliage.position.push(p.x, p.y, p.z);
      foliage.color.push(color.r, color.g, color.b);
    }
    foliage.index.push(first, first+1, first+4, first+1, first+2, first+4,
      first+2, first+3, first+4, first+3, first, first+4);
  }

  function sprig(base, angle, length, rise) {
    const tip = offset(base, angle, length, rise);
    tube([base, tip], [oak ? .0021 : .0014, .00025], 3);
    for (let i = 0; i < (oak ? 28 : 37); i++) {
      const root = base.clone().lerp(tip, rand());
      const heading = angle + (rand() < .5 ? -1 : 1) * (.22 + rand() * 1.38);
      leaf(root, heading, .019 + rand() * (oak ? .019 : .021),
        (oak ? .009 : .0013) + rand() * (oak ? .006 : .0021), (rand() - .46) * .025,
        oak ? "#758253" : "#607553");
    }
  }

  const trunk = y => vector(Math.sin(y * 4) * y * (oak ? .105 : .026), y, -.048 * y * y);
  const height = oak ? .78 : 1.04;
  tube(Array.from({length: 9}, (_, i) => trunk(i * height / 8)),
    Array.from({length: 9}, (_, i) => (oak ? .045 : .026) * (1 - i / 8) ** 1.2 + .0014), 11);
  for (let i = 0; i < 5; i++) {
    const angle = i * Math.PI * .4 + rand() * .3;
    const root = offset(trunk(.015), angle, oak ? .107 : .063, -.031);
    tube([trunk(oak ? .18 : .12), offset(trunk(.048), angle, .035, 0), root],
      [oak ? .020 : .011, .012, .001], 5);
  }

  const arms = oak ? 10 : 32;
  for (let i = 0; i < arms; i++) {
    const level = oak ? .28 + .042*i + rand()*.034 : .17 + .025*i + rand()*.025;
    const reach = oak ? (.36 + rand()*.14) * (1 - (level-.3)*.7) : (.40 + rand()*.10) * (1-level)**1.18;
    const angle = i * 2.39996 + rand() * .28;
    const base = trunk(level);
    const elbow = offset(base, angle, reach * .42, oak ? .11 : -.024);
    const tip = offset(elbow, angle + (rand()-.5)*.53, reach * .57, oak ? .14 : -.03 + rand()*.036);
    tube([base, elbow, tip], [oak ? .025*(1-level) : .013*(1-level), oak ? .011 : .005, .001], 7);

    for (let j = 0; j < (oak ? 10 : 6); j++) {
      const joint = elbow.clone().lerp(tip, .12 + j / (oak ? 11 : 7));
      const bearing = angle + (j % 2 === 0 ? -1 : 1) * (.37 + rand()*.95);
      const length = reach * (.22 + rand()*.19);
      const twig = offset(joint, bearing, length, oak ? .075 + rand()*.065 : -.032 + rand()*.036);
      tube([joint, twig], [oak ? .006 : .0022, .0006], 4);
      for (let k = 0; k < (oak ? 8 : 5); k++) {
        const root = joint.clone().lerp(twig, .29 + k / (oak ? 11 : 7));
        const turn = bearing + (k % 2 === 0 ? -1 : 1) * (.48 + rand() * 1.1);
        sprig(root, turn, length * (.33 + rand()*.60), oak ? .014 + rand()*.031 : -.019 + rand()*.024);
      }
    }
  }

  if (!oak) {
    for (let i = 0; i < 13; i++) {
      const level = .86 + i * .011;
      sprig(trunk(level), i * 2.4, (1.065 - level) * .55, .02);
    }
  }

  function mesh(data, material) {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute("position", new T.Float32BufferAttribute(data.position, 3));
    geometry.setAttribute("color", new T.Float32BufferAttribute(data.color, 3));
    if (data.uv) geometry.setAttribute("uv", new T.Float32BufferAttribute(data.uv, 2));
    geometry.setIndex(data.index);
    if (data.sections) geometry.userData.woodSections = data.sections;
    geometry.computeVertexNormals();
    return new T.Mesh(geometry, material);
  }
  const bark = new T.MeshLambertMaterial({vertexColors: true});
  bark.onBeforeCompile = shader => {
    shader.vertexShader = "varying vec2 barkUV;\n" + shader.vertexShader.replace("#include <begin_vertex>",
      "#include <begin_vertex>\n barkUV = uv;");
    shader.fragmentShader = "varying vec2 barkUV;\n" + shader.fragmentShader.replace("#include <color_fragment>",
      `#include <color_fragment>
      float furrow = sin(barkUV.x*168. + sin(barkUV.y*9.)*.9 + sin(barkUV.y*22.)*.3);
      float plate = sin(barkUV.x*79. + barkUV.y*4.) * sin(barkUV.y*26.);
      diffuseColor.rgb *= .79 + .18*smoothstep(-.7,.2,furrow) + .14*plate;`);
  };
  const leaves = new T.MeshLambertMaterial({vertexColors: true, side: T.DoubleSide,
    ...(oak && {map: oakSprayTexture(), alphaTest: .5, alphaToCoverage: true})});
  leaves.customProgramCacheKey = () => kind;
  leaves.onBeforeCompile = shader => {
    shader.uniforms.windTime = time;
    shader.vertexShader = "uniform float windTime;\n" + shader.vertexShader.replace("#include <begin_vertex>",
      `#include <begin_vertex>
      float phase = 0.;
      #ifdef USE_INSTANCING
        phase = instanceMatrix[3].z*.11 + instanceMatrix[3].x*.08;
      #endif
      float sway = sin(windTime * 1.7 + position.y*5. + position.x*8. + phase) + .29*sin(windTime*4.4 + position.z*17. + phase);
      transformed.x += sway * position.y * position.y * .011;
      transformed.z += sway * position.y * .003;`);
    // Crown normals already face outward on both sides of a card, so undo the back-face flip.
    if (oak) shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_begin>",
      "#include <normal_fragment_begin>\n normal *= faceDirection;");
  };
  const crown = mesh(foliage, leaves);
  if (oak) {
    shadeCrown(crown.geometry);
    crown.geometry.userData.leafShape = [4, 6];
  }
  const tree = new T.Group();
  tree.add(mesh(wood, bark), crown);
  tree.userData.kind = kind;
  return tree;
}


// Use the same branch and leaf shapes at every distance, with extra leaf coverage in the lower-detail crowns.
export function reduceSpecimen(model, detail) {
  const tree = new T.Group();
  const near = detail === "near";
  // Oak crowns hang off ten broad arms, so they keep more leaves close to their real size and angle.
  // Far steps are multiples of the near step, so every far leaf also exists in the near crown.
  const oak = model.userData.kind === "oak";
  const leafStep = oak ? (near ? 2 : 8) : (near ? 15 : 36);
  const spread = oak ? (near ? 1.1 : 1.35) : (near ? 1.95 : 3.15);
  const lean = oak ? (near ? .12 : .28) : (near ? .40 : .64);
  for (const [part, mesh] of model.children.entries()) {
    const source = mesh.geometry;
    const indices = source.index.array;
    // Fir leaves are five-point diamonds; oak leaves are four-point textured cards.
    const [corners, span] = source.userData.leafShape ?? [5, 12];
    const card = corners === 4;
    const kept = [];
    if (part === 0) {
      // Retain the trunk and primary branches. Skip the thin twig tubes, and fir branches at a distance.
      let branch = 0;
      for (const [start, count] of source.userData.woodSections) {
        if (count < 60 || (start !== 0 && !near && !oak && branch++ % 3 !== 0)) continue;
        for (let i = start; i < start + count; i++) kept.push(indices[i]);
      }
    } else {
      for (let start = 0; start < indices.length; start += span) {
        const leaf = start / span;
        const hash = Math.imul(leaf ^ (leaf >>> 7), 0x9e3779b1) >>> 0;
        if (hash % leafStep !== 0) continue;
        if (near || card) {
          for (let i = start; i < start + span; i++) kept.push(indices[i]);
        } else {
          const base = leaf * 5;
          kept.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    }
    const geometry = new T.BufferGeometry();
    const remap = new Map();
    const index = kept.map(original => {
      if (!remap.has(original)) remap.set(original, remap.size);
      return remap.get(original);
    });
    for (const [name, attribute] of Object.entries(source.attributes)) {
      const values = new Float32Array(remap.size * attribute.itemSize);
      for (const [old, next] of remap) {
        const first = old * attribute.itemSize;
        const target = next * attribute.itemSize;
        values.set(attribute.array.subarray(first, first + attribute.itemSize), target);
        if (part === 1 && name === "position") {
          const base = Math.floor(old / corners) * corners;
          const tilt = ((card ? base / 4 : base) % 4 < 2 ? 1 : -1) * lean;
          // Grow each leaf from its stem: a diamond's first point, or the middle of a card's lower edge.
          const pivot = new T.Vector3().fromBufferAttribute(attribute, base);
          if (card) pivot.lerp(new T.Vector3().fromBufferAttribute(attribute, base + 1), .5);
          const dx = attribute.getX(old) - pivot.x;
          const dy = attribute.getY(old) - pivot.y;
          const dz = attribute.getZ(old) - pivot.z;
          values[target] = pivot.x + dx * spread;
          values[target + 1] = pivot.y + (dy * Math.cos(tilt) - dz * Math.sin(tilt)) * spread;
          values[target + 2] = pivot.z + (dy * Math.sin(tilt) + dz * Math.cos(tilt)) * spread;
        }
      }
      geometry.setAttribute(name, new T.BufferAttribute(values, attribute.itemSize));
    }
    geometry.setIndex(index);
    if (part === 1 && card) geometry.userData.leafShape = source.userData.leafShape;
    else if (part === 1) geometry.computeVertexNormals();
    tree.add(new T.Mesh(geometry, mesh.material));
  }
  return tree;
}
