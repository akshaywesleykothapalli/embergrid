import * as T from "./vendor/three.module.min.js";
import {createSpecimen, reduceSpecimen} from "./valley-specimens.js?v=15";
import {createFinish} from "./valley-finish.js?v=4";

const journey = document.querySelector(".valley-journey");
const hero = journey.querySelector(".fire-valley");
const canvas = document.getElementById("valleyCanvas");
const motion = document.getElementById("valleyMotion");
const preference = matchMedia("(prefers-reduced-motion: reduce)");
let seed = 6129;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const center = z => 13 * Math.sin(-z * .018) + 5 * Math.sin(z * .038);
const ground = (x, z) => {
  const ridge = T.MathUtils.smoothstep(Math.abs(x - center(z)), 27, 112);
  return .9 * Math.sin(x * .15 + z * .12) + 1.2 * Math.sin(z * .07) +
    .36 * Math.sin(x * .61 + z * .38) * Math.cos(z * .43) +
    ridge * (29 + 17 * Math.sin(z * .035 + x * .037) + 9 * Math.cos(z * .096 - x * .075));
};
const patches = [[-22,34,14,16],[26,-16,13,24],[-26,-58,13,27],[23,-106,17,25],
  [-31,-152,19,38],[32,-206,19,46],[-24,-260,21,40]];
const burned = (x, z) => patches.some(([cx, cz, rx, rz]) =>
  ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2 < 1);
const path = new T.CatmullRomCurve3([[0,24,68],[-10,15,19],[4,13,-37],[19,10,-87],
  [9,11,-138],[-12,15,-194],[4,22,-255],[15,26,-302]].map(values => new T.Vector3(...values)));
const trail = z => 9 * Math.sin((68 - z) * .026) - 4 * Math.sin((68 - z) * .051);
const trailEdge = (x, z) => Math.abs(x - trail(z)) - (1.85 + .37 * Math.sin(z * .18));

