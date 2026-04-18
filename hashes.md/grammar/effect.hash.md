---
Language: Effect TS
Version: 3.19.19
Fidelity: 100% (Physical Disk Reference + Full Documentation LLM)
State_ID:  BigInt(0x1)
LSP_Discovery_Root: "@root/node_modules/effect/package.json"
Grammar_Lock: "@root/hashes/grammar/effect.hash.md"
---

/** [Project].Grammar.Effect - Linguistic DNA anchor for Effect Ecosystem */

## [SDK_Discovery_Map]
/** === effect (Core Infrastructure) === */
/** @Ref: @root/node_modules/effect/dist/dts/Effect.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/Cause.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/Exit.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/Fiber.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/Layer.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/Context.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/Scope.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/Data.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/Brand.d.ts */

/** === effect (Control Flow & Scheduling) === */
/** @Ref: @root/node_modules/effect/dist/dts/Stream.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/Sink.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/STM.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/Schedule.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/Queue.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/Hub.d.ts */

/** === effect (Data Structures) === */
/** @Ref: @root/node_modules/effect/dist/dts/Chunk.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/HashMap.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/HashSet.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/Option.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/Either.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/List.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/BigDecimal.d.ts */

/** === effect (State Management) === */
/** @Ref: @root/node_modules/effect/dist/dts/Ref.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/SynchronizedRef.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/SubscriptionRef.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/FiberRef.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/Deferred.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/Semaphore.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/Latch.d.ts */

/** === effect (Utilities & Services) === */
/** @Ref: @root/node_modules/effect/dist/dts/Duration.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/DateTime.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/Clock.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/Random.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/Console.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/Config.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/ConfigProvider.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/Redacted.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/Cache.d.ts */

/** === effect (Observability) === */
/** @Ref: @root/node_modules/effect/dist/dts/Logger.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/LogLevel.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/Metric.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/Tracer.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/Supervisor.d.ts */

/** === effect (Runtime & Batching) === */
/** @Ref: @root/node_modules/effect/dist/dts/Runtime.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/ManagedRuntime.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/Request.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/RequestResolver.d.ts */

/** === effect (Traits) === */
/** @Ref: @root/node_modules/effect/dist/dts/Equal.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/Hash.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/Order.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/Equivalence.d.ts */

/** === effect (Testing) === */
/** @Ref: @root/node_modules/effect/dist/dts/TestClock.d.ts */
/** @Ref: @root/node_modules/effect/dist/dts/TestContext.d.ts */

/** === effect (Micro — Lightweight) === */
/** @Ref: @root/node_modules/effect/dist/dts/Micro.d.ts */

/** === effect (Pattern Matching) === */
/** @Ref: @root/node_modules/effect/dist/dts/Match.d.ts */

/** === @effect/schema & @effect/platform === */
/** @Ref: @root/node_modules/@effect/schema/dist/dts/Schema.d.ts */
/** @Ref: @root/node_modules/@effect/platform/dist/dts/HttpApi.d.ts */
/** @Ref: @root/node_modules/@effect/platform/dist/dts/HttpClient.d.ts */
/** @Ref: @root/node_modules/@effect/platform/dist/dts/FileSystem.d.ts */
/** @Ref: @root/node_modules/@effect/platform/dist/dts/Terminal.d.ts */
/** @Ref: @root/node_modules/@effect/platform/dist/dts/KeyValueStore.d.ts */
/** @Ref: @root/node_modules/@effect/platform/dist/dts/Command.d.ts */

## [SDK_Imports / Namespaces]
```ts
import { Effect, Layer, Context, Cause, Exit, Fiber, Chunk, HashMap, Option, Either, Schedule, Metric, Tracer, Schema, Data, Ref, Match, Redacted, Config, Brand, Cache, Duration, DateTime } from "effect"
import * as Stream from "effect/Stream"
import * as STM from "effect/STM"
import * as Sink from "effect/Sink"
import * as Micro from "effect/Micro"
```

## [Core_Primitives]
```ts
// Effect<A, E, R>: Lazy, multi-shot, interruptible computation.
// A = Success type, E = Expected error type, R = Required services.
// NOT eager like Promise. Can be re-run. Supports cooperative interruption.
interface Effect<out A, out E = never, out R = never> extends Pipeable {
  [Symbol.iterator](): EffectGenerator<Effect<A, E, R>>
}

// Cause<E>: Lossless error model capturing ALL failure information.
type Cause<E> = Empty | Fail<E> | Die | Interrupt | Sequential<E> | Parallel<E>
// Empty = no error. Fail<E> = expected. Die = defect (uncaught throw, Effect.die).
// Interrupt = fiber cancellation. Sequential/Parallel = composed failures.

// Layer<ROut, E, RIn>: Service construction blueprint with memoization.
interface Layer<in ROut, out E = never, out RIn = never> extends Pipeable {}

// Context.Tag: Unique service identifier. Tags are yieldable in Effect.gen.
// class MyService extends Context.Tag("MyService")<MyService, { readonly method: ... }>() {}

// Scope: Resource lifecycle boundary. Finalizers guaranteed to run on any exit.
interface Scope extends Pipeable {
  addFinalizer(finalizer: Effect<void>): Effect<void>
  close(exit: Exit<any, any>): Effect<void>
}

// Exit<A, E> = Success<A, E> | Failure<A, E>. Terminal computation result.
type Exit<A, E> = Failure<A, E> | Success<A, E>

// Fiber<A, E>: Lightweight virtual thread. Joinable, interruptible, composable.
interface Fiber<out A, out E = never> extends Pipeable {
  readonly id: FiberId
  await: Effect<Exit<A, E>>
  interrupt: Effect<Exit<A, E>>
}

// Data module: Structural equality + hashing for plain objects.
// Data.TaggedError("Tag")<Fields> — yieldable tagged error (extends Error).
// Data.TaggedClass("Tag")<Fields> — tagged value class.
// Data.struct({...}) — plain structural equality object.
// Data.Class — base for custom classes with auto Equal+Hash.
// Data.case() — factory for case classes.
// ALL Data types auto-implement Equal and Hash traits.

// Brand module: Nominal types via type branding.
// Brand.nominal<T>() — creates a constructor that brands values at compile-time.
// Brand.refined<T>(predicate, onFailure) — brand with runtime validation.
// Brand.all(...brands) — combine multiple brands.
// type UserId = number & Brand.Brand<"UserId"> — prevents structural aliasing.
```

