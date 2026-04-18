/**
 * CliConfig Service
 *
 * Parses CLI arguments into a typed configuration.
 * No dependencies (Layer<CliConfig, never, never>).
 */

import { Effect, Context, Layer, Data } from "effect"

export interface CliConfigShape {
  readonly inputPath: string
  readonly outputPath: string
  readonly format: string
  readonly debug: boolean
  readonly decimateTarget: number
  readonly upAxis: "Y" | "Z"
  readonly metersPerUnit: number
}

export class CliConfig extends Context.Tag("CliConfig")<
  CliConfig,
  CliConfigShape
>() {}

export class CliConfigError extends Data.TaggedError("CliConfigError")<{
  readonly message: string
}> {}

const SUPPORTED_EXTENSIONS = [".glb", ".gltf", ".obj", ".fbx", ".stl", ".ply"]

const HELP_TEXT = `
webusd - Convert 3D models to USDZ format

Usage:
  webusd <input> [options]

Arguments:
  input                    Path to the input file (.glb, .gltf, .obj, .fbx, .stl, .ply)

Options:
  -o, --output <path>      Output file path (default: <input>.usdz)
  -d, --debug              Enable debug mode with intermediate files
  --decimate <n>           Target face count for mesh decimation (PLY only, 0 = off)
  --up-axis <Y|Z>          Up axis (default: Y)
  --meters-per-unit <n>    Scene scale (default: 1)
  -h, --help               Show this help message
  -v, --version            Show version

Supported Formats:
  GLB, GLTF, OBJ, FBX, STL, PLY

Examples:
  webusd model.glb
  webusd model.glb -o output.usdz -d
  webusd scan.ply --decimate 500000
  webusd ./stl-folder/
`.trim()

function parseArgs(argv: ReadonlyArray<string>): Effect.Effect<CliConfigShape, CliConfigError> {
  return Effect.gen(function* () {
    const args = argv.slice(2)

    if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
      return yield* Effect.fail(new CliConfigError({ message: HELP_TEXT }))
    }

    if (args.includes("-v") || args.includes("--version")) {
      return yield* Effect.fail(new CliConfigError({ message: "webusd v1.0.0" }))
    }

    let inputPath = ""
    let outputPath = ""
    let debug = false
    let decimateTarget = 0
    let upAxis: "Y" | "Z" = "Y"
    let metersPerUnit = 1

    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!
      switch (arg) {
        case "-o":
        case "--output":
          outputPath = args[++i] ?? ""
          if (!outputPath) {
            return yield* Effect.fail(new CliConfigError({ message: "Missing value for --output" }))
          }
          break
        case "-d":
        case "--debug":
          debug = true
          break
        case "--decimate": {
          const val = args[++i]
          const n = Number(val)
          if (!val || isNaN(n) || n < 0) {
            return yield* Effect.fail(new CliConfigError({ message: "Invalid value for --decimate (must be >= 0)" }))
          }
          decimateTarget = Math.floor(n)
          break
        }
        case "--up-axis": {
          const val = args[++i]
          if (val !== "Y" && val !== "Z") {
            return yield* Effect.fail(new CliConfigError({ message: "Invalid value for --up-axis (must be Y or Z)" }))
          }
          upAxis = val
          break
        }
        case "--meters-per-unit": {
          const val = args[++i]
          const n = Number(val)
          if (!val || isNaN(n) || n <= 0) {
            return yield* Effect.fail(new CliConfigError({ message: "Invalid value for --meters-per-unit (must be > 0)" }))
          }
          metersPerUnit = n
          break
        }
        default:
          if (arg.startsWith("-")) {
            return yield* Effect.fail(new CliConfigError({ message: `Unknown option: ${arg}` }))
          }
          inputPath = arg
      }
    }

    if (!inputPath) {
      return yield* Effect.fail(new CliConfigError({ message: "No input file specified. Run webusd --help for usage." }))
    }

    const ext = inputPath.toLowerCase().slice(inputPath.lastIndexOf("."))
    const isDirectory = !ext || !SUPPORTED_EXTENSIONS.includes(ext)

    // For directories (STL batch mode) or files, validate extension
    if (!isDirectory && !SUPPORTED_EXTENSIONS.includes(ext)) {
      return yield* Effect.fail(new CliConfigError({
        message: `Unsupported format: ${ext}\nSupported: ${SUPPORTED_EXTENSIONS.join(", ")}`
      }))
    }

    const format = isDirectory ? ".stl" : ext

    if (!outputPath) {
      const base = inputPath.replace(/\.[^.]+$/, "")
      outputPath = `${base}.usdz`
    }

    return {
      inputPath,
      outputPath,
      format,
      debug,
      decimateTarget,
      upAxis,
      metersPerUnit,
    }
  })
}

export const CliConfigLive = Layer.effect(
  CliConfig,
  parseArgs(process.argv)
)
