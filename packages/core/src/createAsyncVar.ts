import { voidSymbol } from "./utils";

/**
 * Used as a key to nominally type async variables.
 */
const asyncSymbol = Symbol("asyncSymbol");

export interface Consumer<T> {
  set?: (value: T) => void;
  err?: (error: unknown) => void;
  dispose?: () => void;
}

export interface AsyncVar<T> {
  (subscriber?: Consumer<T>): () => void;
  [asyncSymbol]: true;
}

export const isAsync = (arg: unknown): arg is AsyncVar<unknown> =>
  typeof arg === "object" && arg !== null && asyncSymbol in arg;

const getProducerDisposedError = () =>
  new Error(
    "You cannot call `set`, `err` and `dispose` publisher functions (the handles passed by `createAsyncVar` to its callback) after you've called `err` or `dispose`, or after the teardown function has been called."
  );

export const createAsyncVar = <T>(
  produce: (publisher: Required<Consumer<T>>) => (() => void) | void
) => {
  let value: T | typeof voidSymbol = voidSymbol;
  let error: unknown = voidSymbol;
  let stable = false;
  let teardown: (() => void) | undefined | typeof voidSymbol = voidSymbol;
  const cleanSubscribers = new Set<Consumer<T>>();
  const dirtySubscribers = new Map<Consumer<T>, T | typeof voidSymbol>();
  let microtaskQueued = false;

  const set = (clientValue: T) => {
    if (clientValue !== value) {
      for (const subscriber of cleanSubscribers) {
        dirtySubscribers.set(subscriber, value);
      }
      cleanSubscribers.clear();
      value = clientValue;
      maybeQueueMicrotask();
    }
  };

  const err = (clientError: unknown) => {
    error = clientError;
    teardown = voidSymbol;
    maybeQueueMicrotask();
  };

  const dispose = () => {
    stable = true;
    teardown = voidSymbol;
    maybeQueueMicrotask();
  };

  const subscribe = (subscriber: Consumer<T> = {}) => {
    dirtySubscribers.set(subscriber, voidSymbol);
    if (teardown === voidSymbol) {
      teardown = undefined;
    }
    maybeQueueMicrotask();

    return () => {
      if (
        (cleanSubscribers.delete(subscriber) ||
          dirtySubscribers.delete(subscriber)) &&
        cleanSubscribers.size === 0 &&
        dirtySubscribers.size === 0
      ) {
        if (teardown === undefined) {
          teardown = voidSymbol;
        }
        maybeQueueMicrotask();
      }
    };
  };

  const runCallbacks = () => {
    try {
      callbackLoop: while (true) {
        if (teardown === undefined) {
          if (value !== voidSymbol) {
            for (const subscriber of cleanSubscribers) {
              dirtySubscribers.set(subscriber, value);
            }
            cleanSubscribers.clear();
            value = voidSymbol;
          }
          let disposed = false;
          const clientTeardown = produce({
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
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            clientTeardown?.();
          };
        }

        for (const [
          subscriber,
          subscriberValue,
        ] of dirtySubscribers.entries()) {
          dirtySubscribers.delete(subscriber);
          if (
            teardown === voidSymbol ||
            (value === voidSymbol && subscriberValue !== voidSymbol)
          ) {
            if (subscriber.err) {
              subscriber.err(error);
            } else {
              throw error;
            }
          } else {
            cleanSubscribers.add(subscriber);
            if (subscriberValue !== value && value !== voidSymbol) {
              subscriber.set?.(value);
            }
          }
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (teardown === undefined) {
            continue callbackLoop;
          }
        }

        if (stable) {
          for (const subscriber of cleanSubscribers) {
            cleanSubscribers.delete(subscriber);
            subscriber.dispose?.();
          }
        } else if (teardown === voidSymbol) {
          for (const subscriber of cleanSubscribers) {
            cleanSubscribers.delete(subscriber);
            if (subscriber.err) {
              subscriber.err(error);
            } else {
              throw error;
            }
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (teardown === undefined) {
              continue callbackLoop;
            }
          }
        } else if (cleanSubscribers.size === 0) {
          const unsubscribeSnapshot = teardown;
          teardown = voidSymbol;
          unsubscribeSnapshot();
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (teardown === undefined) {
            continue callbackLoop;
          }
        }
        error = voidSymbol;
        break callbackLoop;
      }
      microtaskQueued = false;
    } finally {
      // If an error was thrown, let it propagate, but continue calling
      // remaining callbacks. Dev tools will be able to pause at the place the
      // error was thrown when the user switches on "Pause on uncaught
      // exceptions", yet one bad subscriber will not break other subscribers.
      if (microtaskQueued) {
        queueMicrotask(runCallbacks);
      }
    }
  };

  const maybeQueueMicrotask = () => {
    if (microtaskQueued) {
      return;
    }
    microtaskQueued = true;
    queueMicrotask(runCallbacks);
  };

  return Object.assign(subscribe, { [asyncSymbol]: true as const });
};
