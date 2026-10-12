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
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_24
            pnpm
            (python3.withPackages (ps: [ ps.numpy ps.pillow ]))

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
          ];

          shellHook = ''
            echo "Lekishi: pnpm dev (5173) · pnpm build · pnpm verify"
          '';
        };
      }
    );
}