## [Creating_Effects]
```ts
// Pure constructors:
function succeed<A>(value: A): Effect<A>              // Eager value, no computation.
function fail<E>(error: E): Effect<never, E>          // Expected error.
function die(defect: unknown): Effect<never>           // Unexpected defect (Cause.Die).

// Synchronous:
function sync<A>(thunk: () => A): Effect<A>           // Lazy synchronous. Catches nothing.
function try(thunk: () => A): Effect<A, UnknownException>  // Catches thrown exceptions.
function try(options: { try: () => A, catch: (e: unknown) => E }): Effect<A, E>  // Custom error mapping.

// Asynchronous:
function promise<A>(thunk: () => Promise<A>): Effect<A>  // Promise that NEVER rejects. Rejection = defect.
function tryPromise<A, E>(options: { try: () => Promise<A>, catch: (e: unknown) => E }): Effect<A, E>
function async<A, E>(register: (resume: (_: Effect<A, E>) => void) => void | Effect<void>): Effect<A, E>
// Effect.async supports cleanup: return an Effect from the register fn to run on interruption.

// From generators:
function gen<Eff extends EffectGen, A>(f: () => Generator<Eff, A>): Effect<A, ...>
// Effect.gen(function* () { const a = yield* someEffect; return a; })
// yield* works with Effect, Layer, Stream, STM, Option, Either, Context.Tag

// Special:
function sleep(duration: DurationInput): Effect<void>  // Suspend fiber for duration.
const never: Effect<never>                             // Never completes.
const void_: Effect<void>                              // Immediately succeeds with void.
function log(message: unknown): Effect<void>           // Structured log at Info level.

// Suspension:
function suspend<A, E, R>(thunk: () => Effect<A, E, R>): Effect<A, E, R>
// Defers Effect construction. Useful for recursive effects and stack safety.
```

## [Building_Pipelines]
```ts
// Mapping:
function map<A, E, R, B>(self: Effect<A, E, R>, f: (a: A) => B): Effect<B, E, R>
function flatMap<A, E, R, B, E2, R2>(self: Effect<A, E, R>, f: (a: A) => Effect<B, E2, R2>): Effect<B, E | E2, R | R2>
function andThen<A, E, R, B>(self: Effect<A, E, R>, f: B | ((a: A) => B) | Effect<B, ...>): Effect<B, ...>
// andThen: Unified map + flatMap. Accepts values, functions, or Effects.
function tap<A, E, R>(self: Effect<A, E, R>, f: (a: A) => Effect<any, ...>): Effect<A, ...>
// tap: Run side effect, return original value unchanged.
function as<A, E, R, B>(self: Effect<A, E, R>, value: B): Effect<B, E, R>
// as: Replace success value with a constant.

// Combining:
function all<T>(effects: T, options?: { concurrency?: Concurrency; mode?: "default" | "validate" | "either" }): Effect<...>
// mode "default" = fail-fast. "validate" = accumulate errors. "either" = return Either per effect.
function forEach<A, B, E, R>(items: Iterable<A>, f: (a: A) => Effect<B, E, R>, options?: { concurrency?: Concurrency }): Effect<Array<B>, E, R>
function mergeAll<A>(effects: Iterable<Effect<A, ...>>, zero: A, f: (a: A, b: A) => A, options?: { concurrency?: Concurrency }): Effect<A, ...>

// Piping:
// self.pipe(Effect.map(f), Effect.flatMap(g), Effect.tap(h))
// pipe(self, Effect.map(f), Effect.flatMap(g))
// Dual APIs: most functions support data-first f(data, ...args) AND data-last f(...args)(data).

// Do notation (alternative to generators):
// Effect.Do.pipe(Effect.bind("a", () => effect1), Effect.bind("b", ({a}) => effect2), Effect.let("c", ({a,b}) => a+b))
```

## [Error_Management]
```ts
// TWO error categories:
// 1. Expected: Tracked in E type parameter. Use Data.TaggedError for discriminated unions.
// 2. Unexpected (Defects): NOT in E. From throws/Effect.die. Captured in Cause.Die.

// Error type-level tracking: Effect<A, HttpError | ValidationError, R> — auto-union.
// Short-circuit law: First error in Effect.gen/map/flatMap/andThen stops execution.

// Catching:
function catchAll<A, E, R, A2, E2, R2>(self, f: (e: E) => Effect<A2, E2, R2>): Effect<A | A2, E2, R | R2>
function catchTag<A, E, R, K>(self, tag: K, f: (e: Extract<E, {_tag: K}>) => Effect<...>): Effect<...>
function catchTags<A, E, R>(self, handlers: { [K in E["_tag"]]: (e) => Effect }): Effect<...>
function catchSome<A, E, R>(self, pf: (e: E) => Option<Effect<...>>): Effect<...>
function catchIf<A, E, R>(self, predicate: (e: E) => boolean, f: (e: E) => Effect<...>): Effect<...>

// Defect handling:
function catchAllDefect<A, E, R>(self, f: (defect: unknown) => Effect<...>): Effect<...>
function catchSomeDefect<A, E, R>(self, pf: (defect: unknown) => Option<Effect<...>>): Effect<...>

// Channel operations:
function either<A, E, R>(self): Effect<Either<A, E>, never, R>   // Shift error to value channel.
function option<A, E, R>(self): Effect<Option<A>, never, R>      // Error → None, Success → Some.
function mapError<A, E, R, E2>(self, f: (e: E) => E2): Effect<A, E2, R>
function mapBoth<A, E, R, A2, E2>(self, options: { onFailure, onSuccess }): Effect<A2, E2, R>
function flip<A, E, R>(self): Effect<E, A, R>   // Swap success and error channels.

// Fallback:
function orElse<A, E, R, A2, E2, R2>(self, that: () => Effect<A2, E2, R2>): Effect<A | A2, E2, R | R2>
function orElseFail<A, E, R, E2>(self, error: () => E2): Effect<A, E2, R>
function orDie<A, E, R>(self): Effect<A, never, R>   // Convert expected errors to defects.

// Matching (pattern-match on outcome):
function match<A, E, R, B>(self, options: { onSuccess: (a) => B; onFailure: (e) => B }): Effect<B, never, R>
function matchEffect<A, E, R>(self, options: { onSuccess, onFailure }): Effect<...>
function matchCause<A, E, R, B>(self, options: { onSuccess, onFailure: (cause: Cause<E>) => B }): Effect<B, never, R>
function matchCauseEffect<A, E, R>(self, options: { onSuccess, onFailure }): Effect<...>

// Accumulation (collect ALL errors instead of fail-fast):
function validate<A, E, R, B, E2, R2>(self, that): Effect<[A, B], E | E2, R | R2>
function validateAll<A, E, R>(items, f): Effect<Array<...>, Array<E>, R>
function validateFirst<A, E, R>(items, f): Effect<..., Array<E>, R>

// Retrying:
function retry<A, E, R>(self, schedule: Schedule<any, E>): Effect<A, E, R>
function retryN<A, E, R>(self, n: number): Effect<A, E, R>
function retryOrElse<A, E, R, A2, E2>(self, schedule, orElse): Effect<A | A2, E2, R>
function retryWhile<A, E, R>(self, predicate: (e: E) => boolean): Effect<A, E, R>
function retryUntil<A, E, R>(self, predicate: (e: E) => boolean): Effect<A, E, R>

// Timing out:
function timeout<A, E, R>(self, duration: DurationInput): Effect<A, E | TimeoutException, R>
function timeoutFail<A, E, R, E2>(self, options: { duration, onTimeout: () => E2 }): Effect<A, E | E2, R>
function timeoutTo<A, E, R, B>(self, options: { duration, onSuccess, onTimeout }): Effect<B, E, R>
function timeoutOption<A, E, R>(self, duration): Effect<Option<A>, E, R>

// Sandboxing:
function sandbox<A, E, R>(self): Effect<A, Cause<E>, R>   // Expose full Cause for matching.
function unsandbox<A, E, R>(self: Effect<A, Cause<E>, R>): Effect<A, E, R>

// Yieldable Errors: Data.TaggedError instances yield directly in Effect.gen.
// class MyError extends Data.TaggedError("MyError")<{message: string}>() {}
// yield* new MyError({ message: "oops" })  // Shorthand for yield* Effect.fail(...)
```

