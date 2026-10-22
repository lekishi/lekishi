{
  description = "Lekishi - Historical map and exploration";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      ...
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        };
      in
      {
        # Node matches CI (`NODE_VERSION: 24`); Python paints the shipped tiles.
        devShells.default = pkgs.mkShell (
          {
          packages = with pkgs; [
            nodejs_24
            pnpm
            (python3.withPackages (ps: [ ps.numpy ps.pillow ]))
            # Keep Playwright's browser revision available to `pnpm verify`,
            # which checks that the committed raster brand assets are current.
            playwright-driver.browsers

            # Version control and repository hygiene.
            git
            jujutsu

            # Shell and data checks used by the repository scripts.
            shellcheck
            shfmt
            yamllint

            # Editors and language servers.
            vscode-json-languageserver
            yaml-language-server
          ]
          # Firefox's software WebGL needs an X display even when headless;
          # the browser checks run under `xvfb-run`.
          ++ pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [ xvfb-run ];

          # CI takes the browsers from here rather than `playwright install
          # --with-deps`, so it never waits on the Ubuntu apt mirror. The
          # nixpkgs revision must carry the same Playwright version as
          # `@playwright/test` in pnpm-lock.yaml, or Playwright looks for
          # browser revisions this path does not contain.
          PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
          PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";

          shellHook = ''
            echo "Lekishi: pnpm dev (5173) · pnpm build · pnpm verify"
          '';
        }
        // pkgs.lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux {
          # Nix's browsers find GL drivers under /run/opengl-driver on NixOS
          # only. Elsewhere (Ubuntu runners, orbs) WebKit aborts with "Could
          # not create EGL display" and Firefox, which dlopens libGL, has no
          # WebGL, so the globe never draws. Point both at glvnd and Mesa.
          __EGL_VENDOR_LIBRARY_DIRS = "${pkgs.mesa}/share/glvnd/egl_vendor.d";
          LD_LIBRARY_PATH = "${pkgs.libglvnd}/lib";
        });
      }
    );
}
