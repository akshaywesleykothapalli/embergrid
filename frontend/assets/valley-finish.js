import * as T from "./vendor/three.module.min.js";

// Filmic finish for the valley. The scene renders into a linear high-range buffer, warm fire light
// blooms through a small blur pyramid, and one last pass tone maps, grades, vignettes and adds grain.
const EXPOSURE = 1.2;   // Overall brightness after tone mapping.
const BLOOM = .9;       // How strongly fire light spills into the air around it.
const LEVELS = 5;       // Blur pyramid depth; each level halves the size, so 5 reaches 1/32 of the screen.

const vertexShader = `
  varying vec2 p;
  void main(){ p=uv; gl_Position=vec4(position.xy,0.,1.); }`;

// Keep only warm, bright light: flames, embers and sparks, not sunlit leaves or sky.
const brightPass = `
  uniform sampler2D source;
  uniform vec2 texel;
  varying vec2 p;
  vec3 fire(vec2 at){
    vec3 c=texture2D(source,at).rgb;
    float peak=max(c.r,max(c.g,c.b));
    float warm=smoothstep(.3,.75,(c.r-c.b)/max(c.r,1e-4))*step(c.g,c.r);
    return c*smoothstep(.5,1.3,peak)*warm;
  }
  void main(){
    gl_FragColor=vec4((fire(p+texel*vec2(-1,-1))+fire(p+texel*vec2(1,-1))+
      fire(p+texel*vec2(-1,1))+fire(p+texel*vec2(1,1)))*.25,1.);
  }`;

// Dual-filter blur: a five-tap downsample, then a tent upsample that adds the level above.
const downPass = `
  uniform sampler2D source;
  uniform vec2 texel;
  varying vec2 p;
  void main(){
    vec3 c=texture2D(source,p).rgb*4.;
    c+=texture2D(source,p+texel*vec2(-1,-1)).rgb+texture2D(source,p+texel*vec2(1,-1)).rgb;
    c+=texture2D(source,p+texel*vec2(-1,1)).rgb+texture2D(source,p+texel*vec2(1,1)).rgb;
    gl_FragColor=vec4(c/8.,1.);
  }`;
const upPass = `
  uniform sampler2D source, base;
  uniform vec2 texel;
  varying vec2 p;
  void main(){
    vec3 c=texture2D(source,p+texel*vec2(-2,0)).rgb+texture2D(source,p+texel*vec2(2,0)).rgb;
    c+=texture2D(source,p+texel*vec2(0,-2)).rgb+texture2D(source,p+texel*vec2(0,2)).rgb;
    c+=(texture2D(source,p+texel*vec2(-1,-1)).rgb+texture2D(source,p+texel*vec2(1,-1)).rgb+
      texture2D(source,p+texel*vec2(-1,1)).rgb+texture2D(source,p+texel*vec2(1,1)).rgb)*2.;
    gl_FragColor=vec4(c/12.+texture2D(base,p).rgb,1.);
  }`;

const compositePass = `
  uniform sampler2D scene, bloom;
  uniform float strength, time;
  varying vec2 p;
  void main(){
    gl_FragColor=vec4(texture2D(scene,p).rgb+texture2D(bloom,p).rgb*strength,1.);
    #include <tonemapping_fragment>
    // Grade: cool, deeper shadows and warm highlights, with a little more colour overall.
    float luma=dot(gl_FragColor.rgb,vec3(.2126,.7152,.0722));
    gl_FragColor.rgb=mix(gl_FragColor.rgb*vec3(.93,.98,1.07),gl_FragColor.rgb*vec3(1.05,1.,.92),smoothstep(.04,.5,luma));
    gl_FragColor.rgb=max(mix(vec3(luma),gl_FragColor.rgb,1.25),0.);
    #include <colorspace_fragment>
    // AgX leaves midtones flat; a gentle S-curve restores depth in the shadows without clipping highlights.
    gl_FragColor.rgb=clamp(gl_FragColor.rgb,0.,1.);
    gl_FragColor.rgb=mix(gl_FragColor.rgb,gl_FragColor.rgb*gl_FragColor.rgb*(3.-2.*gl_FragColor.rgb),.45);
    vec2 edge=p-.5;
    gl_FragColor.rgb*=1.-.35*smoothstep(.12,.55,dot(edge,edge));
    float grain=fract(sin(dot(gl_FragCoord.xy+fract(time)*97.,vec2(12.9898,78.233)))*43758.5453);
    gl_FragColor.rgb+=(grain-.5)*.03;
  }`;