## [Concurrency]
```ts
// Concurrency option: { concurrency?: number | "unbounded" | "inherit" }
// "inherit" uses parent fiber's concurrency setting. Applied to all, forEach, mergeAll, etc.

// Fiber lifecycle:
function fork<A, E, R>(self): Effect<Fiber<A, E>, never, R>          // Child fiber. Interrupted when parent exits.
function forkDaemon<A, E, R>(self): Effect<Fiber<A, E>, never, R>    // Daemon. NOT interrupted when parent exits.
function forkScoped<A, E, R>(self): Effect<Fiber<A, E>, never, R | Scope>  // Scoped. Interrupted when Scope closes.
function forkAll<A, E, R>(effects: Iterable<Effect<A, E, R>>): Effect<Fiber<Array<A>, E>, never, R>
// Fiber.join(fiber): await result. Fiber.interrupt(fiber): send interruption.
// Fiber.await(fiber): get Exit without re-raising error.

// Racing:
function race<A, E, R>(self, that): Effect<A, E, R>           // First to complete wins; loser interrupted.
function raceAll<A, E, R>(effects: Iterable<Effect<A, E, R>>): Effect<A, E, R>
function raceWith<A, E, R>(self, that, options: { onSelfDone, onOtherDone }): Effect<...>

// Interruption model (cooperative):
// Effect.interrupt: Immediately interrupt current fiber.
// Effect.interruptible / Effect.uninterruptible: Control interruption regions.
// Interruption propagates through the fiber tree (parent → children).
// Finalizers (acquireRelease, ensuring) ALWAYS run, even on interruption.
// Effect.onInterrupt(self, cleanup): Register cleanup on interruption only.
// Effect.disconnect: Prevent interruption from propagating to forked fiber.

// Deferred: One-shot async variable for fiber coordination.
// Deferred.make<A, E>(), Deferred.succeed(d, value), Deferred.fail(d, error)
// Deferred.await(d): suspends fiber until completed. Deferred.isDone(d): check completion.
// Deferred.complete(d, effect): complete with effect result.

// Queue: Bounded/Unbounded async FIFO with backpressure.
// Queue.bounded(n), Queue.unbounded(), Queue.sliding(n), Queue.dropping(n)
// queue.offer(a), queue.offerAll([a,b,c]), queue.take, queue.takeAll, queue.poll
// queue.size, queue.isFull, queue.isEmpty, queue.shutdown, queue.awaitShutdown
// Backpressure: bounded queue's offer suspends when full. sliding drops oldest.

// PubSub (Hub): Broadcast channel. Each subscriber gets ALL messages published after subscription.
// PubSub.bounded(n), PubSub.unbounded(), PubSub.sliding(n), PubSub.dropping(n)
// hub.publish(a), hub.subscribe (returns Dequeue in Scope), hub.size

// Semaphore: Limit concurrent access. Semaphore.make(permits).
// semaphore.withPermit(effect): acquire permit, run effect, release on any exit.
// semaphore.withPermits(n)(effect): acquire N permits.

// Latch: Binary gate. Latch.make(open?: boolean).
// latch.open, latch.close, latch.await (suspends until open), latch.release
```

## [State_Management]
```ts
// Ref<A>: Mutable reference. Atomic get/set/update. Safe in concurrent contexts.
// Ref.make(initial), Ref.get(ref), Ref.set(ref, value)
// Ref.update(ref, f: A => A), Ref.modify(ref, f: A => [B, A]): atomic read+write.
// Ref.getAndUpdate, Ref.updateAndGet: return old/new value atomically.

// SynchronizedRef: Like Ref but update can run effectful computations.
// Ref.Synchronized.make(initial)
// ref.updateEffect(f: A => Effect<A>): atomically applies effectful update.
// ref.modifyEffect(f: A => Effect<[B, A]>): atomically read+write with effects.
// Use case: update state by calling an API, then storing the result.

// SubscriptionRef: Ref + Stream. Changes observable as a reactive stream.
// SubscriptionRef.make(initial), ref.changes: Stream<A>
// Use case: reactive state that multiple consumers can observe (live queries, UI state).

// FiberRef: Fiber-local state. Inherited by child fibers automatically.
// FiberRef.make(initial, { fork: strategy, join: strategy })
// Fork strategies: FiberRef.patch (default), custom fork/join functions.
// Use case: correlation IDs, auth tokens, logging annotations, tracing context.
// FiberRef.currentLogAnnotations, FiberRef.currentLogLevel: built-in fiber refs.

// Deferred: One-shot promise for inter-fiber signaling (see Concurrency).
// Semaphore, Latch: Coordination primitives (see Concurrency).
```

## [Data_Structures]
```ts
// Chunk<A>: Immutable array-like. O(1) append/prepend. Amortized O(1) concat.
// Chunk.empty(), Chunk.make(1,2,3), Chunk.fromIterable([1,2,3])
// Chunk.append(c, a), Chunk.prepend(c, a), Chunk.concat(c1, c2)
// Chunk.map, Chunk.filter, Chunk.flatMap, Chunk.reduce, Chunk.zip
// Chunk.toReadonlyArray: convert to standard array.

// HashMap<K, V>: HAMT-based immutable key-value store.
// HashMap.make([k1, v1], [k2, v2]), HashMap.fromIterable
// HashMap.get(map, key): Option<V>, HashMap.set(map, key, value), HashMap.remove(map, key)
// HashMap.has(map, key), HashMap.size(map), HashMap.map, HashMap.filter
// Keys MUST implement Equal and Hash traits for correct behavior.

// HashSet<A>: Immutable set with structural equality.
// HashSet.make(1, 2, 3), HashSet.fromIterable, HashSet.add, HashSet.remove
// HashSet.has, HashSet.size, HashSet.union, HashSet.intersection, HashSet.difference

// Option<A> = None | Some<A>: Encodes optional values.
// Option.some(value), Option.none(), Option.fromNullable(nullable)
// Option.map, Option.flatMap, Option.getOrElse, Option.getOrThrow, Option.match
// Option.isSome, Option.isNone, Option.filter, Option.orElse
// Option.gen: Generator syntax for Option (like Effect.gen but synchronous).

// Either<A, E> = Left<E> | Right<A>: Success/Failure without effects.
// Either.right(value), Either.left(error)
// Either.map, Either.flatMap, Either.match, Either.getOrElse
// Either.gen: Generator syntax for Either.

// List<A>: Immutable singly-linked list. O(1) prepend. O(n) access.
// List.make(1,2,3), List.cons(head, tail), List.nil()

// BigDecimal: Arbitrary precision decimal. BigDecimal.make(value, scale).

// Record: Utility module for immutable record operations.
// Record.map, Record.filter, Record.mapKeys, Record.fromEntries, Record.toEntries
```

