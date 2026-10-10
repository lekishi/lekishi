#!/usr/bin/env sh
# Builds the Rust/wgpu probe to wasm and generates the JS glue in pkg/.
# Needs: rustup target add wasm32-unknown-unknown; cargo install wasm-bindgen-cli --version 0.2.100
set -eu
cd "$(dirname "$0")"
cargo build --release --target wasm32-unknown-unknown
wasm-bindgen --target web --out-dir pkg --no-typescript target/wasm32-unknown-unknown/release/lekishi_wgpu_probe.wasm
ls -la pkg/
