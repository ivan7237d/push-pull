/**
 * Used as a key to nominally type async variables.
 */
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
  const subscribers = new Set<Subscriber<T>>();
  let reentryState: AbortSetError | typeof voidSymbol | undefined = voidSymbol;

  const set = (newValue: T) => {
    if (unsubscribe === voidSymbol) {
      throw new Error(
        "Tried setting value of an async variable when not subscribed."
      );
    }
    if (newValue === value) {
      return;
    }
    value = newValue;
    const isReentry = reentryState === undefined;
    reentryState = undefined;
    try {
      for (const [set] of subscribers) {
        set?.(value);
      }
    } catch (error) {
      if (error !== reentryState) {
        throw error;
      }
    } finally {
      reentryState = voidSymbol;
    }
    if (isReentry) {
      reentryState = new AbortSetError(
        "Will abort processing a value of an async variable because it has a newer value."
      );
      throw reentryState;
    }
  };

  const err = (error: unknown) => {
    if (unsubscribe === voidSymbol) {
      throw new Error("Tried erring an async variable when not subscribed.");
    }
    unsubscribe = voidSymbol;
    value = voidSymbol;
    const isReentry = reentryState === undefined;
    reentryState = voidSymbol;
    for (const subscriber of subscribers) {
      subscribers.delete(subscriber);
      const [, err] = subscriber;
      if (err) {
        err(error);
        if (unsubscribe !== voidSymbol) {
          break;
        }
      } else {
        throw error;
      }
    }
    if (isReentry) {
      reentryState = new AbortSetError(
        "Will abort processing a value of an async variable because it has erred."
      );
      throw reentryState;
    }
  };

  const subscribe = (...subscriber: Subscriber<T>) => {
    subscribers.add(subscriber);
    if (unsubscribe === voidSymbol && subscribers.size > 0) {
      unsubscribe = undefined;
      unsubscribe = callback(set, err);
    } else if (value !== voidSymbol) {
      const [set] = subscriber;
      set?.(value);
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
    if (unsubscribe === voidSymbol) {
      throw new Error(
        "Tried setting value of an async constant when not subscribed."
      );
    }
    unsubscribe = voidSymbol;
    value = newValue;
    const subscribersSnapshot = subscribers;
    subscribers = undefined;
    for (const [set] of subscribersSnapshot) {
      set?.(value);
    }
  };

  const err = (error: unknown) => {
    if (subscribers === undefined) {
      throw new Error(
        "Tried erring an async constant that already has a value."
      );
    }
    if (unsubscribe === voidSymbol) {
      throw new Error("Tried erring an async constant when not subscribed.");
    }
    unsubscribe = voidSymbol;
    value = undefined;
    for (const subscriber of subscribers) {
      subscribers.delete(subscriber);
      const [, err] = subscriber;
      if (err) {
        err(error);
        if (unsubscribe !== voidSymbol) {
          break;
        }
      } else {
        throw error;
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
    if (unsubscribe === voidSymbol && subscribers.size > 0) {
      unsubscribe = undefined;
      unsubscribe = callback(set, err);
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
