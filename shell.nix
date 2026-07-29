{ pkgs ? import <nixpkgs> {} }:

let
  zine = pkgs.stdenv.mkDerivation {
    pname = "zine";
    version = "0.13.0";

    src = pkgs.fetchurl {
      url = "https://github.com/kristoff-it/zine/releases/download/v0.13.0/x86_64-linux-musl.tar.xz";
      sha256 = "c250e029d978901b0c9a38eab0a860ef9db875bf686fe0f0abf61f180c280dba";
    };

    unpackPhase = ''tar xf $src'';

    installPhase = ''
      mkdir -p $out/bin
      cp zine $out/bin/zine
      chmod +x $out/bin/zine
    '';
  };
in
pkgs.mkShell {
  buildInputs = [
    pkgs.nodejs
    zine
  ];

  shellHook = ''
    echo "notizine dev - Zine $(zine --version) ready"
  '';
}