## [Control_Flow]
```ts
// Schedule<Out, In, R>: Recurring policy for retry/repeat.
// In = consumed (errors for retry, values for repeat). Out = produced value. R = requirements.
// Built-in: Schedule.spaced("1 second"), Schedule.exponential("100 millis", 2)
// Schedule.fixed("5 seconds"), Schedule.recurs(n), Schedule.forever, Schedule.once
// Schedule.windowed("1 minute"), Schedule.fibonacci("100 millis")
// Cron: Schedule.cron("0 * * * *")
// Schedule.jittered: Add random jitter to prevent thundering herd.
// Combinators: Schedule.andThen (sequence), Schedule.union (first delay), Schedule.intersect (max delay)
// Schedule.whileInput(pred), Schedule.whileOutput(pred), Schedule.untilInput(pred), Schedule.untilOutput(pred)
// Schedule.addDelay(f), Schedule.addDelayEffect(f): dynamic delay from schedule output.
// Schedule.tapInput(f), Schedule.tapOutput(f): side effects within schedule.
// Schedule.identity<A>(): passes input unchanged to output (for error-based retry delays).
// Drivers: Effect.repeat(effect, schedule), Effect.retry(effect, schedule)
// Effect.repeatN(effect, n), Effect.repeatOrElse, Effect.retryOrElse

// Conditional operators:
function if_<A, E, R>(predicate: Effect<boolean, ...> | boolean, options: { onTrue, onFalse }): Effect<...>
function when<A, E, R>(self, predicate: () => boolean): Effect<Option<A>, E, R>
function unless<A, E, R>(self, predicate: () => boolean): Effect<Option<A>, E, R>
function whenEffect<A, E, R>(self, predicate: Effect<boolean, ...>): Effect<Option<A>, ...>
// Loop:
function loop<A, E, R, Z>(initial: Z, options: { while: (z: Z) => boolean, step: (z: Z) => Z, body: (z: Z) => Effect<A, E, R> }): Effect<Array<A>, E, R>
function iterate<A, E, R>(initial: A, options: { while: (a: A) => boolean, body: (a: A) => Effect<A, E, R> }): Effect<A, E, R>

// STM: Software Transactional Memory. Atomic multi-variable transactions.
interface STM<out A, out E = never, out R = never> extends Pipeable {}
// STM.gen(function* () { ... }): generator syntax for STM.
// STM.commit(stm): Bridge STM → Effect. Required to execute.
// STM.retry: Semantic retry (suspends transaction until watched variables change).
// STM.orTry(stm1, stm2): Try stm1, if it retries, try stm2.
// TRef: Transactional variable (like Ref but for STM). TRef.make, TRef.get, TRef.set, TRef.update.
// TQueue, TArray, TMap, TSet: Transactional data structures.
// NO side effects in STM. Only transactional operations allowed.
// Atomicity: Entire STM.gen block executes as one atomic operation.

// Stream<A, E, R>: Pull-based reactive stream. Zero or more values. Chunked internally.
interface Stream<out A, out E = never, out R = never> extends Pipeable {}
// Creation: Stream.make(1,2,3), Stream.fromIterable, Stream.fromEffect, Stream.range(1,10)
// Stream.iterate(init, f), Stream.unfold(init, f), Stream.unfoldEffect
// Stream.fromQueue(queue), Stream.fromPubSub(hub), Stream.fromSchedule(schedule)
// Stream.async(register), Stream.asyncEffect(register)
// Stream.tick(interval): emit void on each interval tick.
// Stream.repeat(effect), Stream.repeatEffect(effect), Stream.repeatEffectOption
// Transformations: Stream.map, Stream.mapEffect, Stream.filter, Stream.filterEffect
// Stream.flatMap, Stream.tap, Stream.tapEffect, Stream.scan, Stream.scanEffect
// Stream.take(n), Stream.takeWhile, Stream.takeUntil, Stream.takeRight(n)
// Stream.drop(n), Stream.dropWhile, Stream.dropUntil, Stream.dropRight(n)
// Combining: Stream.merge, Stream.mergeAll, Stream.zip, Stream.zipWith
// Stream.interleave, Stream.concat, Stream.cross
// Fan-out: Stream.broadcast(n), Stream.distributedWith(n, predicate)
// Grouping: Stream.groupByKey(f), Stream.grouped(n), Stream.groupedWithin(n, duration)
// Consuming: Stream.runCollect → Chunk<A>, Stream.runDrain → void, Stream.runFold
// Stream.runForEach(f), Stream.runHead, Stream.runLast
// Stream.toReadableStream: Bridge to Web Streams API.
// Error handling: Stream.catchAll, Stream.retry(schedule), Stream.orElse, Stream.orDie
// Resources: Stream.acquireRelease(acquire, release), Stream.finalizer(cleanup), Stream.ensuring(cleanup)
// Stream.unwrapScoped: Scoped resource + stream creation in one step.

// Sink<A, In, L, E, R>: Stream consumer. Produces A from In, with leftovers L.
// Sink.collectAll(): Chunk<A>, Sink.head: Option<A>, Sink.last: Option<A>
// Sink.count, Sink.sum, Sink.foldLeft(init, f)
// Sink.forEach(f), Sink.forEachWhile(f)
// Sink.take(n), Sink.collectAllN(n), Sink.foldUntil(init, max, f)
// Sink.map, Sink.flatMap, Sink.contramap, Sink.dimap
// Stream.run(stream, sink): Execute stream with a custom sink.
```

## [Batching_System]
```ts
// Request<A, E>: Typed data request. Must implement Equal + Hash.
// Request.tagged<MyReq>("MyReq") — auto equality via Data.
// RequestResolver: Handles batches. makeBatched for parallel, fromEffect for single.
// RequestResolver.makeBatched((requests: ReadonlyArray<MyReq>) => Effect<void>)
// RequestResolver.fromEffect((request: MyReq) => Effect<A, E>)
// RequestResolver.contextFromServices(...tags): provide context to resolver.
// Wiring: Effect.request(new MyReq(...), resolver)
// Enable: { batching: true } in Effect.forEach/all
// Caching: Effect.withRequestCaching(true), Request.makeCache({ capacity, timeToLive })
// Disable: Effect.withRequestBatching(false) for individual resolution.
// Performance: N queries → 1+K batch calls (K = distinct resolver types).
```

## [Caching_System]
```ts
// Cache<Key, Value, Error>: Concurrent-safe cache with TTL and LRU eviction.
// Cache.make({ capacity: number, timeToLive: DurationInput, lookup: (key) => Effect<Value, Error> })
// cache.get(key): returns cached value or computes via lookup. Concurrent-safe — only computes once.
// cache.refresh(key): recompute without removing old value.
// cache.invalidate(key), cache.invalidateAll()
// cache.size, cache.contains(key)
// cache.cacheStats: Effect<{ hits: number, misses: number, size: number }>

// Caching Effects:
// Effect.cached(effect): Lazily compute once and cache result. Subsequent runs return cached.
// Effect.cachedWithTTL(effect, duration): Cache for duration, then recompute.
// Effect.cachedFunction(fn): Memoize a function with effects. Same input → same output.
// Effect.once(effect): Execute effect at most once. Subsequent runs are no-ops (returns void).
// Effect.cachedInvalidateWithTTL(effect, duration): Returns [cachedEffect, invalidate] tuple.
```