const noise = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
  vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);
}
float fbm(vec2 p){return .53*noise(p)+.24*noise(p*2.04)+.14*noise(p*4.17)+.09*noise(p*8.21);}
`;
// Custom shaders pick colours as they should appear on screen. Convert them to linear light so they
// sit correctly in the tone-mapped buffer, then let three.js encode them for whatever target is bound.
const linear = `
vec3 toLinear(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(.04045,c));}
`;
function terrain(scene) {
  const geometry = new T.PlaneGeometry(430, 660, 235, 270).rotateX(-Math.PI / 2).translate(0, 0, -185);
  const points = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const colors = new Float32Array(points.count * 3);
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i), z = points.getZ(i);
    points.setY(i, ground(x, z));
    uv.setXY(i, x / 9.7, z / 9.7);
    const shade = .54 + .19 * Math.sin(z * .11 + x * .13) + .19 * random();
    const wear = 1 - T.MathUtils.smoothstep(trailEdge(x,z), -.65, 1.55);
    const forestTint = burned(x, z) ? [.26,.19,.15] : [.58,.68,.43];
    const tint = forestTint.map((value, channel) => T.MathUtils.lerp(value, [1.51,1.13,.76][channel], wear));
    colors.set(tint.map(value => value * shade), i * 3);
  }
  geometry.setAttribute("color", new T.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const map = new T.TextureLoader().load("/assets/valley-forest-floor.jpg");
  map.colorSpace = T.SRGBColorSpace;
  map.wrapS = map.wrapT = T.MirroredRepeatWrapping;
  map.anisotropy = 4;
  scene.add(new T.Mesh(geometry, new T.MeshLambertMaterial({map, vertexColors: true})));
}

function forest(scene, time) {
  const groups = new Map();
  const dummy = new T.Object3D();
  const pathSamples = path.getSpacedPoints(64);
  const count = 2320;
  const dead = new T.InstancedMesh(new T.CylinderGeometry(.008, .031, 1, 6),
    new T.MeshLambertMaterial({color:"#302722"}), count);
  const specimens = [
    {kind:"fir", x:-13, z:42, size:16.5, turn:.19},
    {kind:"oak", x:1.5, z:13, size:12.6, turn:-.37}
  ];
  for (let i = 9; i < 61; i += 8) {
    const point = pathSamples[i];
    for (const side of [-1, 1]) {
      const x = point.x + side * (10.8 + (i % 3) * 1.25);
      const z = point.z + (side === 1 ? -5 : 2);
      if (trailEdge(x, z) < 4) continue;
      specimens.push({kind: (i % 3 === 0) === (side === 1) ? "fir" : "oak",
        x, z, size: 10 + (i % 5) * 1.4, turn: i * 2.4 + side});
    }
  }
  let snags = 0;
  for (let i = 0; i < count; i++) {
    const z = 94 - random() * 555;
    const side = random() < .5 ? -1 : 1;
    const x = center(z) + side * (10 + random() ** 1.52 * 158);
    if (trailEdge(x, z) < 5 || specimens.some(tree => Math.hypot(tree.x-x, tree.z-z) < 4.8)) continue;
    const y = ground(x, z);
    const height = 3 + random() ** .77 * 12;
    const horizontalDistance = Math.min(...pathSamples.map(point => Math.hypot(point.x - x, point.z - z)));
    if (horizontalDistance < 6) continue;
    dummy.position.set(x, y, z);
    dummy.rotation.set((random() - .5) * .12, random() * Math.PI * 2, (random() - .5) * .11);
    if (burned(x, z) && random() < .79) {
      dummy.position.y += height * .39;
      dummy.scale.set(height, height * .8, height);
      dummy.updateMatrix();
      dead.setMatrixAt(snags++, dummy.matrix);
      continue;
    }
    const mix = .5 + .5 * Math.sin(z * .034 + side * 1.7);
    const pick = random();
    const kind = pick < .42 + mix * .31 ? "fir" : "oak";
    const detail = horizontalDistance < 15 && z > -280 && z < 72 ? "near" : "far";
    const section = Math.floor(z / 95);
    const key = [kind, detail, section].join("/");
    if (!groups.has(key)) groups.set(key, {kind, detail, matrices:[]});
    const width = height * (.82 + random() * .32);
    const canopyWidth = detail === "far" ? width * 1.23 : width;
    dummy.scale.set(canopyWidth, height * (kind === "fir" ? 1.22 : .79), canopyWidth);
    dummy.updateMatrix();
    groups.get(key).matrices.push(dummy.matrix.clone());
  }
  const models = new Map();
  function model(kind, detail = "full") {
    const key = kind + "/" + detail;
    if (!models.has(key)) {
      models.set(key, detail === "full" ? createSpecimen(kind, time) : reduceSpecimen(model(kind), detail));
    }
    return models.get(key);
  }
  for (const {kind, x, z, size, turn} of specimens) {
    const tree = new T.LOD();
    tree.addLevel(model(kind).clone(), 0);
    tree.addLevel(model(kind, "near").clone(), 70, .10);
    tree.position.set(x, ground(x,z), z);
    tree.scale.setScalar(size);
    tree.rotation.y = turn;
    scene.add(tree);
  }
  dead.count = snags;
  scene.add(dead);
  for (const {kind, detail, matrices} of groups.values()) {
    for (const {geometry, material} of model(kind, detail).children) {
      const batch = new T.InstancedMesh(geometry, material, matrices.length);
      matrices.forEach((matrix, index) => batch.setMatrixAt(index, matrix));
      scene.add(batch);
    }
  }
}

function daylight(scene) {
  const direction = new T.Vector3(-.62, .68, -.39).normalize();
  const sky = new T.Mesh(new T.SphereGeometry(530, 24, 12), new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false,
    uniforms: {sun: {value: direction}},
    vertexShader: `
      varying vec3 ray;
      void main() {
        ray = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }`,
    fragmentShader: `
      uniform vec3 sun;
      varying vec3 ray;
      ${noise}
      ${linear}
      void main() {
        vec3 view = normalize(ray);
        float elevation = smoothstep(0., .73, view.y);
        vec3 sky = mix(vec3(.75,.83,.88), vec3(.24,.52,.78), elevation);
        float towardSun = max(0., dot(view, sun));
        sky += vec3(.25,.16,.075)*pow(towardSun,13.);
        vec2 cloudUV = view.xz/max(.14, view.y+.17)*2.2+vec2(8.7,2.4);
        float cloud = fbm(cloudUV) + .13*noise(cloudUV*12.);
        float cover = smoothstep(.54,.69,cloud)*smoothstep(.03,.27,view.y);
        vec3 silver = mix(vec3(.72,.77,.81),vec3(1.,.98,.93),smoothstep(.51,.73,cloud));
        sky = mix(sky,silver,cover*.88);
        sky = mix(sky,vec3(1.,.97,.84),smoothstep(.9987,.9996,towardSun));
        gl_FragColor = vec4(toLinear(sky),1.);
        #include <colorspace_fragment>
      }`
  }));
  sky.renderOrder = -1;
  scene.add(sky, new T.HemisphereLight("#d4e7fc", "#8c7656", 1.23));
  const light = new T.DirectionalLight("#fff0c8", 2.02);
  light.position.copy(direction).multiplyScalar(180);
  scene.add(light);
  return sky;
}

function groundCover(scene) {
  const grassCount = 2400;
  const blades = new T.BufferGeometry();
  blades.setAttribute("position", new T.Float32BufferAttribute([
    -.12,0,0, .03,0,0, -.22,.65,.05,
    -.04,0,0, .09,0,0, .12,.89,-.04,
    .03,0,0, .17,0,0, .36,.49,.07,
    0,0,-.14, 0,0,.02, .04,.71,-.24
  ], 3));
  blades.computeVertexNormals();
  const grass = new T.InstancedMesh(blades, new T.MeshBasicMaterial({side:T.DoubleSide}), grassCount);
  const rockCount = 340;
  const rockShape = new T.SphereGeometry(1, 7, 5);
  const vertices = rockShape.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
    const rough = 1 + .17 * Math.sin(x * 11 + y * 9 + z * 13);
    vertices.setXYZ(i, x * rough, y * rough, z * rough);
  }
  rockShape.computeVertexNormals();
  const stones = new T.InstancedMesh(rockShape, new T.MeshLambertMaterial(), rockCount);
  const item = new T.Object3D();
  const tint = new T.Color();
  let tufts = 0;
  for (let i = 0; i < grassCount; i++) {
    const z = 85 - random() * 425;
    const x = center(z) + (random() < .5 ? -1 : 1) * (13 + random() ** 1.55 * 76);
    if (burned(x, z) || trailEdge(x,z) < .65) continue;
    const height = .24 + random() * .62;
    item.position.set(x, ground(x,z) - .035, z);
    item.rotation.set(0, random() * 6.28, 0);
    item.scale.setScalar(height);
    item.updateMatrix();
    grass.setMatrixAt(tufts, item.matrix);
    grass.setColorAt(tufts++, tint.setHSL(.075 + random() * .14, .22 + random() * .19, .23 + random() * .15));
  }
  grass.count = tufts;
  for (let i = 0; i < rockCount; i++) {
    const z = 82 - random() * 425;
    const x = trail(z) + (random() - .5) * 10;
    const size = .06 + random() ** 2 * .35;
    item.position.set(x, ground(x,z) + .015, z);
    item.rotation.set(random() * .38, random() * 6.28, random() * .26);
    item.scale.set(size * 1.33, size * .53, size * (.68 + random() * .6));
    item.updateMatrix();
    stones.setMatrixAt(i,item.matrix);
    stones.setColorAt(i,tint.setHSL(.065 + random() * .08,.09 + random() * .12,.24 + random() * .19));
  }
  scene.add(grass,stones);
}

function billboards(base, attributes, count) {
  const geometry = new T.InstancedBufferGeometry();
  geometry.index = base.index;
  geometry.setAttribute("position", base.attributes.position);
  geometry.setAttribute("uv", base.attributes.uv);
  for (const [name, data, width] of attributes) geometry.setAttribute(name, new T.InstancedBufferAttribute(new Float32Array(data), width));
  geometry.instanceCount = count;
  return geometry;
}

function combustion(scene, time, hover, pointer) {
  // The fire keeps its own seed, so the ground cover placed after it stays where it was.
  let seed = 3517;
  const roll = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const flames = {anchors: [], settings: []}, plumes = {anchors: [], settings: []};
  const beds = {position: [], uv: [], index: []}, sparks = {position: [], settings: []};
  const flame = (x, z, width, height) => {
    flames.anchors.push(x, ground(x, z) - .12, z);
    flames.settings.push(width, height, roll() * 81);
  };
  function bed(x, z, angle, length, breadth) {
    // A small grid draped over the terrain, so the glow follows the ground instead of cutting through it.
    const first = beds.position.length / 3;
    for (let i = 0; i <= 4; i++) {
      for (let j = 0; j <= 4; j++) {
        const u = i / 2 - 1, v = j / 2 - 1;
        const px = x + Math.cos(angle) * u * length - Math.sin(angle) * v * breadth;
        const pz = z + Math.sin(angle) * u * length + Math.cos(angle) * v * breadth;
        beds.position.push(px, ground(px, pz) + .12, pz);
        beds.uv.push(u, v);
        if (i && j) {
          const k = first + i * 5 + j;
          beds.index.push(k - 6, k - 1, k - 5, k - 1, k, k - 5);
        }
      }
    }
  }
  for (const [cx, cz, rx, rz] of patches) {
    // Most flames burn in clusters along the edge of the patch, where the fire is still spreading.
    for (let c = 0; c < 14; c++) {
      const angle = (c + roll() * .6) / 14 * Math.PI * 2;
      const edge = .86 + roll() * .16;
      const x = cx + rx * edge * Math.cos(angle), z = cz + rz * edge * Math.sin(angle);
      if (trailEdge(x, z) < 1.5) continue;
      const along = Math.atan2(rz * Math.cos(angle), -rx * Math.sin(angle));
      bed(x, z, along, 4.2, 2.1);
      for (let i = 0; i < 5; i++) {
        const s = (roll() - .5) * 6.4, t = (roll() - .5) * 2.2;
        const height = 1.2 + roll() ** 2 * 3.8;
        flame(x + Math.cos(along) * s - Math.sin(along) * t, z + Math.sin(along) * s + Math.cos(along) * t,
          1.3 + height * .42 + roll() * .6, height);
      }
      for (let i = 0; i < 9; i++) {
        const sx = x + (roll() - .5) * 5, sz = z + (roll() - .5) * 5;
        sparks.position.push(sx, ground(sx, sz) + .5, sz);
        sparks.settings.push(.16 + roll() * .22, 5 + roll() * 9, roll());
      }
    }
    // Low flames smoulder across the burnt ground behind the front.
    for (let i = 0; i < 12; i++) {
      const angle = roll() * Math.PI * 2, radius = Math.sqrt(roll()) * .75;
      const x = cx + rx * radius * Math.cos(angle), z = cz + rz * radius * Math.sin(angle);
      if (trailEdge(x, z) < 1.5) continue;
      bed(x, z, angle, 1.6, 1.1);
      flame(x, z, .9 + roll() * .8, .5 + roll() * .9);
    }
    for (let i = 0; i < 9; i++) {
      const angle = roll() * Math.PI * 2, radius = Math.sqrt(roll());
      const x = cx + rx * radius * Math.cos(angle), z = cz + rz * radius * Math.sin(angle);
      plumes.anchors.push(x, ground(x, z) - .12, z);
      plumes.settings.push(17 + roll() * 17, 25 + roll() * 26, roll() * 81);
    }
  }

  const glow = new T.BufferGeometry();
  glow.setAttribute("position", new T.Float32BufferAttribute(beds.position, 3));
  glow.setAttribute("uv", new T.Float32BufferAttribute(beds.uv, 2));
  glow.setIndex(beds.index);
  const coals = new T.Mesh(glow, new T.ShaderMaterial({
    uniforms: {time}, transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: `
      varying vec2 p;
      varying vec3 world;
      varying float depth;
      void main(){
        p=uv; world=position;
        vec4 view=modelViewMatrix*vec4(position,1.);
        depth=-view.z;
        gl_Position=projectionMatrix*view;
      }`,
    fragmentShader: `
      uniform float time;
      varying vec2 p;
      varying vec3 world;
      varying float depth;
      ${noise}
      ${linear}
      void main(){
        float edge=length(p)+(noise(world.xz*.9)-.5)*.5;
        float mask=1.-smoothstep(.35,1.,edge);
        float grain=noise(world.xz*3.7);
        float hot=smoothstep(.5,.82,grain)*(.65+.35*sin(time*(2.3+grain*3.)+grain*40.));
        vec3 ember=mix(vec3(.42,.05,0.),vec3(1.,.42,.07),hot);
        gl_FragColor=vec4(toLinear(ember),mask*(.32+.68*hot)*exp(-depth*.0038));
        #include <colorspace_fragment>
      }`
  }));
  coals.renderOrder = 1;

  const drift = new T.BufferGeometry();
  drift.setAttribute("position", new T.Float32BufferAttribute(sparks.position, 3));
  drift.setAttribute("settings", new T.Float32BufferAttribute(sparks.settings, 3));
  const embers = new T.Points(drift, new T.ShaderMaterial({
    uniforms: {time}, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    vertexShader: `
      attribute vec3 settings;
      uniform float time;
      varying float life;
      void main(){
        life=fract(time*settings.x+settings.z);
        float wind=.62+.21*sin(time*.88-position.z*.066)+.12*sin(time*1.73+position.x*.09);
        vec3 rise=position+vec3(life*life*wind*7.+sin(life*9.+settings.z*6.)*.6,
          life*settings.y,cos(life*7.+settings.z*4.)*.6);
        vec4 view=modelViewMatrix*vec4(rise,1.);
        gl_PointSize=clamp(46./-view.z,1.,4.)*(1.-life*.6);
        gl_Position=projectionMatrix*view;
      }`,
    fragmentShader: `
      varying float life;
      ${linear}
      void main(){
        float spot=1.-smoothstep(.15,.5,length(gl_PointCoord-.5));
        float blink=.6+.4*step(.3,fract(life*13.));
        gl_FragColor=vec4(toLinear(mix(vec3(1.,.85,.45),vec3(1.,.3,.04),life)),spot*(1.-life)*blink);
        #include <colorspace_fragment>
      }`
  }));
  embers.frustumCulled = false;
  embers.renderOrder = 2;
  scene.add(coals, embers);

  for (const smoke of [false, true]) {
    const {anchors, settings} = smoke ? plumes : flames;
    const material = new T.ShaderMaterial({
      uniforms: {time, hover, pointer, smoke: {value: smoke}}, transparent: true, depthWrite: false,
      // Flames add light rather than painting over the scene, so overlaps glow and need no sorting.
      blending: smoke ? T.NormalBlending : T.AdditiveBlending,
      vertexShader: `
        attribute vec3 anchor, settings;
        uniform bool smoke;
        uniform float time, hover;
        uniform vec2 pointer;
        varying vec2 p;
        varying float phase, depth;
        void main(){
          p=uv; phase=settings.z;
          float y=uv.y;
          float wind=.62+.21*sin(time*.88-anchor.z*.066)+.12*sin(time*1.73+anchor.x*.09);
          float pulse=.85+.12*sin(time*(2.1+fract(phase)*2.6)+phase)+.05*sin(time*7.2+phase*1.7);
          float bend=y*y*wind;
          float curl=sin(y*6.8-time*3.3+phase)*y*y;
          float drift=smoke?bend*19.:settings.y*(bend*.30+curl*.07);
          vec3 base=anchor+vec3(drift,y*settings.y*(smoke?1.:pulse),bend*settings.y*.13);
          vec4 view=modelViewMatrix*vec4(base,1.);
          view.x+=position.x*settings.x*(smoke?(.38+y*.98):1.);
          depth=-view.z;
          vec4 clip=projectionMatrix*view;
          float nearby=1.-smoothstep(.04,.32,distance(pointer,clip.xy/max(.1,clip.w)));
          if(!smoke)clip.x+=clip.w*y*(.022*nearby+hover*.012)*sin(phase+time*2.);
          gl_Position=clip;
        }`,
      fragmentShader: `
        uniform bool smoke;
        uniform float time;
        varying vec2 p;
        varying float phase, depth;
        ${noise}
        ${linear}
        void main(){
          float y=p.y;
          float distanceFade=exp(-depth*(smoke?.0018:.0038));
          if(smoke){
            vec2 drift=vec2(p.x*3.+sin(y*5.+phase)*.36+phase,y*4.8-time*.34);
            float billow=.73*noise(drift)+.27*noise(drift*2.06);
            float mask=1.-smoothstep(.13,.5,abs(p.x-.5)+(billow-.5)*.37);
            float opacity=mask*sin(y*3.14159)*smoothstep(.37,.78,billow)*.18*distanceFade;
            gl_FragColor=vec4(toLinear(mix(vec3(.30,.27,.25),vec3(.69,.68,.64),clamp(billow+y*.32,0.,1.))),opacity);
          }else{
            float rise=y*4.7-time*(1.48+fract(phase*.37)*1.48);
            float plume=fbm(vec2(p.x*3.3+phase,rise));
            float curl=noise(vec2(p.x*6.7-phase,rise*1.48+plume*1.65));
            float eddies=noise(vec2(p.x*13.+curl*1.9,rise*2.43-phase));
            float lateral=p.x-.5+(plume-.5)*pow(y,.8)*.64;
            float heat=1.-abs(lateral)/mix(.37,.08,pow(y,1.4))-y*.70+
              (curl-.48)*(.55+y*.94)+(eddies-.5)*.29;
            float breakup=mix(1.,smoothstep(.28,.57,curl),smoothstep(.24,.8,y));
            float alpha=smoothstep(.015,.34,heat)*breakup*smoothstep(0.,.22,y)*(1.-smoothstep(.48,1.,y));
            float core=clamp(heat*.91-y*.39+(eddies-.5)*.24,0.,1.);
            vec3 flame=mix(vec3(.55,.046,.005),vec3(1.,.29,.025),smoothstep(.025,.48,core));
            flame=mix(flame,vec3(1.,.73,.18),smoothstep(.39,.76,core));
            flame=mix(flame,vec3(1.,.96,.73),smoothstep(.69,.98,core));
            // Cool edges fade out instead of darkening, so each tongue ends in glow, not a brown rim.
            gl_FragColor=vec4(toLinear(flame),alpha*smoothstep(0.,.45,core)*distanceFade*.85);
          }
          #include <colorspace_fragment>
        }`
    });
    const quad = new T.PlaneGeometry(1, 1, 1, smoke ? 4 : 8);
    const layer = new T.Mesh(billboards(quad, [["anchor", anchors, 3], ["settings", settings, 3]],
      anchors.length / 3), material);
    layer.frustumCulled = false;
    layer.renderOrder = smoke ? 3 : 2;
    scene.add(layer);
  }
}

function start() {
  let renderer;
  try { renderer = new T.WebGLRenderer({canvas, antialias: true, powerPreference: "high-performance"}); } catch { return; }
  const finish = createFinish(renderer);
  const scene = new T.Scene();
  scene.background = new T.Color("#82929b");
  scene.fog = new T.FogExp2("#b0c0c8", .0022);
  const sky = daylight(scene);
  const time = {value: 0}, hover = {value: 0}, pointer = {value: new T.Vector2(4, 4)};
  terrain(scene);
  forest(scene, time);
  combustion(scene, time, hover, pointer);
  groundCover(scene);
  const firelight = new T.PointLight("#ff812d", 420, 54, 1.65);
  scene.add(firelight);
  const fireTarget = new T.Vector3();
  const camera = new T.PerspectiveCamera(58, 1, .3, 600);
  const aim = new T.Vector3(); const mouse = new T.Vector2(4, 4);
  let previous = 0, frame = 0, progress = 0, paused = preference.matches, visible = true, holding = false;
  const pixelRatio = Math.min(devicePixelRatio, 1.5);
  let frameCount = 0, frameTotal = 0;
  let scrollTarget = 0, travel = 1, journeyTop = 0;
  const measure = new URLSearchParams(location.search).has("hero-fps");
  if (measure) renderer.info.autoReset = false;
  function updateScroll() {
    scrollTarget = T.MathUtils.clamp((scrollY - journeyTop) / travel, 0, 1);
    if (paused) {
      progress = scrollTarget;
      if (!frame && visible && !document.hidden) frame = requestAnimationFrame(draw);
    }
  }
  function draw(now) {
    if (measure) renderer.info.reset();
    const lastFrame = previous;
    frame = 0; const delta = previous ? Math.min(.05, (now - previous) / 1000) : 0; previous = now;
    if (!paused) {
      if (delta && document.visibilityState === "visible") {
        frameCount++;
        frameTotal += (now - lastFrame) / 1000;
        if (frameCount >= 75) {
          if (measure) {
            canvas.dataset.fps = (frameCount / frameTotal).toFixed(1);
            canvas.dataset.pixelRatio = pixelRatio.toFixed(2);
          }
          frameCount = 0;
          frameTotal = 0;
        }
      }
      time.value += delta; const ease = 1 - Math.exp(-delta * 6);
      if (!holding) progress = T.MathUtils.lerp(progress, scrollTarget, ease);
      hover.value = T.MathUtils.lerp(hover.value, Number(holding), ease);
      pointer.value.lerp(mouse, ease);
    }
    const position = .012 + progress * .89 + (holding || paused ? 0 : Math.sin(time.value * .13) * .008);
    path.getPointAt(position, camera.position); path.getPointAt(position + .065, aim); aim.y -= 3; camera.lookAt(aim);
    const [x, z] = patches.reduce((best, patch) =>
      Math.abs(patch[1] - camera.position.z) < Math.abs(best[1] - camera.position.z) ? patch : best);
    // Glide toward the nearest patch instead of jumping, so lit foliage doesn't flick on and off.
    fireTarget.set(x, ground(x, z) + 5, z);
    if (delta) firelight.position.lerp(fireTarget, 1 - Math.exp(-delta * 1.2));
    else firelight.position.copy(fireTarget);
    firelight.intensity = 380 + 80 * Math.sin(time.value * 9) + 48 * Math.sin(time.value * 17);
    sky.position.copy(camera.position);
    if (finish) finish(scene, camera, time.value);
    else renderer.render(scene, camera);
    if (measure) {
      canvas.dataset.triangles = String(renderer.info.render.triangles);
      canvas.dataset.drawCalls = String(renderer.info.render.calls);
    }
    if (!paused && visible && !document.hidden) frame = requestAnimationFrame(draw);
  }
  function refresh() {
    cancelAnimationFrame(frame); frame = 0; previous = 0;
    motion.textContent = paused ? "Play motion" : "Pause motion"; motion.setAttribute("aria-pressed", String(paused));
    if (visible && !document.hidden) frame = requestAnimationFrame(draw);
  }
  journey.classList.add("is-3d"); hero.querySelector(".valley-scroll").hidden = false; motion.hidden = false;
  new ResizeObserver(() => {
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(hero.clientWidth, hero.clientHeight, false);
    camera.aspect = hero.clientWidth / hero.clientHeight; camera.updateProjectionMatrix();
    travel = Math.max(1, journey.offsetHeight - hero.offsetHeight);
    journeyTop = journey.getBoundingClientRect().top + scrollY;
    updateScroll();
    if (paused || !frame) refresh();
  }).observe(hero);
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; refresh(); }).observe(hero);
  addEventListener("scroll", updateScroll, {passive: true});
  document.addEventListener("visibilitychange", refresh);
  motion.onclick = () => { paused = !paused; refresh(); };
  preference.addEventListener("change", () => { paused = preference.matches; refresh(); });
  hero.onpointermove = event => {
    const box = canvas.getBoundingClientRect();
    mouse.set((event.clientX - box.left) / box.width * 2 - 1, 1 - (event.clientY - box.top) / box.height * 2);
  };
  hero.onpointerleave = () => mouse.set(4, 4);
  const arrow = hero.querySelector(".valley-arrow");
  arrow.onpointerenter = () => { holding = true; }; arrow.onpointerleave = () => { holding = false; };
  refresh();
}
start();
