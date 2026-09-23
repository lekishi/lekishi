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
        # The site is a statically built SvelteKit project: Node and pnpm are the
        # whole toolchain. Node matches the version CI runs (`NODE_VERSION: 24`).
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_24
            pnpm

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
