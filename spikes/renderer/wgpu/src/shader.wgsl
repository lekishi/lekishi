// One lighting model for every surface: a warm directional sun, a sky/ground
// hemisphere term, and distance fog, matching the shared scene contract so the
// three spikes are compared on the same light rather than on engine defaults.
struct Uniforms {
  view_proj: mat4x4<f32>,
  cam_pos: vec4<f32>,
  sun_dir: vec4<f32>,      // xyz: direction towards the sun
  sun_color: vec4<f32>,    // rgb, w = intensity
  fog_color: vec4<f32>,    // rgb, w = 1 when the shader must gamma-encode
  fog_params: vec4<f32>,   // near, far, hemisphere intensity, unused
  sky: vec4<f32>,
  ground: vec4<f32>,
};
@group(0) @binding(0) var<uniform> U: Uniforms;
@group(1) @binding(0) var tex: texture_2d<f32>;
@group(1) @binding(1) var samp: sampler;

struct VsOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) color: vec4<f32>,
};

fn srgb_to_linear(c: vec3<f32>) -> vec3<f32> { return pow(c, vec3<f32>(2.2)); }

fn shade(world: vec3<f32>, n_in: vec3<f32>, albedo: vec3<f32>) -> vec3<f32> {
  let n = normalize(n_in);
  let l = normalize(U.sun_dir.xyz);
  let diffuse = max(dot(n, l), 0.0) * U.sun_color.w * srgb_to_linear(U.sun_color.rgb);
  let hemi = mix(srgb_to_linear(U.ground.rgb), srgb_to_linear(U.sky.rgb), n.y * 0.5 + 0.5) * U.fog_params.z;
  var lit = albedo * (diffuse + hemi) * 0.82;
  // ACES-style curve keeps the sunlit grass from clipping, like the Three spike.
  lit = (lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14);
  let dist = distance(world, U.cam_pos.xyz);
  let f = clamp((dist - U.fog_params.x) / (U.fog_params.y - U.fog_params.x), 0.0, 1.0);
  return mix(lit, srgb_to_linear(U.fog_color.rgb), f);
}

fn encode(c: vec3<f32>) -> vec3<f32> {
  if (U.fog_color.w > 0.5) { return pow(c, vec3<f32>(1.0 / 2.2)); }
  return c;
}

// ---- terrain: textured, vertex normals from the heightmap ----
@vertex
fn vs_terrain(@location(0) pos: vec3<f32>, @location(1) normal: vec3<f32>, @location(2) uv: vec2<f32>) -> VsOut {
  var o: VsOut;
  o.clip = U.view_proj * vec4<f32>(pos, 1.0);
  o.world = pos; o.normal = normal; o.uv = uv; o.color = vec4<f32>(1.0);
  return o;
}
@fragment
fn fs_terrain(i: VsOut) -> @location(0) vec4<f32> {
  let albedo = srgb_to_linear(textureSample(tex, samp, i.uv).rgb);
  return vec4<f32>(encode(shade(i.world, i.normal, albedo)), 1.0);
}

// ---- instanced solid colour: trees, houses, ships, route dashes, water ----
@vertex
fn vs_inst(@location(0) pos: vec3<f32>, @location(1) normal: vec3<f32>,
           @location(3) m0: vec4<f32>, @location(4) m1: vec4<f32>, @location(5) m2: vec4<f32>, @location(6) m3: vec4<f32>,
           @location(7) color: vec4<f32>) -> VsOut {
  let m = mat4x4<f32>(m0, m1, m2, m3);
  let w = m * vec4<f32>(pos, 1.0);
  var o: VsOut;
  o.clip = U.view_proj * w;
  o.world = w.xyz;
  o.normal = (m * vec4<f32>(normal, 0.0)).xyz;
  o.uv = vec2<f32>(0.0);
  o.color = color;
  return o;
}
@fragment
fn fs_inst(i: VsOut) -> @location(0) vec4<f32> {
  return vec4<f32>(encode(shade(i.world, i.normal, srgb_to_linear(i.color.rgb))), i.color.a);
}
