import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(repoRoot, "test", "fixtures", "press-enter.js");
const outputDir = path.join(repoRoot, "test", "output", "press-enter");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    ...options
  });

  assert.equal(
    result.status,
    0,
    [
      `Command failed: ${command} ${args.join(" ")}`,
      result.stdout,
      result.stderr
    ].filter(Boolean).join("\n")
  );

  return result;
}

function findCompiler() {
  if (process.env.CXX) {
    return process.env.CXX;
  }

  const candidates = process.platform === "win32" ? ["clang++.exe", "clang++"] : ["clang++", "g++"];
  for (const candidate of candidates) {
    const lookup = process.platform === "win32"
      ? spawnSync("where.exe", [candidate], { encoding: "utf8" })
      : spawnSync("command", ["-v", candidate], { encoding: "utf8", shell: true });

    if (lookup.status === 0) {
      return lookup.stdout.trim().split(/\r?\n/)[0];
    }
  }

  throw new Error("No C++ compiler found. Set CXX or install clang++/g++.");
}

test("tocpp transpiles and compiles a simple command-line program", () => {
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  run(process.execPath, ["cli.js", fixturePath, "--out", outputDir]);

  const buildHints = JSON.parse(fs.readFileSync(path.join(outputDir, "jayess_build_hints.json"), "utf8"));
  const mainSource = `#include <iostream>
#include <string>
#include "press_enter_js.hpp"

int main() {
  jayess_module_press_enter_js::jayess_module_init();
  jayess_module_press_enter_js::run({});
  std::string ignored;
  std::getline(std::cin, ignored);
  return 0;
}
`;
  fs.writeFileSync(path.join(outputDir, "main.cpp"), mainSource, "utf8");

  const compiler = findCompiler();
  const executable = path.join(outputDir, process.platform === "win32" ? "press-enter.exe" : "press-enter");
  const compileArgs = [
    "-std=c++17",
    ...buildHints.includeDirectories.map((directory) => `-I${directory}`),
    ...buildHints.sourceFiles,
    "main.cpp",
    "-o",
    executable
  ];

  run(compiler, compileArgs, { cwd: outputDir });

  const program = spawnSync(executable, [], {
    cwd: outputDir,
    input: os.EOL,
    encoding: "utf8"
  });

  assert.equal(
    program.status,
    0,
    [program.stdout, program.stderr].filter(Boolean).join("\n")
  );
  assert.match(program.stdout, /Press Enter to exit/);
});
