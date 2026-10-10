// Rust/wgpu probe of the renderer spike scene, compiled to wasm32 and driven
// from the same page API as the Three.js and Cesium spikes. It exists to
// measure what a custom engine costs and buys: the scene is assembled here
// from the shared heightmap, texture and scene.json, rendered through wgpu's
// WebGL2 backend (so it runs where the other spikes run), with no shadows yet
// — shadow mapping is the first thing a real engine would have to add.
use bytemuck::{Pod, Zeroable};
use glam::{Mat4, Quat, Vec3};
use serde::Deserialize;
use wasm_bindgen::prelude::*;
use wgpu::util::DeviceExt;

#[derive(Deserialize)]
struct LonLat { lon: f64, lat: f64 }
#[derive(Deserialize)]
struct Place { lon: f64, lat: f64, #[serde(default)] village: u32, #[serde(default)] seed: u32 }
#[derive(Deserialize)]
struct Ship { lon: f64, lat: f64, #[serde(rename = "headingRad")] heading: f32, scale: f32 }
#[derive(Deserialize)]
struct Trees { #[serde(rename = "sampleEvery")] sample_every: usize, #[serde(rename = "minElev")] min_elev: f32, #[serde(rename = "maxElev")] max_elev: f32, #[serde(rename = "maxSlope")] max_slope: f32, #[serde(rename = "noiseThreshold")] noise_threshold: f32, #[serde(rename = "dropFraction")] drop_fraction: f32, #[serde(rename = "coniferAbove")] conifer_above: f32, #[serde(rename = "coniferSlope")] conifer_slope: f32 }
#[derive(Deserialize)]
struct Palette { conifer: String, broadleaf: String, trunk: String, wall: String, roof: String, thatch: String, hull: String, deck: String, sail: String, flag: String, route: String }
#[derive(Deserialize)]
struct Sun { #[serde(rename = "azimuthDeg")] az: f32, #[serde(rename = "elevationDeg")] el: f32, color: String, intensity: f32 }
#[derive(Deserialize)]
struct Hemi { sky: String, ground: String, intensity: f32 }
#[derive(Deserialize)]
struct Fog { color: String, #[serde(rename = "nearUnits")] near: f32, #[serde(rename = "farUnits")] far: f32 }
#[derive(Deserialize)]
struct Water { color: String, opacity: f32 }
#[derive(Deserialize)]
struct Offset { x: f32, y: f32, z: f32 }
#[derive(Deserialize)]
struct Camera { target: LonLat, #[serde(rename = "offsetUnits")] offset: Offset, #[serde(rename = "fovDeg")] fov: f32 }
#[derive(Deserialize)]
struct Spec { #[serde(rename = "unitsPerMeter")] units_per_meter: f32, #[serde(rename = "verticalExaggeration")] exaggeration: f32, sun: Sun, hemisphere: Hemi, fog: Fog, water: Water, camera: Camera, places: Vec<Place>, ships: Vec<Ship>, route: Vec<LonLat>, trees: Trees, palette: Palette }
#[derive(Deserialize)]
struct HeightMeta { mpp: f32, #[serde(rename = "MX0")] mx0: f64, #[serde(rename = "MX1")] mx1: f64, #[serde(rename = "MY0")] my0: f64, #[serde(rename = "MY1")] my1: f64 }

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct Vertex { pos: [f32; 3], normal: [f32; 3], uv: [f32; 2] }
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct Instance { model: [[f32; 4]; 4], color: [f32; 4] }
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct Uniforms { view_proj: [[f32; 4]; 4], cam_pos: [f32; 4], sun_dir: [f32; 4], sun_color: [f32; 4], fog_color: [f32; 4], fog_params: [f32; 4], sky: [f32; 4], ground: [f32; 4] }

// ---- shared placement helpers (identical rules to the JS spikes) ----
fn hash(x: f32, y: f32) -> f32 { let s = (x * 127.1 + y * 311.7).sin() * 43758.5453; s - s.floor() }
fn vn(x: f32, y: f32) -> f32 { let (x0, y0) = (x.floor(), y.floor()); let (fx, fy) = (x - x0, y - y0); let sx = fx * fx * (3.0 - 2.0 * fx); let sy = fy * fy * (3.0 - 2.0 * fy); (hash(x0, y0) * (1.0 - sx) + hash(x0 + 1.0, y0) * sx) * (1.0 - sy) + (hash(x0, y0 + 1.0) * (1.0 - sx) + hash(x0 + 1.0, y0 + 1.0) * sx) * sy }
fn fbm(x: f32, y: f32) -> f32 { vn(x, y) * 0.5 + vn(x * 2.1, y * 2.1) * 0.3 + vn(x * 4.3, y * 4.3) * 0.2 }
fn merc_x(lon: f64) -> f64 { (lon + 180.0) / 360.0 }
fn merc_y(lat: f64) -> f64 { let r = lat.to_radians(); (1.0 - (r.tan() + 1.0 / r.cos()).ln() / std::f64::consts::PI) / 2.0 }
fn hex(s: &str) -> [f32; 4] { let p = |i: usize| u8::from_str_radix(&s[i..i + 2], 16).unwrap_or(0) as f32 / 255.0; [p(1), p(3), p(5), 1.0] }

// ---- primitive meshes with flat or smooth normals, baked offsets like the Three spike ----
struct Mesh { v: Vec<Vertex>, i: Vec<u32> }
impl Mesh {
    fn new() -> Self { Mesh { v: vec![], i: vec![] } }
    fn tri(&mut self, a: Vec3, b: Vec3, c: Vec3) { let n = (b - a).cross(c - a).normalize_or_zero(); let base = self.v.len() as u32; for p in [a, b, c] { self.v.push(Vertex { pos: p.into(), normal: n.into(), uv: [0.0; 2] }) } self.i.extend([base, base + 1, base + 2]) }
    fn quad(&mut self, a: Vec3, b: Vec3, c: Vec3, d: Vec3) { self.tri(a, b, c); self.tri(a, c, d) }
    fn boxed(sx: f32, sy: f32, sz: f32, off: Vec3) -> Self { let mut m = Mesh::new(); let (x, y, z) = (sx / 2.0, sy / 2.0, sz / 2.0); let p = |a: f32, b: f32, c: f32| Vec3::new(a, b, c) + off; let (a, b, c, d, e, f, g, h) = (p(-x, -y, -z), p(x, -y, -z), p(x, y, -z), p(-x, y, -z), p(-x, -y, z), p(x, -y, z), p(x, y, z), p(-x, y, z)); m.quad(e, f, g, h); m.quad(b, a, d, c); m.quad(a, e, h, d); m.quad(f, b, c, g); m.quad(h, g, c, d); m.quad(a, b, f, e); m }
    fn cone(r: f32, h: f32, segs: usize, off: Vec3, rot_y: f32, scale_z: f32) -> Self { let mut m = Mesh::new(); let tip = Vec3::new(0.0, h, 0.0) + off; let rim = |k: usize| { let a = k as f32 / segs as f32 * std::f32::consts::TAU + rot_y; Vec3::new(a.cos() * r, 0.0, a.sin() * r * scale_z) + off }; for k in 0..segs { m.tri(rim(k + 1), rim(k), tip); m.tri(rim(k), rim(k + 1), Vec3::new(0.0, 0.0, 0.0) + off) } m }
    fn cylinder(rt: f32, rb: f32, h: f32, segs: usize, off: Vec3) -> Self { let mut m = Mesh::new(); for k in 0..segs { let a0 = k as f32 / segs as f32 * std::f32::consts::TAU; let a1 = (k + 1) as f32 / segs as f32 * std::f32::consts::TAU; let b0 = Vec3::new(a0.cos() * rb, 0.0, a0.sin() * rb) + off; let b1 = Vec3::new(a1.cos() * rb, 0.0, a1.sin() * rb) + off; let t0 = Vec3::new(a0.cos() * rt, h, a0.sin() * rt) + off; let t1 = Vec3::new(a1.cos() * rt, h, a1.sin() * rt) + off; m.quad(b1, b0, t0, t1) } m }
    fn sphere(r: f32, ws: usize, hs: usize, off: Vec3) -> Self { let mut m = Mesh::new(); let base = m.v.len() as u32; for j in 0..=hs { let v = j as f32 / hs as f32 * std::f32::consts::PI; for i in 0..=ws { let u = i as f32 / ws as f32 * std::f32::consts::TAU; let n = Vec3::new(v.sin() * u.cos(), v.cos(), v.sin() * u.sin()); m.v.push(Vertex { pos: (n * r + off).into(), normal: n.into(), uv: [0.0; 2] }) } } for j in 0..hs { for i in 0..ws { let a = base + (j * (ws + 1) + i) as u32; let b = a + ws as u32 + 1; m.i.extend([a, a + 1, b, a + 1, b + 1, b]) } } m }
}

fn model(t: Vec3, rot_y: f32, s: f32) -> [[f32; 4]; 4] { Mat4::from_scale_rotation_translation(Vec3::splat(s), Quat::from_rotation_y(rot_y), t).to_cols_array_2d() }
fn model_m(m: Mat4) -> [[f32; 4]; 4] { m.to_cols_array_2d() }

struct Batch { vb: wgpu::Buffer, ib: wgpu::Buffer, index_count: u32, inst: wgpu::Buffer, inst_count: u32, tris_per_inst: u32 }

#[wasm_bindgen]
pub struct Probe {
    device: wgpu::Device,
    queue: wgpu::Queue,
    surface: wgpu::Surface<'static>,
    config: wgpu::SurfaceConfiguration,
    depth: wgpu::TextureView,
    pipe_terrain: wgpu::RenderPipeline,
    pipe_inst: wgpu::RenderPipeline,
    pipe_blend: wgpu::RenderPipeline,
    uniforms: Uniforms,
    ubuf: wgpu::Buffer,
    bg0: wgpu::BindGroup,
    bg_tex: wgpu::BindGroup,
    terrain_vb: wgpu::Buffer,
    terrain_ib: wgpu::Buffer,
    terrain_indices: u32,
    opaque: Vec<Batch>,
    water: Vec<Batch>,
    ship2: Vec<(usize, usize, Mat4)>, // (batch, instance, local transform) of the moving ship's parts
    ship2_base: Mat4,
    ship2_instances: Vec<Vec<Instance>>,
    route: Vec<Vec3>,
    target: Vec3,
    offset: Vec3,
    fov: f32,
    orbit: f32,
    view_proj: Mat4,
    draw_calls: u32,
    triangles: u32,
    trees: u32,
    houses: u32,
    all_trees: Vec<[f32; 4]>, // x, z, elevation, slope (unit space)
    tree_batches: (usize, usize, usize),
    heights: Vec<f32>,
    cols: usize,
    rows: usize,
    u: f32,
    ys: f32,
    meta: HeightMeta,
    palette: Palette,
    trees_rule: Trees,
}

#[wasm_bindgen]
impl Probe {
    /// `heights` is the decoded Terrarium elevation grid in metres (row-major),
    /// `tex` the painted terrain texture as RGBA8 bytes.
    #[wasm_bindgen(constructor)]
    pub async fn new(canvas: web_sys::HtmlCanvasElement, spec_json: String, meta_json: String, heights: Vec<f32>, cols: usize, rows: usize, tex: Vec<u8>, tex_w: u32, tex_h: u32) -> Result<Probe, JsValue> {
        console_error_panic_hook::set_once();
        let spec: Spec = serde_json::from_str(&spec_json).map_err(|e| JsValue::from_str(&e.to_string()))?;
        let meta: HeightMeta = serde_json::from_str(&meta_json).map_err(|e| JsValue::from_str(&e.to_string()))?;
        let (w, h) = (canvas.width().max(1), canvas.height().max(1));

        let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor { backends: wgpu::Backends::GL, ..Default::default() });
        let surface = instance.create_surface(wgpu::SurfaceTarget::Canvas(canvas)).map_err(|e| JsValue::from_str(&e.to_string()))?;
        let adapter = instance.request_adapter(&wgpu::RequestAdapterOptions { power_preference: wgpu::PowerPreference::HighPerformance, compatible_surface: Some(&surface), force_fallback_adapter: false }).await.ok_or_else(|| JsValue::from_str("no adapter"))?;
        let (device, queue) = adapter.request_device(&wgpu::DeviceDescriptor { label: None, required_features: wgpu::Features::empty(), required_limits: adapter.limits(), memory_hints: Default::default() }, None).await.map_err(|e| JsValue::from_str(&e.to_string()))?;
        let caps = surface.get_capabilities(&adapter);
        let format = caps.formats[0];
        let config = wgpu::SurfaceConfiguration { usage: wgpu::TextureUsages::RENDER_ATTACHMENT, format, width: w, height: h, present_mode: wgpu::PresentMode::Fifo, alpha_mode: caps.alpha_modes[0], view_formats: vec![], desired_maximum_frame_latency: 2 };
        surface.configure(&device, &config);
        let depth = make_depth(&device, w, h);

