import { voidSymbol } from "./utils";

/**
 * Used as a key to nominally type async variables.
 */
const asyncSymbol = Symbol("asyncSymbol");

export interface Subscriber<T> {
  set?: (value: T) => void;
  err?: (error: unknown) => void;
  dispose?: () => void;
}

export interface AsyncVar<T> {
  (subscriber?: Subscriber<T>): () => void;
  [asyncSymbol]: true;
}

export const isAsync = (arg: unknown): arg is AsyncVar<unknown> =>
  typeof arg === "object" && arg !== null && asyncSymbol in arg;

const getCallbackOrderError = () =>
  new Error(
    "You cannot call `set`, `err` and `dispose` handles passed to a producer function after you've called `err` or `dispose`, or after the teardown function has been called."
  );

export const createAsyncVar = <T>(
  callback: (subscriber: Required<Subscriber<T>>) => (() => void) | void
) => {
  let value: T | typeof voidSymbol = voidSymbol;
  let error: unknown = voidSymbol;
  let stable = false;
  let unsubscribe: (() => void) | undefined | typeof voidSymbol = voidSymbol;
  const cleanSubscribers = new Set<Subscriber<T>>();
  const dirtySubscribers = new Map<Subscriber<T>, T | typeof voidSymbol>();
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
    unsubscribe = voidSymbol;
    maybeQueueMicrotask();
  };

  const dispose = () => {
    stable = true;
    unsubscribe = voidSymbol;
    maybeQueueMicrotask();
  };

  const subscribe = (subscriber: Subscriber<T> = {}) => {
    dirtySubscribers.set(subscriber, voidSymbol);
    if (unsubscribe === voidSymbol) {
      unsubscribe = undefined;
    }
    maybeQueueMicrotask();

    return () => {
      if (
        (cleanSubscribers.delete(subscriber) ||
          dirtySubscribers.delete(subscriber)) &&
        cleanSubscribers.size === 0 &&
        dirtySubscribers.size === 0
      ) {
        if (unsubscribe === undefined) {
          unsubscribe = voidSymbol;
        }
        maybeQueueMicrotask();
      }
    };
  };

  const runCallbacks = () => {
    try {
      callbackLoop: while (true) {
        if (unsubscribe === undefined) {
          if (value !== voidSymbol) {
            for (const subscriber of cleanSubscribers) {
              dirtySubscribers.set(subscriber, value);
            }
            cleanSubscribers.clear();
            value = voidSymbol;
          }
          let disposed = false;
          const clientUnsubscribe = callback({
            set: (value) => {
              if (disposed) {
                throw getCallbackOrderError();
              }
              set(value);
            },
            err: (error) => {
              if (disposed) {
                throw getCallbackOrderError();
              }
              disposed = true;
              err(error);
            },
            dispose: () => {
              if (disposed) {
                throw getCallbackOrderError();
              }
              disposed = true;
              dispose();
            },
          });
          unsubscribe = () => {
            disposed = true;
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            clientUnsubscribe?.();
          };
        }

        for (const [
          subscriber,
          subscriberValue,
        ] of dirtySubscribers.entries()) {
          dirtySubscribers.delete(subscriber);
          if (
            unsubscribe === voidSymbol ||
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
          if (unsubscribe === undefined) {
            continue callbackLoop;
          }
        }

        if (stable) {
          for (const subscriber of cleanSubscribers) {
            cleanSubscribers.delete(subscriber);
            subscriber.dispose?.();
          }
        } else if (unsubscribe === voidSymbol) {
          for (const subscriber of cleanSubscribers) {
            cleanSubscribers.delete(subscriber);
            if (subscriber.err) {
              subscriber.err(error);
            } else {
              throw error;
            }
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (unsubscribe === undefined) {
              continue callbackLoop;
            }
          }
        } else if (cleanSubscribers.size === 0) {
          const unsubscribeSnapshot = unsubscribe;
          unsubscribe = voidSymbol;
          unsubscribeSnapshot();
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (unsubscribe === undefined) {
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
