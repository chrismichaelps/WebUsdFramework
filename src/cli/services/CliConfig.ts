import { Effect, Context, Layer } from "effect"
import { CliConfigError } from "../errors"
import { CLI_VERSION, SUPPORTED_EXTENSIONS, HELP_TEXT } from "../constants"

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

function parseArgs(argv: ReadonlyArray<string>): Effect.Effect<CliConfigShape, CliConfigError> {
  return Effect.gen(function* () {
    const args = argv.slice(2)

    if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
      return yield* Effect.fail(new CliConfigError({ message: HELP_TEXT }))
    }

    if (args.includes("-v") || args.includes("--version")) {
      return yield* Effect.fail(new CliConfigError({ message: `webusd ${CLI_VERSION}` }))
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
    const validExts = SUPPORTED_EXTENSIONS as readonly string[]
    const isDirectory = !ext || !validExts.includes(ext)

    if (!isDirectory && !validExts.includes(ext)) {
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