        // ---- terrain geometry from the heightmap ----
        let u = meta.mpp * spec.units_per_meter; let ys = spec.exaggeration * spec.units_per_meter;
        let (wu, hu) = (cols as f32 * u, rows as f32 * u);
        let h_at = |c: isize, r: isize| heights[(r.clamp(0, rows as isize - 1) as usize) * cols + c.clamp(0, cols as isize - 1) as usize];
        let mut tv = Vec::with_capacity(cols * rows);
        for r in 0..rows { for c in 0..cols {
            let e = h_at(c as isize, r as isize);
            let dx = (h_at(c as isize + 1, r as isize) - h_at(c as isize - 1, r as isize)) * ys / (2.0 * u);
            let dz = (h_at(c as isize, r as isize + 1) - h_at(c as isize, r as isize - 1)) * ys / (2.0 * u);
            tv.push(Vertex { pos: [c as f32 * u - wu / 2.0, e * ys, r as f32 * u - hu / 2.0], normal: Vec3::new(-dx, 1.0, -dz).normalize().into(), uv: [c as f32 / (cols - 1) as f32, r as f32 / (rows - 1) as f32] });
        } }
        let mut ti = Vec::with_capacity((cols - 1) * (rows - 1) * 6);
        for r in 0..rows - 1 { for c in 0..cols - 1 { let a = (r * cols + c) as u32; let b = a + cols as u32; ti.extend([a, b, a + 1, a + 1, b, b + 1]) } }
        let terrain_vb = device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: None, contents: bytemuck::cast_slice(&tv), usage: wgpu::BufferUsages::VERTEX });
        let terrain_ib = device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: None, contents: bytemuck::cast_slice(&ti), usage: wgpu::BufferUsages::INDEX });
        let mut triangles = (ti.len() / 3) as u32;

