import { voidSymbol } from "./utils";

/**
 * Used as a key to nominally type async variables.
 */
const asyncSymbol = Symbol("asyncSymbol");

/**
 * A consumer can be of two kinds: a publisher (`Required<Consumer<T>>`) and a
 * subscriber (`Consumer<T>`). A publisher is passed to `createAsyncVar`
 * callback, a consumer is passed to an async var.
 */
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

// interface ProducerContext {
//   (callback: () => void): void;
// }

// let globalProducerContext: ProducerContext | undefined;

export const createAsyncVar: <T>(
  produce: (publisher: Required<Consumer<T>>) => (() => void) | void
) => AsyncVar<T> = <T>(
  clientProduce: (publisher: Required<Consumer<T>>) => (() => void) | void
) => {
  let value: T | typeof voidSymbol = voidSymbol;
  let error: unknown = voidSymbol;
  let stable = false;
  let teardown: (() => void) | undefined | typeof voidSymbol = voidSymbol;
  const cleanSubscribers = new Set<Consumer<T>>();
  const dirtySubscribers = new Map<Consumer<T>, T | typeof voidSymbol>();
  let broadcasting = false;

  const maybeBroadcast = () => {
    if (!broadcasting) {
      broadcasting = true;
      try {
        for (const [
          subscriber,
          subscriberValue,
        ] of dirtySubscribers.entries()) {
          dirtySubscribers.delete(subscriber);
          if (error === voidSymbol) {
            cleanSubscribers.add(subscriber);
            if (value !== voidSymbol && subscriberValue !== value) {
              subscriber.set?.(value);
            }
          } else {
            // Here `value === voidSymbol`.
            if (subscriberValue === voidSymbol && teardown !== voidSymbol) {
              cleanSubscribers.add(subscriber);
            } else {
              if (subscriber.err) {
                subscriber.err(error);
              } else {
                throw error;
              }
            }
          }
        }
        error = voidSymbol;
        if (stable) {
          for (const subscriber of cleanSubscribers) {
            cleanSubscribers.delete(subscriber);
            subscriber.dispose?.();
          }
        }
      } finally {
        broadcasting = false;
      }
    }
  };

  const set = (clientValue: T) => {
    if (clientValue !== value) {
      for (const subscriber of cleanSubscribers) {
        dirtySubscribers.set(subscriber, value);
      }
      cleanSubscribers.clear();
      value = clientValue;
      error = voidSymbol;
      maybeBroadcast();
    }
  };

  const err = (clientError: unknown) => {
    for (const subscriber of cleanSubscribers) {
      dirtySubscribers.set(subscriber, value);
    }
    cleanSubscribers.clear();
    value = voidSymbol;
    error = clientError;
    teardown = voidSymbol;
    maybeBroadcast();
  };

  const dispose = () => {
    stable = true;
    teardown = voidSymbol;
    maybeBroadcast();
  };

  // const maybeTeardown = () => {
  //   if (
  //     !inProducerContext &&
  //     cleanSubscribers.size === 0 &&
  //     dirtySubscribers.size === 0 &&
  //     teardown !== undefined &&
  //     teardown !== voidSymbol
  //   ) {
  //     const teardownSnapshot = teardown;
  //     teardown = voidSymbol;
  //     teardownSnapshot();
  //   }
  // };

  const produce = () => {
    let disposed = false;
    teardown = undefined;
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
    }) as (() => void) | undefined; // Cast void -> undefined.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (teardown === undefined) {
      teardown = () => {
        disposed = true;
        teardown = voidSymbol;
        clientTeardown?.();
      };
    }
  };

  return Object.assign(
    (subscriber: Consumer<T> = {}) => {
      dirtySubscribers.set(subscriber, voidSymbol);
      if (teardown === voidSymbol && !stable) {
        produce();
      }
      maybeBroadcast();

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
        if (
          cleanSubscribers.size === 0 &&
          dirtySubscribers.size === 0 &&
          teardown !== voidSymbol
        ) {
          teardown!();
        }
      };
    },
    {
      [asyncSymbol]: true as const,
    }
  );
};