## [Configuration_System]
```ts
// Config<A>: Declarative config description. Resolved at runtime by ConfigProvider.
// Built-in: Config.string("KEY"), Config.number("KEY"), Config.boolean("KEY"), Config.integer("KEY")
// Config.date("KEY"), Config.duration("KEY"), Config.logLevel("KEY"), Config.url("KEY")
// Config.literal("a", "b"), Config.secret("KEY") (deprecated, use redacted)
// Config.redacted("KEY"): wraps in Redacted<string>. Config.redacted(Config.number("KEY")): Redacted<number>.
// Combinators: Config.array, Config.hashSet, Config.hashMap, Config.option, Config.repeat
// Config.all([c1, c2]): tuple. Config.all({ a: c1, b: c2 }): struct.
// Config.succeed(value), Config.fail(message)
// Config.withDefault(value), Config.withDescription(desc), Config.validate(options)
// Config.map(f), Config.mapOrFail(f), Config.mapAttempt(f)
// Config.orElse(alternative), Config.orElseIf(predicate, alternative)
// Config.nested(config, "NAMESPACE"): reads NAMESPACE_KEY env vars.
// Schema.Config("KEY", schema): Validate config values with Schema.

// ConfigProvider: Backend engine for loading config values.
// Default: reads from process.env. Automatically provided.
// ConfigProvider.fromMap(map, options?): testing. ConfigProvider.fromJson(json): JSON object.
// ConfigProvider.fromEnv({ pathDelim, seqDelim }): custom env parsing.
// ConfigProvider.nested("NS"), ConfigProvider.constantCase, ConfigProvider.lowerCase, ConfigProvider.kebabCase
// ConfigProvider.orElse(p1, p2): fallback chain. ConfigProvider.within(p, path, target): scoped override.
// Effect.withConfigProvider(effect, provider): override provider for an effect.

// Redacted<A>: Opaque secret wrapper. console.log → "<redacted>". JSON.stringify → "<redacted>".
// Redacted.make(secret), Redacted.value(redacted): extract. Use sparingly.
```

## [Runtime_System]
```ts
// Runtime<R>: Context<R> + FiberRefs + RuntimeFlags.
// Runtime.defaultRuntime: used by Effect.runPromise, runSync, etc.
// Runtime.runPromise(runtime)(effect), Runtime.runSync, Runtime.runFork
// Custom runtimes: Runtime.make({ context, fiberRefs, runtimeFlags })

// Default Services (auto-provided, R = never):
// Clock, ConfigProvider, Console, Random, Tracer
// Overrides: Effect.withClock, Effect.withRandom, Effect.withConfigProvider, Effect.withConsole, Effect.withTracer
// Scoped: Effect.withClockScoped, Effect.withRandomScoped, etc. (restore after scope closes)

// ManagedRuntime: Long-lived runtime from Layer. For framework integration.
// ManagedRuntime.make(appLayer): creates runtime that initializes all layers.
// runtime.runPromise(effect), runtime.runSync(effect), runtime.runFork(effect)
// runtime.disposeEffect: cleanup. Must be called to release resources (e.g., on app shutdown).
// Use case: React apps, Express middleware, non-Effect entry points.

// Effect.Tag: Streamlined service definition. Embeds service shape into tag class.
// class MyService extends Effect.Tag("MyService")<MyService, { readonly method: (...) => Effect<...> }>() {}
// Now MyService.method(...) is directly accessible without extracting from Context.

// Platform Runtimes:
// NodeRuntime.runMain(effect): Node.js entry point with graceful shutdown.
// BunRuntime.runMain(effect): Bun entry point.
// Effect.runMain(effect): Universal entry point.
```

## [Observability]
```ts
// Logger: Structured logging. Configurable per-scope via Layer.
// Effect.log("msg"), Effect.logDebug, Effect.logInfo, Effect.logWarning, Effect.logError, Effect.logFatal
// Effect.logTrace, Effect.logMessage
// Logger.replace(Logger.defaultLogger, customLogger): swap logger implementation.
// Logger.make(({ message, logLevel, date, cause, spans, annotations, ... }) => ...)
// Logger.add(customLogger): add alongside existing loggers.
// Logger.remove(Logger.defaultLogger): suppress all logging.
// Logger.batched(logger, options): batch log messages for performance.
// Logger.json: Built-in JSON logger. Logger.pretty: Human-readable pretty logger.
// Logger.minimumLogLevel(LogLevel.Warning): filter messages below threshold.
// Spans: Effect.withSpan("name"): structured parent-child tracing.
// Effect.annotateCurrentSpan("key", "value"): add attributes to current span.
// Effect.annotateLogsScoped(annotations): add log annotations within scope.
// Effect.logAnnotations: read current log annotations.
// LogLevel: All | Trace | Debug | Info | Warning | Error | Fatal | None

// Metric: OpenTelemetry-compatible metrics.
// Metric.counter("name"): monotonic counter. Metric.gauge("name"): point-in-time value.
// Metric.histogram("name", { boundaries: [...] }): distribution.
// Metric.timer("name"): measures duration. Metric.frequency("name"): counts by label.
// Metric.summary("name", { maxAge, maxSize, quantiles }): statistical summary.
// metric.increment, metric.set(value), metric.update(value)
// Effect.withMetric(metric): instrument an effect with a metric.
// Metric.tagged("key", "value"), Metric.taggedWithLabels: add labels.

// Tracer: Distributed tracing. OpenTelemetry integration.
// Effect.withSpan("name", options?): create span around effect. Nests automatically.
// Effect.annotateCurrentSpan("key", "value"): add span attributes.
// @effect/opentelemetry: NodeSdk.layer for OpenTelemetry export.
// Tracer.externalSpan(spanId, traceId): connect to external trace.

// Supervisor: Monitors fiber lifecycle.
// Supervisor.track: creates a supervisor tracking all fibers.
// Supervisor.none: no-op supervisor. supervisor.value: get tracked fibers.
// Effect.supervised(supervisor): attach supervisor to effect tree.
```

