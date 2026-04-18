import { Data } from "effect"

export class CliConfigError extends Data.TaggedError("CliConfigError")<{
  readonly message: string
}> {}

export class ConversionError extends Data.TaggedError("ConversionError")<{
  readonly message: string
  readonly cause?: unknown
}> {}