// Returns a render function, or null where the browser can't render to half-float buffers.
export function createFinish(renderer) {
  const {capabilities, extensions} = renderer;
  if (!capabilities.isWebGL2 || !extensions.has("EXT_color_buffer_float") && !extensions.has("EXT_color_buffer_half_float")) return null;
  renderer.toneMapping = T.AgXToneMapping;
  renderer.toneMappingExposure = EXPOSURE;

  const hdr = new T.WebGLRenderTarget(1, 1, {type: T.HalfFloatType, samples: 4});
  const flat = {type: T.HalfFloatType, depthBuffer: false};
  const down = Array.from({length: LEVELS}, () => new T.WebGLRenderTarget(1, 1, flat));
  const up = Array.from({length: LEVELS - 1}, () => new T.WebGLRenderTarget(1, 1, flat));
  const material = (fragmentShader, uniforms) =>
    new T.ShaderMaterial({vertexShader, fragmentShader, uniforms, depthTest: false, depthWrite: false});
  const bright = material(brightPass, {source: {value: null}, texel: {value: new T.Vector2()}});
  const shrink = material(downPass, {source: {value: null}, texel: {value: new T.Vector2()}});
  const grow = material(upPass, {source: {value: null}, base: {value: null}, texel: {value: new T.Vector2()}});
  const composite = material(compositePass, {scene: {value: hdr.texture}, bloom: {value: null},
    strength: {value: BLOOM}, time: {value: 0}});

  // One triangle that covers the whole screen.
  const triangle = new T.BufferGeometry();
  triangle.setAttribute("position", new T.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  triangle.setAttribute("uv", new T.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const screen = new T.Mesh(triangle);
  screen.frustumCulled = false;
  const flatScene = new T.Scene().add(screen);
  const flatCamera = new T.OrthographicCamera();
  const size = new T.Vector2(), last = new T.Vector2();

  function blit(pass, source, target) {
    pass.uniforms.source.value = source.texture;
    pass.uniforms.texel.value.set(1 / source.width, 1 / source.height);
    screen.material = pass;
    renderer.setRenderTarget(target);
    renderer.render(flatScene, flatCamera);
  }

  return function render(scene, camera, time) {
    // Follow the canvas, including the automatic resolution drop when frames run slow.
    renderer.getDrawingBufferSize(size);
    if (!size.equals(last)) {
      last.copy(size);
      hdr.setSize(size.x, size.y);
      down.forEach((target, i) => target.setSize(Math.max(1, size.x >> i + 1), Math.max(1, size.y >> i + 1)));
      up.forEach((target, i) => target.setSize(down[i].width, down[i].height));
    }
    renderer.setRenderTarget(hdr);
    renderer.render(scene, camera);
    blit(bright, hdr, down[0]);
    for (let i = 1; i < LEVELS; i++) blit(shrink, down[i - 1], down[i]);
    let source = down[LEVELS - 1];
    for (let i = LEVELS - 2; i >= 0; i--) {
      grow.uniforms.base.value = down[i].texture;
      blit(grow, source, up[i]);
      source = up[i];
    }
    composite.uniforms.bloom.value = source.texture;
    composite.uniforms.time.value = time;
    screen.material = composite;
    renderer.setRenderTarget(null);
    renderer.render(flatScene, flatCamera);
  };
}