## [Schema_System]
```ts
// Schema<Type, Encoded, Requirements>: Bidirectional codec (decode + encode).
// Type = decoded. Encoded = wire format. Requirements = context needed.

// Primitives: Schema.String, Schema.Number, Schema.Boolean, Schema.BigInt, Schema.Date
// Schema.Null, Schema.Undefined, Schema.Unknown, Schema.Void, Schema.Never
// Schema.Literal("a", "b"), Schema.Enums(MyEnum), Schema.TemplateLiteral(...)
// Schema.UniqueSymbolFromSelf(sym), Schema.instanceOf(MyClass)

// Structs: Schema.Struct({ name: Schema.String, age: Schema.Number })
// Index signatures: Schema.Struct({ a: Schema.Number }, { key: Schema.String, value: Schema.Number })
// Schema.optional(Schema.String), Schema.optionalWith(Schema.String, { exact: true, default: () => "" })
// Schema.partial(schema), Schema.required(schema), Schema.pick(schema, "a", "b"), Schema.omit(schema, "c")
// Schema.extend(schema1, schema2): merge struct schemas.
// Schema.mutable(schema): make readonly fields mutable (shallow).

// Records: Schema.Record({ key: Schema.String, value: Schema.Number })
// Arrays: Schema.Array(Schema.String), Schema.NonEmptyArray(Schema.Number)
// Tuples: Schema.Tuple(Schema.String, Schema.Number), Schema.optionalElement(Schema.Boolean)
// Unions: Schema.Union(TypeA, TypeB), Schema.EitherFromSelf, Schema.OptionFromSelf

// Branded: Schema.String.pipe(Schema.brand("Email")) → Schema<string & Brand<"Email">>
// Filters: Schema.minLength(n), Schema.maxLength(n), Schema.pattern(regex), Schema.nonEmpty()
// Schema.positive(), Schema.negative(), Schema.nonNaN(), Schema.finite()
// Schema.between(min, max), Schema.int(), Schema.multipleOf(n)
// Custom: Schema.filter(schema, predicate, options)

// Transformations: Schema.transform(from, to, { strict: true, decode, encode })
// Schema.transformOrFail(from, to, { decode, encode }): effectful, may fail with ParseError.
// Schema.compose(schema1, schema2): chain codecs.
// Built-in: Schema.NumberFromString, Schema.DateFromString, Schema.BooleanFromString
// Schema.split(separator), Schema.Trim, Schema.Lowercase, Schema.Uppercase

// Classes: class User extends Schema.Class<User>("User")({ name: Schema.String, age: Schema.Number }) {}
// TaggedClass: class MyError extends Schema.TaggedClass<MyError>()("MyError", { message: Schema.String }) {}
// TaggedError: class ApiError extends Schema.TaggedError<ApiError>()("ApiError", { status: Schema.Number }) {}
// TaggedRequest: class GetUser extends Schema.TaggedRequest<GetUser>()("GetUser", { ... }) {}

// Decoding: Schema.decodeUnknownSync(schema)(data), Schema.decodeUnknownOption, Schema.decodeUnknownEither
// Schema.decodeUnknownEffect, Schema.decodeUnknownPromise, Schema.decode (from Encoded to Type)
// Encoding: Schema.encodeSync, Schema.encodeUnknownSync, Schema.encode
// Validation: Schema.validateSync, Schema.is(schema)(value): type guard (boolean).
// Schema.asserts(schema)(value): assertion (throws on failure).

// JSON Schema: JSONSchema.make(schema) → OpenAPI-compatible JSON Schema.
// Arbitrary: Arbitrary.make(schema) → fast-check Arbitrary for property testing.
// Pretty: Pretty.make(schema) → pretty-printer function.
// Equivalence: Equivalence.make(schema) → Equivalence instance.
// Config: Schema.Config("KEY", schema) → Config<A> with schema validation.
// Schema.Data(schema): Add Equal + Hash traits to decoded values.
// Schema.Option(schema), Schema.OptionFromNullOr(schema), Schema.OptionFromUndefinedOr(schema)
// Schema.Either(schema), Schema.EitherFromUnion(leftSchema, rightSchema)
// Schema.Exit, Schema.Cause, Schema.Chunk, Schema.Duration, Schema.Redacted: Effect data type bridges.

// Annotations: Schema.annotations(schema, { title, description, examples, default, documentation })
// Standard Schema: Schema.standardSchemaV1(schema): interop with Zod, Valibot, Arktype ecosystems.
```

## [Pattern_Matching]
```ts
// Match module: Exhaustive, type-safe pattern matching.
// Match.type<MyUnion>().pipe(
//   Match.when({ _tag: "A" }, (a) => ...),
//   Match.when({ _tag: "B" }, (b) => ...),
//   Match.exhaustive  // compile error if not all cases handled
// )
// Match.value(input).pipe(...): match on a specific value.
// Match.tag("A"): shorthand for _tag matching. Match.not({ _tag: "A" }): negative match.
// Match.when(predicate, handler): predicate-based matching.
// Match.whenOr({ _tag: "A" }, { _tag: "B" }, handler): match multiple patterns.
// Match.whenAnd(pred1, pred2, handler): match all predicates.
// Terminators: Match.exhaustive, Match.orElse(() => ...), Match.option, Match.either
```

## [Testing]
```ts
// TestClock: Control time in tests. Clock does NOT progress on its own.
// TestClock.adjust("1 minute"): move forward, triggers scheduled effects.
// TestClock.setTime(epochMs): set absolute time. TestClock.currentTimeMillis: read current.
// Pattern: fork effect → adjust clock → join fiber → verify result.
// Example: const fiber = yield* Effect.fork(Effect.sleep("5 minutes").pipe(Effect.as("done")))
//          yield* TestClock.adjust("5 minutes")
//          const result = yield* Fiber.join(fiber) // "done"

// TestContext: Provides TestClock, TestRandom, TestConfig.
// Effect.provide(TestContext.TestContext): enables all test services.

// TestRandom: Deterministic randomness. TestRandom.feedIntegers(...values): set sequence.
// ConfigProvider.fromMap({ KEY: "value" }): mock configuration. Replaces env vars in tests.
```

## [Traits]
```ts
// Equal: Structural equality. Auto on Data module types.
// Equal.equals(a, b): deep comparison. Equal.symbol: implement on custom classes.
// Arrays, objects created via Data.struct/TaggedClass auto-implement.

// Hash: Hashing for HashMap/HashSet. Auto on Data module types.
// Hash.hash(value): int hash code. Must be consistent: Equal values MUST have same hash.
// Hash.symbol: implement on custom classes. Combine with Hash.combine.

// Order<A>: Total ordering for sorting, min, max, clamp.
// Order.string, Order.number, Order.bigint, Order.Date, Order.boolean
// Order.mapInput(Order.number, (user) => user.age): derive order from accessor.
// Order.combine(o1, o2): composite order (sort by first, then second).
// Order.reverse(order): flip direction. Array.sort(Order.number).
// Order.between, Order.clamp, Order.min, Order.max.

// Equivalence<A>: Equivalence relation (reflexive, symmetric, transitive).
// Equivalence.strict: reference equality. Equivalence.string, Equivalence.number.
// Equivalence.mapInput(eq, f): derived equivalence.
```

## [Resource_Management]
```ts
// Scope: Finalizer boundary. Acquired → Used → Released (even on error/interruption).
// Effect.acquireRelease(acquire, release): Bracket pattern. release gets Exit.
// Effect.acquireUseRelease(acquire, use, release): Inline. Auto-scoped.
// Effect.scoped: Provide a Scope, run effect, execute all finalizers.
// Effect.addFinalizer(finalizer): Add cleanup to current Scope.
// Effect.ensuring(effect, finalizer): Run finalizer on any exit (success/failure/interruption).
// Effect.onExit(effect, onExit: (exit: Exit) => Effect): Inspect exit before cleanup.
// Effect.onInterrupt(effect, cleanup): Run cleanup ONLY on interruption.
// Layer.scoped(tag, effect): Build service with Scope lifecycle (e.g., database connections).
```

