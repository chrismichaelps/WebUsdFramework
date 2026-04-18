/**
 * CLI Entry Point
 *
 * Composes all service layers and runs the conversion program.
 */

import { Effect, Layer } from "effect"
import { CliConfigLive, CliConfigError } from "./services/CliConfig"
import { CliLoggerLive } from "./services/CliLogger"
import { Converter, ConverterLive, ConversionError } from "./services/Converter"

const AppConfigLive = Layer.merge(CliConfigLive, CliLoggerLive)

const MainLive = ConverterLive.pipe(
  Layer.provide(AppConfigLive),
  Layer.provide(CliConfigLive),
)

const program = Effect.gen(function* () {
  const converter = yield* Converter
  yield* converter.run
})

const runnable = program.pipe(
  Effect.provide(MainLive),
  Effect.catchTag("CliConfigError", (e: CliConfigError) =>
    Effect.sync(() => {
      console.log(e.message)
      process.exit(e.message.includes("Usage:") || e.message.startsWith("webusd v") ? 0 : 1)
    }),
  ),
  Effect.catchTag("ConversionError", (e: ConversionError) =>
    Effect.sync(() => {
      console.error(`Error: ${e.message}`)
      if (e.cause) {
        console.error(`Cause: ${e.cause}`)
      }
      process.exit(1)
    }),
  ),
  Effect.catchAll((e) =>
    Effect.sync(() => {
      console.error("Unexpected error:", e)
      process.exit(1)
    }),
  ),
)

Effect.runPromise(runnable).catch((e) => {
  console.error("Fatal:", e)
  process.exit(1)
})
