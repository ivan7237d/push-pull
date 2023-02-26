const asyncSymbol = Symbol("asyncSymbol");

type Subscriber<T> = [set?: (value: T) => void, err?: (error: unknown) => void];

export interface Async<T> {
  (...args: Subscriber<T>): () => void;
  [asyncSymbol]: true;
}

export const isAsync = (arg: unknown): arg is Async<unknown> =>
  typeof arg === "object" && arg !== null && asyncSymbol in arg;

const voidSymbol = Symbol("voidSymbol");

export class AbortSetError extends Error {}

export const createAsync = <T>(
  callback: (
    set: (arg: T) => void,
    err: (arg: unknown) => void
  ) => (() => void) | void
) => {
  let unsubscribe: (() => void) | void | undefined | typeof voidSymbol =
    voidSymbol;
  let value: T | typeof voidSymbol = voidSymbol;
  let subscribers = new Set<Subscriber<T>>();
  let processingValue = false;

  const set = (newValue: T) => {
    if (subscribers.size === 0) {
      throw new Error("Called set when not subscribed.");
    }
    if (newValue === value) {
      return;
    }
    value = newValue;
    const syncReentry = processingValue;
    processingValue = true;
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
    processingValue = false;
    if (syncReentry) {
      throw new AbortSetError(
        "Will abort processing a value of an async variable because it has a newer value."
      );
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
    const syncReentry = processingValue;
    processingValue = false;
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
      throw new AbortSetError(
        "Will abort processing a value of an async variable because it has erred."
      );
    }
  };

  const subscribe = (...subscriber: Subscriber<T>) => {
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
      if (
        subscribers.delete(subscriber) &&
        unsubscribe !== voidSymbol &&
        subscribers.size === 0
      ) {
        const unsubscribeSnapshot = unsubscribe;
        unsubscribe = voidSymbol;
        value = voidSymbol;
        unsubscribeSnapshot?.();
      }
    };
  };

  return Object.assign(subscribe, { [asyncSymbol]: true as const });
};

declare const asyncConstSymbol: unique symbol;

export interface AsyncConst<T> extends Async<T> {
  [asyncConstSymbol]: true;
}

const noOp = () => {};

export const createAsyncConst = <T>(
  callback: (
    set: (arg: T) => void,
    err: (arg: unknown) => void
  ) => (() => void) | void
) => {
  let unsubscribe: (() => void) | void | undefined | typeof voidSymbol =
    voidSymbol;
  let value: T | undefined;
  let subscribers: Set<Subscriber<T>> | undefined = new Set();

  const set = (newValue: T) => {
    if (subscribers === undefined) {
      throw new Error(
        "Tried setting value of an async constant that already has a value."
      );
    }
    if (subscribers.size === 0) {
      throw new Error(
        "Tried setting value of an async constant that has no subscribers."
      );
    }
    unsubscribe = voidSymbol;
    value = newValue;
    const subscribersSnapshot = subscribers;
    subscribers = undefined;
    for (const [set] of subscribersSnapshot) {
      if (set) {
        try {
          set(value);
        } catch (error) {
          setTimeout(() => {
            throw error;
          });
        }
      }
    }
  };

  const err = (error: unknown) => {
    if (subscribers === undefined) {
      throw new Error(
        "Tried erring an async constant that already has a value."
      );
    }
    if (subscribers.size === 0) {
      throw new Error(
        "Tried erring an async constant that has no subscribers."
      );
    }
    unsubscribe = voidSymbol;
    value = undefined;
    const subscribersSnapshot = subscribers;
    subscribers = undefined;
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
  };

  const subscribe = (...subscriber: Subscriber<T>) => {
    if (subscribers === undefined) {
      const [set] = subscriber;
      set?.(value as T);
      return noOp;
    }

    subscribers.add(subscriber);
    if (unsubscribe === voidSymbol && subscribers.size === 1) {
      try {
        unsubscribe = callback(set, err);
      } catch (error) {
        subscribers.delete(subscriber);
        throw error;
      }
    }

    return () => {
      if (
        subscribers !== undefined &&
        subscribers.delete(subscriber) &&
        unsubscribe !== voidSymbol &&
        subscribers.size === 0
      ) {
        const unsubscribeSnapshot = unsubscribe;
        unsubscribe = voidSymbol;
        unsubscribeSnapshot?.();
      }
    };
  };

  return Object.assign(subscribe, {
    [asyncSymbol]: true as const,
  }) as AsyncConst<T>;
};
