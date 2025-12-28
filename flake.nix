{
  description = "usesend development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = [ pkgs.devenv ];

          shellHook = ''
            echo "Run 'devenv shell' to enter the full dev environment"
            echo "Run 'devenv up' to start services (postgres, redis, minio)"
          '';
        };
      }
    );
}
