/**
 * Converter Service
 *
 * Orchestrates 3D model conversion to USDZ.
 * Depends on CliConfig and CliLogger (Layer<Converter, never, CliConfig | CliLogger>).
 */

import { Effect, Context, Layer, Data } from "effect"
import { CliConfig } from "./CliConfig"
import { CliLogger } from "./CliLogger"
import { defineConfig, convertPlyToUsdz } from "../../index"

export class ConversionError extends Data.TaggedError("ConversionError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

export interface ConverterShape {
  readonly run: Effect.Effect<string, ConversionError>
}

export class Converter extends Context.Tag("Converter")<
  Converter,
  ConverterShape
>() {}

export const ConverterLive: Layer.Layer<Converter, never, CliConfig | CliLogger> = Layer.effect(
  Converter,
  Effect.gen(function* () {
    const config = yield* CliConfig
    const logger = yield* CliLogger

    return {
      run: Effect.gen(function* () {
        yield* logger.info(`Input:  ${config.inputPath}`)
        yield* logger.info(`Output: ${config.outputPath}`)
        yield* logger.info(`Format: ${config.format}`)
        yield* logger.debug(`Debug mode enabled`)
        if (config.decimateTarget > 0) {
          yield* logger.info(`Decimation target: ${config.decimateTarget} faces`)
        }

        const startTime = Date.now()

        // Read input file
        const fs = yield* Effect.try({
          try: () => require("fs") as typeof import("fs"),
          catch: (e) => new ConversionError({ message: "Failed to load fs module", cause: e }),
        })

        const path = yield* Effect.try({
          try: () => require("path") as typeof import("path"),
          catch: (e) => new ConversionError({ message: "Failed to load path module", cause: e }),
        })

        const resolvedInput = path.resolve(config.inputPath)
        const resolvedOutput = path.resolve(config.outputPath)

        // Check if input exists
        const inputExists = yield* Effect.try({
          try: () => fs.existsSync(resolvedInput),
          catch: (e) => new ConversionError({ message: `Cannot access input: ${resolvedInput}`, cause: e }),
        })

        if (!inputExists) {
          return yield* Effect.fail(new ConversionError({
            message: `Input file not found: ${resolvedInput}`
          }))
        }

        // Check if input is a directory (STL batch mode)
        const stat = yield* Effect.try({
          try: () => fs.statSync(resolvedInput),
          catch: (e) => new ConversionError({ message: `Cannot stat input: ${resolvedInput}`, cause: e }),
        })

        yield* logger.info(`Converting...`)

        if (stat.isDirectory()) {
          // STL batch mode
          const usd = defineConfig({
            debug: config.debug,
            ...(config.debug ? { debugOutputDir: path.dirname(resolvedOutput) } : {}),
            upAxis: config.upAxis,
            metersPerUnit: config.metersPerUnit,
          })

          const result = yield* Effect.tryPromise({
            try: () => usd.convert(resolvedInput),
            catch: (e) => new ConversionError({
              message: `Conversion failed for directory: ${resolvedInput}`,
              cause: e,
            }),
          })

          // Batch mode returns multiple results handled by the framework
          if (result instanceof Blob) {
            const buffer = yield* Effect.tryPromise({
              try: () => result.arrayBuffer(),
              catch: (e) => new ConversionError({ message: "Failed to read conversion result", cause: e }),
            })
            yield* Effect.try({
              try: () => fs.writeFileSync(resolvedOutput, Buffer.from(buffer)),
              catch: (e) => new ConversionError({ message: `Failed to write output: ${resolvedOutput}`, cause: e }),
            })
          }
        } else if (config.format === ".ply") {
          // PLY uses its own converter directly
          const inputBuffer = yield* Effect.try({
            try: () => {
              const buf = fs.readFileSync(resolvedInput)
              return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
            },
            catch: (e) => new ConversionError({ message: `Failed to read input: ${resolvedInput}`, cause: e }),
          })

          const result = yield* Effect.tryPromise({
            try: () => convertPlyToUsdz(inputBuffer, {
              decimateTarget: config.decimateTarget,
              debug: config.debug,
              ...(config.debug ? { debugOutputDir: path.dirname(resolvedOutput) } : {}),
              upAxis: config.upAxis,
              metersPerUnit: config.metersPerUnit,
            }),
            catch: (e) => new ConversionError({
              message: `PLY conversion failed: ${resolvedInput}`,
              cause: e,
            }),
          })

          const buffer = yield* Effect.tryPromise({
            try: () => result.arrayBuffer(),
            catch: (e) => new ConversionError({ message: "Failed to read PLY conversion result", cause: e }),
          })

          yield* Effect.try({
            try: () => fs.writeFileSync(resolvedOutput, Buffer.from(buffer)),
            catch: (e) => new ConversionError({ message: `Failed to write output: ${resolvedOutput}`, cause: e }),
          })
        } else {
          // GLB, GLTF, OBJ, FBX, STL single file
          const usd = defineConfig({
            debug: config.debug,
            ...(config.debug ? { debugOutputDir: path.dirname(resolvedOutput) } : {}),
            upAxis: config.upAxis,
            metersPerUnit: config.metersPerUnit,
          })

          const result = yield* Effect.tryPromise({
            try: () => usd.convert(resolvedInput),
            catch: (e) => new ConversionError({
              message: `Conversion failed: ${resolvedInput}`,
              cause: e,
            }),
          })

          const buffer = yield* Effect.tryPromise({
            try: () => result.arrayBuffer(),
            catch: (e) => new ConversionError({ message: "Failed to read conversion result", cause: e }),
          })

          yield* Effect.try({
            try: () => {
              const dir = path.dirname(resolvedOutput)
              if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true })
              }
              fs.writeFileSync(resolvedOutput, Buffer.from(buffer))
            },
            catch: (e) => new ConversionError({ message: `Failed to write output: ${resolvedOutput}`, cause: e }),
          })
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        const outputStat = yield* Effect.try({
          try: () => fs.statSync(resolvedOutput),
          catch: (e) => new ConversionError({ message: `Cannot stat output: ${resolvedOutput}`, cause: e }),
        })
        const sizeMb = (outputStat.size / 1024 / 1024).toFixed(2)

        yield* logger.success(`Done in ${elapsed}s`)
        yield* logger.success(`Output: ${resolvedOutput} (${sizeMb} MB)`)

        return resolvedOutput
      }),
    }
  })
)