## [Platform_Services]
```ts
// @effect/platform: Cross-platform abstractions.
// HttpApi, HttpApiGroup, HttpApiEndpoint: Declarative typed HTTP API definitions.
// HttpClient: Type-safe HTTP client. HttpClient.fetch: default fetch-based.
// HttpClientRequest.get/post/put/patch/del: build requests. HttpClientResponse: typed responses.
// FileSystem: readFile, writeFile, stat, readDirectory, remove, rename, truncate — platform-agnostic.
// Path: Path.join, Path.resolve, Path.basename, Path.dirname, Path.extname.
// Terminal: Terminal.readLine, Terminal.display — CLI I/O.
// KeyValueStore: get, set, remove, has, modify — simple persistent storage.
// Command: Command.make("ls", "-la"), Command.start, Command.string — child processes.
// PlatformLogger: File-based logger with rotation.
// @effect/platform-node: NodeContext.layer, NodeRuntime.runMain — Node.js specifics.
// @effect/platform-bun: BunContext.layer, BunRuntime.runMain — Bun specifics.
// @effect/platform-browser: BrowserRuntime.runMain — Browser specifics.
```

## [Architectural_Laws]
- **Generator_Law**: Use `Effect.gen(function* () { ... })` with `yield*` for linear logic flow. Avoid nested flatMap.
- **Layer_Law**: Services MUST be provided via `Layer`. Distinguish `Live` and `Test` implementations. Layers are the dependency injection system.
- **Error_Law**: Expected errors MUST be typed in the `E` channel. Use `Cause` for debugging defects/interruptions. Use `Data.TaggedError` for discriminated unions.
- **Resource_Law**: Use `Scope` + `acquireRelease` for ALL external handles (files, connections, subscriptions). Finalizers run on ANY exit.
- **Unification_Rule**: Effect, STM, Stream, Layer, Option, Either, Context.Tag all expose `[Unify.typeSymbol]` for seamless `yield*` in generators.
- **Layer_Memoization**: Layers are memoized by reference. Same layer instance used twice → constructed once. Use `Layer.fresh(layer)` to force fresh construction.
- **STM_Atomicity**: Entire `STM.gen` block executes atomically. NO side effects inside STM — only TRef/TQueue/TMap operations.
- **Batching_Rule**: Requests MUST implement `Equal` + `Hash` (use `Data` or `Request.tagged`) for deduplication and batch resolution.
- **Inheritance_Law**: FiberRefs, RuntimeFlags propagate from parent to child fibers. Override with `Effect.locally`.
- **Configuration_Precedence**: ConfigProvider resolution follows `orElse` composition order. innermost scope wins.
- **Micro_Exclusion_Rule**: `Micro` module forbids Layer, Queue, Deferred, Ref (except MicroRef). Keeps bundle ~5kb.
- **Short_Circuit_Law**: `Effect.gen`, `map`, `flatMap`, `andThen` ALL short-circuit on first error. Use `validate` mode for error accumulation.
- **Structural_Equality_Law**: All `Data` module types auto-implement `Equal` + `Hash`. Schema.Data also adds these traits.
- **Stream_Chunking_Law**: Streams operate on `Chunk<A>` internally for amortized I/O. Use `Stream.chunks` to access raw chunks.
- **Schema_Bidirectionality_Law**: Every Schema defines BOTH decode and encode as inverses. Symmetry is guaranteed.
- **Default_Service_Law**: Clock, ConfigProvider, Console, Random, Tracer are auto-provided. R = never for these. Override with `Effect.with*`.
- **Dual_API_Law**: Most functions support data-first `f(data, args)` AND data-last `f(args)(data)`. Enables both direct call and pipe style.
- **Interruption_Cooperativity_Law**: Interruption is cooperative. It propagates through fiber tree. Uninterruptible regions protect critical sections.
- **Cache_Dedup_Law**: Cache.make deduplicates concurrent lookups for the same key — value is computed exactly once.
- **Brand_Isolation_Law**: Branded types prevent structural aliasing at compile-time. `UserId` ≠ `ProductId` even if both are `number`.

## [Syntax_Rules] | [Naming_Conventions]
- `Effect.andThen`: Primary operator for sequencing and mapping. Replaces `flatMap` + `map` in most cases.
- `Effect.gen(function* () { ... })`: Generator syntax with `yield*` for imperative-style Effect programming.
- `camelCase`: Functions, effect instances, module-level operations.
- `PascalCase`: Tags (Services), Schemas, Classes, Error types, Brand names.
- `pipe`: `.pipe()` method or standalone `pipe()` for composable multi-step transformations.
- `_tag`: Discriminant field on tagged errors/classes for pattern matching with `catchTag`/`Match.tag`.
- `Dual APIs`: `f(data, ...args)` (data-first) or `f(...args)(data)` (data-last, for pipe).
- `Do notation`: `Effect.Do.pipe(Effect.bind("x", ...), Effect.let("y", ...))` — alternative to generators.
- `Effect.Tag`: Embeds service shape for `MyService.method(...)` access pattern.
- `Effect.provide(effect, layer)`: Supply services. `Effect.provideService(effect, tag, impl)`: inline single service.

## [Prohibited_Patterns]
- NO `try/catch` — use `Effect.try`, `Effect.tryPromise`, or `Effect.catchAll`.
- NO `any` in `A` or `E` channels — use `unknown` if truly unknown.
- NO unhandled `Scope` — always close or provide scope for resource-heavy effects.
- NO manual `Fiber` management when `Effect.all`/`Stream` can solve it.
- NO `Promise.all` — use `Effect.all` with `{ concurrency: "unbounded" }`.
- NO mutable state without `Ref` — direct mutation breaks fiber safety.
- NO side effects inside `STM` — only transactional operations (TRef, TQueue, TMap).
- NO eager evaluation assumptions — Effects are lazy, unlike Promises. They describe, not execute.
- NO `console.log(redacted)` — always shows `<redacted>`. Use `Redacted.value()` to extract.
- NO `Promise.reject` inside `Effect.promise` — rejected promises become defects, not typed errors.
- NO `Layer.fresh` in tests unless specifically testing service isolation — memoization is desirable.
- NO ignoring `runtime.disposeEffect` when using `ManagedRuntime` — leaks resources.
- NO wildcard `import * from "effect"` — use named imports for tree-shaking.

## [Tactical_Patterns]

### Creating Effects
- `Effect.succeed/fail`: Pure constructors. `succeed` eagerly wraps value. `fail` eagerly wraps error.
- `Effect.sync/try`: Wrap synchronous code. `try` catches thrown exceptions.
- `Effect.tryPromise`: Wrap fetch/API calls with typed error mapping.
- `Effect.promise`: Wrap Promises that NEVER reject (rejection = defect).
- `Effect.async`: Convert callback APIs. Return cleanup Effect for interruption support.
- `Effect.suspend`: Defer Effect construction (recursive effects, stack safety).

