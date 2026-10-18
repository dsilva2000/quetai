import assert from "node:assert/strict";
import { test } from "node:test";
import { directorioPersistente, resolverDirectorioDatos } from "./datos.ts";

test("el disco montado en /app/data es persistente y el árbol del repo no", () => {
  const mounts = [
    "overlay / overlay rw 0 0",
    "/dev/sdc /app/data ext4 rw 0 0",
  ].join("\n");
  assert.equal(directorioPersistente("/app/data", mounts), true);
  assert.equal(directorioPersistente("/app/data/quetai.db", mounts), true);
  assert.equal(directorioPersistente("/opt/render/project/src/data", mounts), false);
  assert.equal(directorioPersistente("/tmp/quetai", "overlay / overlay rw 0 0\n"), false);
  assert.equal(directorioPersistente("/opt/render/project/src/data", "/dev/root / ext4 rw 0 0\n"), false);
});

test("DATA_DIR manda sobre la carpeta data del proceso", () => {
  assert.equal(resolverDirectorioDatos({ DATA_DIR: "/app/data" }, "/opt/render/project/src"), "/app/data");
  assert.equal(resolverDirectorioDatos({}, "/opt/render/project/src"), "/opt/render/project/src/data");
});
