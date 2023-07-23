const voidSymbol = Symbol("voidSymbol");
const idleSymbol = Symbol("idleSymbol");
const pendingSymbol = Symbol("pendingSymbol");
const stableSymbol = Symbol("stableSymbol");

/**
 * Used as a key to nominally type async variables.
 */
const asyncVarSymbol = Symbol("asyncVarSymbol");

/**
 * A consumer can be of two kinds: a publisher (`Required<Consumer<Value,
 * Error>>`) and a subscriber (`Consumer<Value, Error>`). A publisher is passed
 * to `createAsyncVar` callback, a subscriber is passed to an async var.
 */
export interface Consumer<Value, Error> {
  set?: (value: Value) => void;
  err?: (error: Error) => void;
  dispose?: () => void;
}

export interface AsyncVar<Value, Error> {
  (subscriber?: Consumer<Value, Error>): () => void;
  [asyncVarSymbol]: true;
}

export const isAsync = (arg: unknown): arg is AsyncVar<unknown, unknown> =>
  typeof arg === "object" && arg !== null && asyncVarSymbol in arg;

const getProducerDisposedError = () =>
  new Error(
    "You cannot call `set`, `err` and `dispose` publisher functions (the handles passed by `createAsyncVar` to its callback) after you've called `err` or `dispose`, or after the teardown function has been called."
  );

let queue: Set<() => void> | undefined;

/**
 * As a perf optimization, instead of taking an `args` array, we only handle 0
 * or 1 arguments by taking a single `arg` that's passed to callback iff it's
 * !== voidSymbol.
 */
const runClientCallback: {
  (callback: () => void, arg: typeof voidSymbol): void;
  <Arg>(callback: (arg: Arg) => void, arg: Arg): void;
} = (callback: (arg?: unknown) => void, arg: unknown) => {
  const outerQueue = queue;
  queue = new Set();
  try {
    if (arg === voidSymbol) {
      callback();
    } else {
      callback(arg);
    }
  } catch (error) {
    queueMicrotask(() => {
      throw error;
    });
  }
  for (const task of queue) {
    queue.delete(task);
    task();
  }
  queue = outerQueue;
};

export const createAsyncVar: <Value, Error>(
  produce: (publisher: Required<Consumer<Value, Error>>) => (() => void) | void
) => AsyncVar<Value, Error> = <Value, Error>(
  clientProduce: (
    publisher: Required<Consumer<Value, Error>>
  ) => (() => void) | void
) => {
  let value: Value | typeof voidSymbol = voidSymbol;
  let error: Error | typeof voidSymbol = voidSymbol;
  let teardown:
    | (() => void)
    | typeof idleSymbol
    | typeof pendingSymbol
    | typeof stableSymbol = idleSymbol;
  const cleanSubscribers = new Set<Consumer<Value, Error>>();
  const dirtySubscribers = new Map<
    Consumer<Value, Error>,
    Value | typeof voidSymbol
  >();
  let emitting = false;

  const emit = () => {
    emitting = true;
    if (teardown === pendingSymbol) {
      runClientCallback(produce, voidSymbol);
    }
    for (const [subscriber, subscriberValue] of dirtySubscribers.entries()) {
      dirtySubscribers.delete(subscriber);
      if (error === voidSymbol) {
        cleanSubscribers.add(subscriber);
        if (
          value !== voidSymbol &&
          subscriberValue !== value &&
          subscriber.set
        ) {
          runClientCallback(subscriber.set, value);
        }
      } else {
        // Here `value === voidSymbol`, `teardown === <idleSymbol or
        // pendingSymbol>`, `emitting === false`.
        if (subscriberValue === voidSymbol && teardown === pendingSymbol) {
          cleanSubscribers.add(subscriber);
        } else {
          if (subscriber.err) {
            runClientCallback(subscriber.err, error);
          } else {
            queueMicrotask(() => {
              throw error;
            });
          }
        }
      }
    }
    error = voidSymbol;
    emitting = false;
    if (teardown === stableSymbol) {
      for (const subscriber of cleanSubscribers) {
        cleanSubscribers.delete(subscriber);
        if (subscriber.dispose) {
          runClientCallback(subscriber.dispose, voidSymbol);
        }
      }
    }
    if (
      typeof teardown === "function" &&
      cleanSubscribers.size === 0 &&
      dirtySubscribers.size === 0
    ) {
      teardown();
    }
  };

  const scheduleOrRunEmit = () => {
    if (queue) {
      queue.add(emit);
    } else {
      emit();
    }
  };

  const set = (clientValue: Value) => {
    if (clientValue !== value) {
      for (const subscriber of cleanSubscribers) {
        dirtySubscribers.set(subscriber, value);
      }
      cleanSubscribers.clear();
      value = clientValue;
      error = voidSymbol;
      if (!emitting) {
        scheduleOrRunEmit();
      }
    }
  };

  const err = (clientError: Error) => {
    for (const subscriber of cleanSubscribers) {
      dirtySubscribers.set(subscriber, value);
    }
    cleanSubscribers.clear();
    value = voidSymbol;
    error = clientError;
    teardown = idleSymbol;
    emitting = false;
    scheduleOrRunEmit();
  };

  const dispose = () => {
    teardown = stableSymbol;
    scheduleOrRunEmit();
  };

  const produce = () => {
    let disposed = false;
    const clientTeardown = clientProduce({
      set: (value) => {
        if (disposed) {
          throw getProducerDisposedError();
        }
        set(value);
      },
      err: (error) => {
        if (disposed) {
          throw getProducerDisposedError();
        }
        disposed = true;
        err(error);
      },
      dispose: () => {
        if (disposed) {
          throw getProducerDisposedError();
        }
        disposed = true;
        dispose();
      },
    });
    teardown = () => {
      disposed = true;
      teardown = idleSymbol;
      if (clientTeardown) {
        runClientCallback(clientTeardown, voidSymbol);
      }
    };
  };

  return Object.assign(
    (subscriber: Consumer<Value, Error> = {}) => {
      dirtySubscribers.set(subscriber, voidSymbol);
      if (!emitting) {
        scheduleOrRunEmit();
      }

      return () => {
        if (
          !(
            cleanSubscribers.delete(subscriber) ||
            dirtySubscribers.delete(subscriber)
          )
        ) {
          throw new Error(
            "You cannot unsubscribe from an async variable if you have already unsubscribed, or if the subscriber has been `err`-ed or `dispose`-d."
          );
        }
        if (!emitting) {
          scheduleOrRunEmit();
        }
      };
    },
    {
      [asyncVarSymbol]: true as const,
    }
  );
};
