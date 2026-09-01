import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const sourceMigrations = resolve(root, "src/migrations");
const runtimeMigrations = resolve(dist, "migrations");
const sourceIcons = resolve(root, "public/icons");
const runtimeIcons = resolve(dist, "public/icons");
const compiler = resolve(root, "node_modules/typescript/bin/tsc");

// A build is reproducible from a clean output directory. In particular, a
// removed source module cannot survive as a stale runtime file.
rmSync(dist, { recursive: true, force: true });
execFileSync(process.execPath, [compiler, "-p", resolve(root, "tsconfig.build.json")], {
  cwd: root,
  stdio: "inherit",
});

mkdirSync(runtimeMigrations, { recursive: true });
for (const name of readdirSync(sourceMigrations).filter((entry) => entry.endsWith(".sql"))) {
  const source = resolve(sourceMigrations, name);
  const target = resolve(runtimeMigrations, name);
  copyFileSync(source, target);
  if (!readFileSync(source).equals(readFileSync(target))) {
    throw new Error(`runtime migration copy is not byte-identical: ${name}`);
  }
}

mkdirSync(runtimeIcons, { recursive: true });
for (const name of readdirSync(sourceIcons).filter((entry) => /\.(?:svg|png)$/.test(entry))) {
  const source = resolve(sourceIcons, name);
  const target = resolve(runtimeIcons, name);
  copyFileSync(source, target);
  if (!readFileSync(source).equals(readFileSync(target))) {
    throw new Error(`runtime icon copy is not byte-identical: ${name}`);
  }
}
