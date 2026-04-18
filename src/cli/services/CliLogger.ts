/**
 * CliLogger Service
 *
 * Structured console logging for the CLI.
 * Depends on CliConfig (Layer<CliLogger, never, CliConfig>).
 */

import { Effect, Context, Layer } from "effect"
import { CliConfig } from "./CliConfig"

export interface CliLoggerShape {
  readonly info: (message: string) => Effect.Effect<void>
  readonly success: (message: string) => Effect.Effect<void>
  readonly warn: (message: string) => Effect.Effect<void>
  readonly error: (message: string) => Effect.Effect<void>
  readonly debug: (message: string) => Effect.Effect<void>
}

export class CliLogger extends Context.Tag("CliLogger")<
  CliLogger,
  CliLoggerShape
>() {}

export const CliLoggerLive: Layer.Layer<CliLogger, never, CliConfig> = Layer.effect(
  CliLogger,
  Effect.gen(function* () {
    const config = yield* CliConfig

    const timestamp = () => {
      const d = new Date()
      return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`
    }

    return {
      info: (message: string) =>
        Effect.sync(() => {
          console.log(`[${timestamp()}] ${message}`)
        }),
      success: (message: string) =>
        Effect.sync(() => {
          console.log(`[${timestamp()}] ${message}`)
        }),
      warn: (message: string) =>
        Effect.sync(() => {
          console.warn(`[${timestamp()}] WARN ${message}`)
        }),
      error: (message: string) =>
        Effect.sync(() => {
          console.error(`[${timestamp()}] ERROR ${message}`)
        }),
      debug: (message: string) =>
        Effect.sync(() => {
          if (config.debug) {
            console.log(`[${timestamp()}] DEBUG ${message}`)
          }
        }),
    }
  })
)
