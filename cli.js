#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import fs from "node:fs";
import { transpileFile } from "jayesstocpp";

const packageJson = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf8"));

const usage = `Usage: tocpp <entry-file> [output-dir] [options]

Transpile a Jayess entry file into a generated C++ project.

Arguments:
  entry-file                 Jayess source file to transpile
  output-dir                 Directory for generated C++ output (default: ./build)

Options:
  -o, --out <dir>            Directory for generated C++ output
  --project-kind <kind>      Project kind: executable or shared-library
  --library-name <name>      Shared library name when using --project-kind shared-library
  --runtime-fragments <mode> Runtime fragments: auto or all
  -h, --help                 Show this help
  -v, --version              Show package version
`;

function readPackageVersion() {
  return packageJson.version;
}

function fail(message) {
  console.error(`tocpp: ${message}`);
  console.error("Run `tocpp --help` for usage.");
  process.exitCode = 1;
}

function takeValue(args, index, optionName) {
  const value = args[index + 1];
  if (value == null || value.startsWith("-")) {
    fail(`${optionName} requires a value`);
    return [null, index];
  }
  return [value, index + 1];
}

function parseArgs(args) {
  const positionals = [];
  const options = {
    outDir: null,
    projectKind: null,
    libraryName: null,
    runtimeFragments: null
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--") {
      positionals.push(...args.slice(index + 1));
      break;
    }
    if (arg === "-h" || arg === "--help") {
      return { command: "help" };
    }
    if (arg === "-v" || arg === "--version") {
      return { command: "version" };
    }
    if (arg === "-o" || arg === "--out") {
      const [value, nextIndex] = takeValue(args, index, arg);
      if (process.exitCode) {
        return { command: "invalid" };
      }
      options.outDir = value;
      index = nextIndex;
      continue;
    }
    if (arg.startsWith("--out=")) {
      options.outDir = arg.slice("--out=".length);
      continue;
    }
    if (arg === "--project-kind") {
      const [value, nextIndex] = takeValue(args, index, arg);
      if (process.exitCode) {
        return { command: "invalid" };
      }
      options.projectKind = value;
      index = nextIndex;
      continue;
    }
    if (arg.startsWith("--project-kind=")) {
      options.projectKind = arg.slice("--project-kind=".length);
      continue;
    }
    if (arg === "--library-name") {
      const [value, nextIndex] = takeValue(args, index, arg);
      if (process.exitCode) {
        return { command: "invalid" };
      }
      options.libraryName = value;
      index = nextIndex;
      continue;
    }
    if (arg.startsWith("--library-name=")) {
      options.libraryName = arg.slice("--library-name=".length);
      continue;
    }
    if (arg === "--runtime-fragments") {
      const [value, nextIndex] = takeValue(args, index, arg);
      if (process.exitCode) {
        return { command: "invalid" };
      }
      options.runtimeFragments = value;
      index = nextIndex;
      continue;
    }
    if (arg.startsWith("--runtime-fragments=")) {
      options.runtimeFragments = arg.slice("--runtime-fragments=".length);
      continue;
    }
    if (arg.startsWith("-")) {
      fail(`unknown option ${arg}`);
      return { command: "invalid" };
    }

    positionals.push(arg);
  }

  return { command: "transpile", positionals, options };
}

function normalizeOptions(parsedOptions) {
  const options = {};

  if (parsedOptions.projectKind != null) {
    if (parsedOptions.projectKind !== "executable" && parsedOptions.projectKind !== "shared-library") {
      fail("--project-kind must be executable or shared-library");
      return null;
    }
    if (parsedOptions.projectKind === "shared-library") {
      options.projectKind = "shared-library";
    }
  }

  if (parsedOptions.libraryName != null) {
    options.libraryName = parsedOptions.libraryName;
  }

  if (parsedOptions.runtimeFragments != null) {
    if (parsedOptions.runtimeFragments !== "auto" && parsedOptions.runtimeFragments !== "all") {
      fail("--runtime-fragments must be auto or all");
      return null;
    }
    if (parsedOptions.runtimeFragments === "all") {
      options.runtimeFragments = "all";
    }
  }

  return options;
}

function printDiagnostics(error) {
  if (!Array.isArray(error?.diagnostics)) {
    console.error(error?.stack ?? String(error));
    return;
  }

  for (const diagnostic of error.diagnostics) {
    const location = [diagnostic.filename, diagnostic.line, diagnostic.column].filter((part) => part != null).join(":");
    const code = diagnostic.code ? ` ${diagnostic.code}` : "";
    const prefix = location ? `${location}:` : "tocpp:";
    console.error(`${prefix}${code} ${diagnostic.message}`);
  }
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.command === "help") {
    console.log(usage.trimEnd());
    return;
  }
  if (parsed.command === "version") {
    console.log(readPackageVersion());
    return;
  }
  if (parsed.command === "invalid") {
    return;
  }

  if (parsed.positionals.length === 0) {
    fail("missing entry-file");
    return;
  }
  if (parsed.positionals.length > 2) {
    fail("too many positional arguments");
    return;
  }
  if (parsed.options.outDir != null && parsed.positionals.length === 2) {
    fail("output directory was provided both positionally and with --out");
    return;
  }

  const entryFilename = path.resolve(parsed.positionals[0]);
  const outDir = path.resolve(parsed.options.outDir ?? parsed.positionals[1] ?? "build");
  const transpileOptions = normalizeOptions(parsed.options);
  if (transpileOptions == null) {
    return;
  }

  try {
    const result = transpileFile(entryFilename, outDir, transpileOptions);
    console.log(`Generated ${result.files.length} files in ${result.targetDirname}`);
  } catch (error) {
    printDiagnostics(error);
    process.exitCode = 1;
  }
}

await main();
