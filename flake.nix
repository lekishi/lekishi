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
        devShells.default = pkgs.mkShell {
          packages =
            (with pkgs; [
              pnpm

              # Elixir
              beam.packages.erlang_28.elixir_1_20
              beam.packages.erlang_28.rebar3
              beam28Packages.erlang

              # LSPs
              beamPackages.expert
              erlang-language-platform
              yaml-language-server
              vscode-json-languageserver

              # Website
              hugo
              pagefind
              go

              # Tools
              watchman
              docker-compose
              yamllint
              shfmt
              shellcheck
              git
              git-cliff
              jujutsu
              postgresql_18
            ])
            # These packages are Linux-only in nixpkgs. Keeping Chromium and
            # ChromeDriver from the same revision prevents Wallaby's browser
            # protocol from drifting when a host browser auto-updates.
            ++ pkgs.lib.optionals pkgs.stdenv.isLinux [
              pkgs.watchexec
              pkgs.chromium
              pkgs.chromedriver
            ];

          shellHook = ''
            export MIX_HOME="$PWD/.nix/mix"
            export HEX_HOME="$PWD/.nix/hex"
            export REBAR_CACHE_DIR="$PWD/.nix/rebar3"
            export ERL_AFLAGS="-kernel shell_history enabled"
            ${pkgs.lib.optionalString pkgs.stdenv.isLinux ''
              export CHROME_BIN="${pkgs.chromium}/bin/chromium"
              export CHROMEDRIVER_BIN="${pkgs.chromedriver}/bin/chromedriver"
            ''}

            mkdir -p "$MIX_HOME" "$HEX_HOME" "$REBAR_CACHE_DIR"
          '';

        };
      }
    );
}