### Building Pipelines
- `Effect.andThen`: Unified map+flatMap. Accepts value, function, or Effect.
- `Effect.tap`: Side effect without changing value. `Effect.tapError`: tap on errors.
- `Effect.all + struct`: `Effect.all({ a: eff1, b: eff2 })` → `Effect<{ a, b }>`.
- `Effect.forEach`: Map+sequence collection with optional concurrency.
- `Effect.Do + bind/let`: Alternative to generators for sequential pipelines.

### Resource Management
- `Effect.acquireRelease(acquire, release)`: Bracket pattern. Release runs on ANY exit.
- `Effect.acquireUseRelease(acquire, use, release)`: Inline bracket.
- `Effect.scoped`: Provide Scope, run finalizers after completion.
- `Effect.ensuring(finalizer)`: Guaranteed cleanup.
- `Layer.scoped(tag, effect)`: Build service with lifecycle (connections, pools).

### Parallelism & Concurrency
- `{ concurrency: "unbounded" }`: Parallel all/forEach. Number for limited concurrency.
- `Effect.race/raceAll`: First to complete wins. Losers interrupted.
- `Effect.fork/forkDaemon/forkScoped`: Different fiber lifecycles.
- `Effect.interrupt`: Cooperative interruption. `Effect.uninterruptible`: protect critical section.
- `Deferred.await + Deferred.succeed`: One-shot inter-fiber signaling.
- `Queue.bounded/sliding/dropping`: Backpressure-aware async channels.
- `Hub.subscribe`: Fan-out broadcast to multiple consumers.
- `Semaphore.withPermit`: Limit concurrent access to N fibers.

### Error Handling
- `catchTag("MyError", handler)`: Handle specific tagged error. Removes from union.
- `catchTags({ Error1: h1, Error2: h2 })`: Handle multiple tagged errors at once.
- `match/matchEffect`: Branch on success/failure without catching.
- `either/option`: Shift error to value channel for inspection.
- `orElse/orDie`: Fallback or convert to defect.
- `sandbox/unsandbox`: Expose/hide full Cause for advanced matching.
- `validate/validateAll`: Accumulate ALL errors instead of fail-fast.
- `retry(schedule)`: Retry with backoff. `retryWhile/retryUntil`: conditional retry.

### Scheduling
- `Schedule.exponential("100 millis")`: Exponential backoff with base.
- `Schedule.jittered`: Randomize delays to avoid thundering herd.
- `Schedule.intersect(s1, s2)`: Run both, take max delay from each.
- `Schedule.addDelay((out) => Duration.millis(out.retryAfter))`: Dynamic delay from error/output.
- `Effect.repeat(effect, schedule)`: Repeat successful effects on schedule.
- `Effect.race(longTask, Effect.repeat(polling, Schedule.fixed("1s")))`: Poll until task completes.

### Caching
- `Cache.make({ capacity, timeToLive, lookup })`: Concurrent-safe LRU cache.
- `Effect.cached(effect)`: Memoize effect result. `Effect.cachedWithTTL(effect, "5 minutes")`.
- `Effect.cachedFunction(fn)`: Memoize an effectful function by input.
- `Effect.once(effect)`: Run exactly once. Subsequent calls are no-ops.
- `Effect.withRequestCaching(true)`: Cache batched request results.

### Configuration
- `Config.nested("SERVER")`: Namespace env vars (SERVER_HOST, SERVER_PORT).
- `Config.redacted("API_KEY")`: Secret config. Never logged.
- `ConfigProvider.fromMap(map)`: Mock config in tests.
- `Schema.Config("KEY", schema)`: Validate config with Schema.

### Observability
- `Effect.withSpan("name")`: Trace span. Nests automatically through Effect.gen.
- `Effect.annotateCurrentSpan("key", "value")`: Add attributes to span.
- `Logger.json / Logger.pretty`: Built-in log formatters.
- `Metric.counter/gauge/histogram/timer`: OpenTelemetry metrics.

### Testing
- Fork effect → `TestClock.adjust("5 minutes")` → join fiber → assert.
- `Effect.provide(TestContext.TestContext)`: Enable all test services.
- `ConfigProvider.fromMap({ API_KEY: "test" })`: Mock config in tests.
- `TestRandom.feedIntegers(1, 2, 3)`: Deterministic random sequences.

### Runtime & Integration
- `ManagedRuntime.make(AppLayer)`: Long-lived runtime for React/Express.
- `runtime.runPromise(effect)`: Execute effect from non-Effect code.
- `runtime.disposeEffect`: MUST call on shutdown to release resources.
- `NodeRuntime.runMain(effect.pipe(Effect.provide(AppLayer)))`: Node.js entry point.

### Schema Patterns
- `Schema.decodeUnknownSync(schema)(data)`: Validate external data synchronously.
- `Schema.Class + Schema.TaggedError`: Define domain types with auto-validation.
- `Schema.brand("Email")`: Nominal type safety from structural schema.
- `Schema.transform(from, to, { decode, encode })`: Custom bidirectional codec.
- `Schema.Data(schema)`: Add Equal + Hash to decoded values.
- `Arbitrary.make(schema)`: Generate property test data from schema.

### Micro (Lightweight)
- `Micro<A, E, R>`: ~5kb gzipped. For libraries needing minimal bundle.
- NO Layer, Ref, Queue, Deferred. Only Micro-specific primitives.
- `Micro.toEffect(micro)`: Lift into full Effect when needed.
- Use case: Libraries exposing Promise-based API with internal Effect logic.

## [Ecosystem_Concepts]

### @effect/schema
- **Schema<A, I, R>**: Bidirectional codec. A = decoded, I = encoded, R = requirements.
- **AST**: Internal representation for reflection and compiler dispatch.
- **ParseError**: Rich error tree with path information, nested issues.
- **Branding**: `Schema.brand("Email")` for nominal type safety.
- **Standard Schema**: `Schema.standardSchemaV1(schema)` for Zod/Valibot/Arktype interop.
- **Annotations**: Attach metadata (title, description, examples, default, documentation).
- **Schema.Data**: Add Equal+Hash traits to decoded values.
- **Schema.Config**: Bridge between Schema and Config for validated configuration.

### @effect/platform
- **HttpApi/HttpApiGroup/HttpApiEndpoint**: Declarative typed HTTP APIs.
- **HttpClient**: Type-safe client. Default: `HttpClient.fetch`.
- **FileSystem**: readFile, writeFile, stat, remove — platform-agnostic.
- **Path**: join, resolve, basename, dirname, extname — path utilities.
- **Terminal**: readLine, display — CLI I/O.
- **KeyValueStore**: get, set, remove, has — persistent key-value storage.
- **Command**: Command.make("cmd", ...args) — child processes.
- **NodeContext.layer / BunContext.layer**: Platform-specific service implementations.

### Micro (Lightweight Effect)
- **Micro<A, E, R>**: ~5kb gzipped minimum. Standalone.
- **MicroExit**: Success | Failure outcome for Micro computations.
- **NO Layer, Ref, Queue, Deferred**: Excluded for minimal bundle.
- **Use case**: Libraries exposing Promise-based APIs internally using Effect.
- **Compatibility**: `Micro.toEffect(micro)` lifts into full Effect.