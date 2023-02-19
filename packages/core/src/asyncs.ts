const asyncSymbol = Symbol("asyncSymbol");

type Subscriber<T> = [set?: (value: T) => void, err?: (error: unknown) => void];

export interface Async<T> {
  (...args: Subscriber<T>): () => void;
  [asyncSymbol]: true;
}

export const isAsync = (arg: unknown): arg is Async<unknown> =>
  typeof arg === "object" && arg !== null && asyncSymbol in arg;

// const asyncConstSymbol = Symbol("asyncConstSymbol");

// export interface AsyncConst<T> extends Async<T> {
//   [asyncConstSymbol]: true;
// }

// export const isAsyncConst = (arg: unknown): arg is Async<unknown> =>
//   typeof arg === "object" && arg !== null && asyncConstSymbol in arg;

const voidSymbol = Symbol("voidSymbol");

class AbortSetError extends Error {
  constructor() {
    super(
      "Aborting processing new value because the async variable has a newer value or has erred."
    );
  }
}

const createAsyncWithoutFlattening = <T>(
  callback: (
    set: (arg: T) => void,
    err: (arg: unknown) => void
  ) => (() => void) | void
) => {
  let unsubscribe: (() => void) | void | undefined | typeof voidSymbol =
    voidSymbol;
  let value: T | typeof voidSymbol = voidSymbol;
  let subscribers = new Set<Subscriber<T>>();
  let multicasting = false;

  const set = (newValue: T) => {
    if (subscribers.size === 0) {
      throw new Error("Called set when not subscribed.");
    }
    if (newValue === value) {
      return;
    }
    value = newValue;
    const syncReentry = multicasting;
    multicasting = true;
    for (const [set] of subscribers) {
      if (set) {
        try {
          set(value);
        } catch (error) {
          if (error instanceof AbortSetError) {
            return;
          }
          setTimeout(() => {
            throw error;
          });
        }
      }
    }
    multicasting = false;
    if (syncReentry) {
      throw new AbortSetError();
    }
  };

  const err = (error: unknown) => {
    if (subscribers.size === 0) {
      throw new Error("Called err when not subscribed.");
    }
    unsubscribe = voidSymbol;
    value = voidSymbol;
    const subscribersSnapshot = subscribers;
    subscribers = new Set();
    const syncReentry = multicasting;
    multicasting = false;
    for (const [, err] of subscribersSnapshot) {
      try {
        if (err) {
          err(error);
        } else {
          throw error;
        }
      } catch (error) {
        setTimeout(() => {
          throw error;
        });
      }
    }
    if (syncReentry) {
      throw new AbortSetError();
    }
  };

  return (...subscriber: Subscriber<T>) => {
    subscribers.add(subscriber);
    try {
      if (unsubscribe === voidSymbol && subscribers.size === 1) {
        unsubscribe = callback(set, err);
      } else if (value !== voidSymbol) {
        const [set] = subscriber;
        set?.(value);
      }
    } catch (error) {
      subscribers.delete(subscriber);
      throw error;
    }

    return () => {
      if (!subscribers.delete(subscriber)) {
        throw new Error("Already unsubscribed.");
      }
      if (unsubscribe !== voidSymbol && subscribers.size === 0) {
        const unsubscribeSnapshot = unsubscribe;
        unsubscribe = voidSymbol;
        value = voidSymbol;
        unsubscribeSnapshot?.();
      }
    };
  };
};

export const createAsync = <T>(
  callback: (
    set: (arg: T | Async<T>) => void,
    err: (arg: unknown) => void
  ) => (() => void) | void
): Async<T> => {
  const subscribe = createAsyncWithoutFlattening<T>((set, err) => {
    let unsubscribe: (() => void) | undefined;
    return callback((arg: T | Async<T>) => {
      if (unsubscribe) {
        const unsubscribeSnapshot = unsubscribe;
        unsubscribe = undefined;
        unsubscribeSnapshot();
      }
      if (isAsync(arg)) {
        unsubscribe = arg(set, err);
      } else {
        set(arg);
      }
    }, err);
  });

  return Object.assign(subscribe, { [asyncSymbol]: true as const });
};