        // ---- texture ----
        let texture = device.create_texture_with_data(&queue, &wgpu::TextureDescriptor { label: None, size: wgpu::Extent3d { width: tex_w, height: tex_h, depth_or_array_layers: 1 }, mip_level_count: 1, sample_count: 1, dimension: wgpu::TextureDimension::D2, format: wgpu::TextureFormat::Rgba8Unorm, usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST, view_formats: &[] }, wgpu::util::TextureDataOrder::LayerMajor, &tex);
        let tex_view = texture.create_view(&Default::default());
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor { mag_filter: wgpu::FilterMode::Linear, min_filter: wgpu::FilterMode::Linear, mipmap_filter: wgpu::FilterMode::Linear, address_mode_u: wgpu::AddressMode::ClampToEdge, address_mode_v: wgpu::AddressMode::ClampToEdge, ..Default::default() });

        // ---- pipelines ----
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor { label: None, source: wgpu::ShaderSource::Wgsl(include_str!("shader.wgsl").into()) });
        let bgl0 = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor { label: None, entries: &[wgpu::BindGroupLayoutEntry { binding: 0, visibility: wgpu::ShaderStages::VERTEX_FRAGMENT, ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None }, count: None }] });
        let bgl1 = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor { label: None, entries: &[
            wgpu::BindGroupLayoutEntry { binding: 0, visibility: wgpu::ShaderStages::FRAGMENT, ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: true }, view_dimension: wgpu::TextureViewDimension::D2, multisampled: false }, count: None },
            wgpu::BindGroupLayoutEntry { binding: 1, visibility: wgpu::ShaderStages::FRAGMENT, ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering), count: None }] });
        let layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: None, bind_group_layouts: &[&bgl0, &bgl1], push_constant_ranges: &[] });
        let vlayout = wgpu::VertexBufferLayout { array_stride: std::mem::size_of::<Vertex>() as u64, step_mode: wgpu::VertexStepMode::Vertex, attributes: &wgpu::vertex_attr_array![0 => Float32x3, 1 => Float32x3, 2 => Float32x2] };
        let ilayout = wgpu::VertexBufferLayout { array_stride: std::mem::size_of::<Instance>() as u64, step_mode: wgpu::VertexStepMode::Instance, attributes: &wgpu::vertex_attr_array![3 => Float32x4, 4 => Float32x4, 5 => Float32x4, 6 => Float32x4, 7 => Float32x4] };
        let depth_state = |write: bool| wgpu::DepthStencilState { format: wgpu::TextureFormat::Depth24Plus, depth_write_enabled: write, depth_compare: wgpu::CompareFunction::Less, stencil: Default::default(), bias: Default::default() };
        let make = |vs: &str, fs: &str, bufs: &[wgpu::VertexBufferLayout], blend: Option<wgpu::BlendState>, write: bool, cull: Option<wgpu::Face>| device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: None, layout: Some(&layout), cache: None,
            vertex: wgpu::VertexState { module: &shader, entry_point: Some(vs), buffers: bufs, compilation_options: Default::default() },
            fragment: Some(wgpu::FragmentState { module: &shader, entry_point: Some(fs), targets: &[Some(wgpu::ColorTargetState { format, blend, write_mask: wgpu::ColorWrites::ALL })], compilation_options: Default::default() }),
            primitive: wgpu::PrimitiveState { cull_mode: cull, ..Default::default() }, depth_stencil: Some(depth_state(write)), multisample: Default::default(), multiview: None });
        let pipe_terrain = make("vs_terrain", "fs_terrain", &[vlayout.clone()], Some(wgpu::BlendState::REPLACE), true, Some(wgpu::Face::Back));
        let pipe_inst = make("vs_inst", "fs_inst", &[vlayout.clone(), ilayout.clone()], Some(wgpu::BlendState::REPLACE), true, None);
        let pipe_blend = make("vs_inst", "fs_inst", &[vlayout.clone(), ilayout.clone()], Some(wgpu::BlendState::ALPHA_BLENDING), false, None);

        let gamma = if format.is_srgb() { 0.0 } else { 1.0 };
        let (az, el) = (spec.sun.az.to_radians(), spec.sun.el.to_radians());
        let sc = hex(&spec.sun.color); let fc = hex(&spec.fog.color);
        let uniforms = Uniforms { view_proj: Mat4::IDENTITY.to_cols_array_2d(), cam_pos: [0.0; 4], sun_dir: [az.sin() * el.cos(), el.sin(), az.cos() * el.cos(), 0.0], sun_color: [sc[0], sc[1], sc[2], spec.sun.intensity], fog_color: [fc[0], fc[1], fc[2], gamma], fog_params: [spec.fog.near, spec.fog.far, spec.hemisphere.intensity, 0.0], sky: hex(&spec.hemisphere.sky), ground: hex(&spec.hemisphere.ground) };
        let ubuf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: None, contents: bytemuck::bytes_of(&uniforms), usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST });
        let bg0 = device.create_bind_group(&wgpu::BindGroupDescriptor { label: None, layout: &bgl0, entries: &[wgpu::BindGroupEntry { binding: 0, resource: ubuf.as_entire_binding() }] });
        let bg_tex = device.create_bind_group(&wgpu::BindGroupDescriptor { label: None, layout: &bgl1, entries: &[wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(&tex_view) }, wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::Sampler(&sampler) }] });

        // ---- scene placement ----
        let to_xz = |lon: f64, lat: f64| -> (f32, f32) { (((merc_x(lon) - meta.mx0) / (meta.mx1 - meta.mx0)) as f32 * wu - wu / 2.0, ((merc_y(lat) - meta.my0) / (meta.my1 - meta.my0)) as f32 * hu - hu / 2.0) };
        let h_lerp = |x: f32, z: f32| -> f32 { let c = (x + wu / 2.0) / u; let r = (z + hu / 2.0) / u; let (c0, r0) = (c.floor(), r.floor()); let (fc, fr) = (c - c0, r - r0); let (c0, r0) = (c0 as isize, r0 as isize); (h_at(c0, r0) * (1.0 - fc) + h_at(c0 + 1, r0) * fc) * (1.0 - fr) + (h_at(c0, r0 + 1) * (1.0 - fc) + h_at(c0 + 1, r0 + 1) * fc) * fr };
        let tr = &spec.trees; let pal = &spec.palette;
        let mut all_trees = vec![];
        let mut r = 2; while r < rows - 2 { let mut c = 2; while c < cols - 2 {
            let e = h_at(c as isize, r as isize);
            let sl = ((h_at(c as isize + 1, r as isize) - h_at(c as isize - 1, r as isize)).powi(2) + (h_at(c as isize, r as isize + 1) - h_at(c as isize, r as isize - 1)).powi(2)).sqrt() / (2.0 * meta.mpp);
            if e >= tr.min_elev && e <= tr.max_elev && sl <= tr.max_slope && fbm(c as f32 * 0.03 + 5.0, r as f32 * 0.03 + 7.0) >= tr.noise_threshold && hash(c as f32, r as f32) <= tr.drop_fraction {
                all_trees.push([(c as f32 + hash(r as f32, c as f32) * 1.6 - 0.8) * u - wu / 2.0, (r as f32 + hash(c as f32 * 3.0, r as f32) * 1.6 - 0.8) * u - hu / 2.0, e, sl]);
            }
            c += tr.sample_every } r += tr.sample_every }

        let mut opaque: Vec<Batch> = vec![];
        let mut push = |device: &wgpu::Device, mesh: &Mesh, insts: &[Instance]| -> usize {
            let vb = device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: None, contents: bytemuck::cast_slice(&mesh.v), usage: wgpu::BufferUsages::VERTEX });
            let ib = device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: None, contents: bytemuck::cast_slice(&mesh.i), usage: wgpu::BufferUsages::INDEX });
            let inst = device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: None, contents: bytemuck::cast_slice(insts), usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST });
            opaque.push(Batch { vb, ib, index_count: mesh.i.len() as u32, inst, inst_count: insts.len() as u32, tris_per_inst: (mesh.i.len() / 3) as u32 });
            opaque.len() - 1
        };
        // trees: the same three primitives as the Three spike, one batch each
        let cone = Mesh::cone(0.95, 3.4, 6, Vec3::new(0.0, 0.0, 0.0), 0.0, 1.0); let ball = Mesh::sphere(1.25, 6, 5, Vec3::new(0.0, 2.0, 0.0)); let trunk = Mesh::cylinder(0.18, 0.26, 1.6, 5, Vec3::ZERO);
        let tree_inst = |list: &[[f32; 4]], conifer: bool| -> Vec<Instance> { list.iter().filter(|p| (p[2] > tr.conifer_above || p[3] > tr.conifer_slope) == conifer).map(|p| { let s = if conifer { 0.75 + hash(p[0], p[1]) * 0.5 } else { 0.7 + hash(p[1], p[0]) * 0.5 }; Instance { model: model(Vec3::new(p[0], h_lerp(p[0], p[1]) * ys - 0.1, p[1]), hash(p[0] * 2.0, p[1]) * 6.28, s), color: hex(if conifer { &pal.conifer } else { &pal.broadleaf }) } }).collect() };
        let trunk_inst = |list: &[[f32; 4]]| -> Vec<Instance> { list.iter().map(|p| Instance { model: model(Vec3::new(p[0], h_lerp(p[0], p[1]) * ys - 0.1, p[1]), 0.0, 0.8 + hash(p[0], p[1]) * 0.4), color: hex(&pal.trunk) }).collect() };
        let b_con = push(&device, &cone, &tree_inst(&all_trees, true)); let b_bro = push(&device, &ball, &tree_inst(&all_trees, false)); let b_trk = push(&device, &trunk, &trunk_inst(&all_trees));
        let trees = all_trees.len() as u32;
        // houses
        let house_box = Mesh::boxed(1.4, 0.9, 1.1, Vec3::new(0.0, 0.45, 0.0)); let house_roof = Mesh::cone(1.05, 0.8, 4, Vec3::new(0.0, 1.3, 0.0), std::f32::consts::FRAC_PI_4, 0.8);
        let (mut walls, mut roofs, mut houses) = (vec![], vec![], 0u32);
        for pl in spec.places.iter().filter(|p| p.village > 0) { let (cx, cz) = to_xz(pl.lon, pl.lat); let (mut placed, mut k) = (0, 0); while placed < pl.village && k < 200 { k += 1; let a = hash((pl.seed + k) as f32, 3.0) * 6.28; let rr = 1.5 + hash(k as f32, pl.seed as f32) * 7.0; let x = cx + a.cos() * rr; let z = cz + a.sin() * rr * 0.8; let e = h_lerp(x, z); if e < 4.0 || e > 90.0 { continue } let m = model(Vec3::new(x, e * ys, z), hash(k as f32, 9.0) * 6.28, 0.9 + hash(5.0, k as f32) * 0.3); walls.push(Instance { model: m, color: hex(&pal.wall) }); roofs.push(Instance { model: m, color: hex(if k % 3 == 0 { &pal.thatch } else { &pal.roof }) }); placed += 1; houses += 1 } }
        push(&device, &house_box, &walls); push(&device, &house_roof, &roofs);
        // ships: parts as box/cone/cylinder instances under one base transform; ship2 is rebuilt by the playhead
        let part_box = Mesh::boxed(1.0, 1.0, 1.0, Vec3::ZERO); let part_cone = Mesh::cone(1.0, 1.0, 4, Vec3::ZERO, std::f32::consts::FRAC_PI_4, 0.75); let part_cyl = Mesh::cylinder(0.1, 0.14, 7.0, 6, Vec3::new(0.0, -3.5, 0.0));
        let ship_parts = |base: Mat4| -> (Vec<Instance>, Vec<Instance>, Vec<Instance>) {
            let bx = |t: Vec3, s: Vec3, ry: f32, col: &str| Instance { model: model_m(base * Mat4::from_scale_rotation_translation(Vec3::ONE, Quat::from_rotation_y(ry), t) * Mat4::from_scale(s)), color: hex(col) };
            let boxes = vec![bx(Vec3::new(0.0, 0.4, 0.0), Vec3::new(7.0, 1.3, 2.4), 0.0, &pal.hull), bx(Vec3::new(0.0, 1.25, 0.0), Vec3::new(5.6, 0.5, 2.0), 0.0, &pal.deck), bx(Vec3::new(-1.2, 2.05, 0.0), Vec3::new(2.2, 1.2, 1.6), 0.0, &pal.wall),
                bx(Vec3::new(1.9 + 0.1, 5.2, 0.0), Vec3::new(0.08, 3.6, 3.2), 0.0, &pal.sail), bx(Vec3::new(-0.2 + 0.1, 5.2, 0.0), Vec3::new(0.08, 3.6, 3.2), 0.0, &pal.sail), bx(Vec3::new(2.0, 8.4, 0.0), Vec3::new(0.05, 0.8, 1.4), 0.0, &pal.flag)];
            let cones = vec![Instance { model: model_m(base * Mat4::from_translation(Vec3::new(-1.2, 2.65, 0.0)) * Mat4::from_scale(Vec3::new(1.5, 0.7, 1.5))), color: hex(&pal.roof) }];
            let cyls = [1.9f32, -0.2].iter().map(|&mx| Instance { model: model_m(base * Mat4::from_translation(Vec3::new(mx, 4.5, 0.0))), color: [0.23, 0.15, 0.09, 1.0] }).collect();
            (boxes, cones, cyls) };
        let ship_base = |s: &Ship| { let (x, z) = to_xz(s.lon, s.lat); Mat4::from_scale_rotation_translation(Vec3::splat(s.scale), Quat::from_rotation_y(s.heading), Vec3::new(x, 0.35, z)) };
        let ship2_base = ship_base(&spec.ships[0]);
        let (mut sb, mut sc2, mut scy) = (vec![], vec![], vec![]);
        for s in &spec.ships { let (b, c, y) = ship_parts(ship_base(s)); sb.extend(b); sc2.extend(c); scy.extend(y) }
        // route as dashed boxes along a Catmull-Rom spline
        let route: Vec<Vec3> = spec.route.iter().map(|p| { let (x, z) = to_xz(p.lon, p.lat); Vec3::new(x, 0.5, z) }).collect();
        let n_d = 34; for i in 0..n_d { let t = (i as f32 + 0.5) / n_d as f32; let p = spline(&route, t); let tg = (spline(&route, (t + 0.01).min(1.0)) - p).normalize_or_zero(); sb.push(Instance { model: model_m(Mat4::from_scale_rotation_translation(Vec3::ONE, Quat::from_rotation_y((-tg.z).atan2(tg.x)), p) * Mat4::from_scale(Vec3::new(2.6, 0.12, 0.9))), color: hex(&pal.route) }) }
        let b_box = push(&device, &part_box, &sb); let b_cone = push(&device, &part_cone, &sc2); let b_cyl = push(&device, &part_cyl, &scy);
        let ship2 = { let (b, c, y) = ship_parts(Mat4::IDENTITY); let mut v = vec![]; for (i, inst) in b.iter().enumerate() { v.push((b_box, i, Mat4::from_cols_array_2d(&inst.model))) } for (i, inst) in c.iter().enumerate() { v.push((b_cone, i, Mat4::from_cols_array_2d(&inst.model))) } for (i, inst) in y.iter().enumerate() { v.push((b_cyl, i, Mat4::from_cols_array_2d(&inst.model))) } v };
        let ship2_instances = vec![sb.clone(), sc2.clone(), scy.clone()];
        for b in &opaque { triangles += b.tris_per_inst * b.inst_count }

        // water: a translucent sheet over an opaque sea floor, both far larger than the terrain slab
        // flat quads, not boxes: a second face a few centimetres away z-fights at the horizon
        let mut sheet = Mesh::new(); let (sx, sz) = ((wu + 9000.0) / 2.0, (hu + 9000.0) / 2.0); sheet.quad(Vec3::new(-sx, 0.0, sz), Vec3::new(sx, 0.0, sz), Vec3::new(sx, 0.0, -sz), Vec3::new(-sx, 0.0, -sz));
        let mut water = vec![];
        let wc = hex(&spec.water.color);
        for (y, col, _blend) in [(-0.6f32, [0.09, 0.27, 0.37, 1.0], false), (0.3, [wc[0], wc[1], wc[2], spec.water.opacity], true)] {
            let vb = device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: None, contents: bytemuck::cast_slice(&sheet.v), usage: wgpu::BufferUsages::VERTEX });
            let ib = device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: None, contents: bytemuck::cast_slice(&sheet.i), usage: wgpu::BufferUsages::INDEX });
            let inst = device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: None, contents: bytemuck::bytes_of(&Instance { model: model(Vec3::new(0.0, y, 0.0), 0.0, 1.0), color: col }), usage: wgpu::BufferUsages::VERTEX });
            water.push(Batch { vb, ib, index_count: sheet.i.len() as u32, inst, inst_count: 1, tris_per_inst: 2 });
        }

        let (tx, tz) = to_xz(spec.camera.target.lon, spec.camera.target.lat);
        let mut p = Probe { device, queue, surface, config, depth, pipe_terrain, pipe_inst, pipe_blend, uniforms, ubuf, bg0, bg_tex, terrain_vb, terrain_ib, terrain_indices: ti.len() as u32, opaque, water, ship2, ship2_base, ship2_instances, route, target: Vec3::new(tx, 0.0, tz), offset: Vec3::new(spec.camera.offset.x, spec.camera.offset.y, spec.camera.offset.z), fov: spec.camera.fov, orbit: 0.0, view_proj: Mat4::IDENTITY, draw_calls: 0, triangles, trees, houses, all_trees, tree_batches: (b_con, b_bro, b_trk), heights, cols, rows, u, ys, meta, palette: spec.palette, trees_rule: spec.trees };
        p.place_camera();
        Ok(p)
    }

    pub fn resize(&mut self, w: u32, h: u32) { if w == 0 || h == 0 { return } self.config.width = w; self.config.height = h; self.surface.configure(&self.device, &self.config); self.depth = make_depth(&self.device, w, h); self.place_camera() }
    pub fn orbit(&mut self, t: f32) { self.orbit = t; self.place_camera() }
    pub fn playhead(&mut self, t: f32) {
        let base = if t <= 0.0 { self.ship2_base } else { let u = 0.6 + 0.4 * t.min(1.0); let p = spline(&self.route, u); let tg = (spline(&self.route, (u + 0.01).min(1.0)) - p).normalize_or_zero(); Mat4::from_scale_rotation_translation(Vec3::splat(self.ship2_base.to_scale_rotation_translation().0.x), Quat::from_rotation_y((-tg.z).atan2(tg.x)), Vec3::new(p.x, 0.35, p.z)) };
        for &(batch, i, local) in &self.ship2 { let which = if batch == self.ship2[0].0 { 0 } else if batch == self.ship2[6].0 { 1 } else { 2 }; let inst = &mut self.ship2_instances[which][i]; inst.model = model_m(base * local); self.queue.write_buffer(&self.opaque[batch].inst, (i * std::mem::size_of::<Instance>()) as u64, bytemuck::bytes_of(inst)) }
    }
    /// phone: half the vegetation (shadows are not implemented in this probe, so nothing else changes)
    pub fn set_quality(&mut self, phone: bool) -> u32 {
        let list: Vec<[f32; 4]> = if phone { self.all_trees.iter().step_by(2).cloned().collect() } else { self.all_trees.clone() };
        let tr = &self.trees_rule; let pal = &self.palette; let (cols, rows, u, ys) = (self.cols, self.rows, self.u, self.ys); let heights = &self.heights;
        let wu = cols as f32 * u; let hu = rows as f32 * u;
        let h_at = |c: isize, r: isize| heights[(r.clamp(0, rows as isize - 1) as usize) * cols + c.clamp(0, cols as isize - 1) as usize];
        let h_lerp = |x: f32, z: f32| -> f32 { let c = (x + wu / 2.0) / u; let r = (z + hu / 2.0) / u; let (c0, r0) = (c.floor(), r.floor()); let (fc, fr) = (c - c0, r - r0); let (c0, r0) = (c0 as isize, r0 as isize); (h_at(c0, r0) * (1.0 - fc) + h_at(c0 + 1, r0) * fc) * (1.0 - fr) + (h_at(c0, r0 + 1) * (1.0 - fc) + h_at(c0 + 1, r0 + 1) * fc) * fr };
        let con: Vec<Instance> = list.iter().filter(|p| p[2] > tr.conifer_above || p[3] > tr.conifer_slope).map(|p| Instance { model: model(Vec3::new(p[0], h_lerp(p[0], p[1]) * ys - 0.1, p[1]), hash(p[0] * 2.0, p[1]) * 6.28, 0.75 + hash(p[0], p[1]) * 0.5), color: hex(&pal.conifer) }).collect();
        let bro: Vec<Instance> = list.iter().filter(|p| !(p[2] > tr.conifer_above || p[3] > tr.conifer_slope)).map(|p| Instance { model: model(Vec3::new(p[0], h_lerp(p[0], p[1]) * ys - 0.1, p[1]), hash(p[0] * 2.0, p[1]) * 6.28, 0.7 + hash(p[1], p[0]) * 0.5), color: hex(&pal.broadleaf) }).collect();
        let trk: Vec<Instance> = list.iter().map(|p| Instance { model: model(Vec3::new(p[0], h_lerp(p[0], p[1]) * ys - 0.1, p[1]), 0.0, 0.8 + hash(p[0], p[1]) * 0.4), color: hex(&pal.trunk) }).collect();
        for (b, insts) in [(self.tree_batches.0, con), (self.tree_batches.1, bro), (self.tree_batches.2, trk)] { self.queue.write_buffer(&self.opaque[b].inst, 0, bytemuck::cast_slice(&insts)); self.opaque[b].inst_count = insts.len() as u32 }
        self.trees = list.len() as u32; self.triangles = self.terrain_indices / 3 + self.opaque.iter().map(|b| b.tris_per_inst * b.inst_count).sum::<u32>(); self.trees
    }
    pub fn render(&mut self) -> Result<(), JsValue> {
        let frame = self.surface.get_current_texture().map_err(|e| JsValue::from_str(&format!("{e:?}")))?;
        let view = frame.texture.create_view(&Default::default());
        let mut enc = self.device.create_command_encoder(&Default::default());
        let mut calls = 0;
        {
            let fc = self.uniforms.fog_color; let g = |c: f32| if fc[3] > 0.5 { c as f64 } else { (c as f64).powf(2.2) };
            let mut pass = enc.begin_render_pass(&wgpu::RenderPassDescriptor { label: None, color_attachments: &[Some(wgpu::RenderPassColorAttachment { view: &view, resolve_target: None, ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color { r: g(fc[0]), g: g(fc[1]), b: g(fc[2]), a: 1.0 }), store: wgpu::StoreOp::Store } })], depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment { view: &self.depth, depth_ops: Some(wgpu::Operations { load: wgpu::LoadOp::Clear(1.0), store: wgpu::StoreOp::Discard }), stencil_ops: None }), timestamp_writes: None, occlusion_query_set: None });
            pass.set_bind_group(0, &self.bg0, &[]); pass.set_bind_group(1, &self.bg_tex, &[]);
            pass.set_pipeline(&self.pipe_terrain); pass.set_vertex_buffer(0, self.terrain_vb.slice(..)); pass.set_index_buffer(self.terrain_ib.slice(..), wgpu::IndexFormat::Uint32); pass.draw_indexed(0..self.terrain_indices, 0, 0..1); calls += 1;
            pass.set_pipeline(&self.pipe_inst);
            for b in self.opaque.iter().chain(self.water.iter().take(1)) { if b.inst_count == 0 { continue } pass.set_vertex_buffer(0, b.vb.slice(..)); pass.set_vertex_buffer(1, b.inst.slice(..)); pass.set_index_buffer(b.ib.slice(..), wgpu::IndexFormat::Uint32); pass.draw_indexed(0..b.index_count, 0, 0..b.inst_count); calls += 1 }
            pass.set_pipeline(&self.pipe_blend);
            for b in self.water.iter().skip(1) { pass.set_vertex_buffer(0, b.vb.slice(..)); pass.set_vertex_buffer(1, b.inst.slice(..)); pass.set_index_buffer(b.ib.slice(..), wgpu::IndexFormat::Uint32); pass.draw_indexed(0..b.index_count, 0, 0..b.inst_count); calls += 1 }
        }
        self.queue.submit([enc.finish()]); frame.present(); self.draw_calls = calls; Ok(())
    }
    pub fn draw_calls(&self) -> u32 { self.draw_calls }
    pub fn triangles(&self) -> u32 { self.triangles }
    pub fn trees(&self) -> u32 { self.trees }
    pub fn houses(&self) -> u32 { self.houses }
    /// world position (x, ground y, z) of a lon/lat, for label placement
    pub fn world(&self, lon: f64, lat: f64) -> Vec<f32> { let wu = self.cols as f32 * self.u; let hu = self.rows as f32 * self.u; let x = ((merc_x(lon) - self.meta.mx0) / (self.meta.mx1 - self.meta.mx0)) as f32 * wu - wu / 2.0; let z = ((merc_y(lat) - self.meta.my0) / (self.meta.my1 - self.meta.my0)) as f32 * hu - hu / 2.0; let c = ((x + wu / 2.0) / self.u) as usize; let r = ((z + hu / 2.0) / self.u) as usize; let e = self.heights[r.min(self.rows - 1) * self.cols + c.min(self.cols - 1)]; vec![x, e.max(0.0) * self.ys, z] }
    /// normalized device coordinates of a world point
    pub fn project(&self, x: f32, y: f32, z: f32) -> Vec<f32> { let c = self.view_proj * glam::Vec4::new(x, y, z, 1.0); vec![c.x / c.w, c.y / c.w, c.z / c.w] }

    fn place_camera(&mut self) {
        let a = self.orbit * std::f32::consts::TAU; let (c, s) = (a.cos(), a.sin()); let o = self.offset;
        let eye = Vec3::new(self.target.x + o.x * c - o.z * s, self.target.y + o.y, self.target.z + o.x * s + o.z * c);
        let aspect = self.config.width as f32 / self.config.height as f32;
        self.view_proj = Mat4::perspective_rh(self.fov.to_radians(), aspect, 4.0, 9000.0) * Mat4::look_at_rh(eye, self.target, Vec3::Y);
        self.uniforms.view_proj = self.view_proj.to_cols_array_2d(); self.uniforms.cam_pos = [eye.x, eye.y, eye.z, 1.0];
        self.queue.write_buffer(&self.ubuf, 0, bytemuck::bytes_of(&self.uniforms));
    }
}

fn make_depth(device: &wgpu::Device, w: u32, h: u32) -> wgpu::TextureView { device.create_texture(&wgpu::TextureDescriptor { label: None, size: wgpu::Extent3d { width: w, height: h, depth_or_array_layers: 1 }, mip_level_count: 1, sample_count: 1, dimension: wgpu::TextureDimension::D2, format: wgpu::TextureFormat::Depth24Plus, usage: wgpu::TextureUsages::RENDER_ATTACHMENT, view_formats: &[] }).create_view(&Default::default()) }

// Centripetal-free uniform Catmull-Rom over the route points, t in [0,1]
fn spline(p: &[Vec3], t: f32) -> Vec3 {
    let n = p.len() - 1; let s = t.clamp(0.0, 0.9999) * n as f32; let i = s.floor() as usize; let f = s - i as f32;
    let g = |k: isize| p[k.clamp(0, n as isize) as usize];
    let (p0, p1, p2, p3) = (g(i as isize - 1), g(i as isize), g(i as isize + 1), g(i as isize + 2));
    0.5 * ((2.0 * p1) + (-p0 + p2) * f + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * f * f + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * f * f * f)
}
