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

const safeCall = (callback: () => void) => {
  try {
    callback();
  } catch (error) {
    setTimeout(() => {
      throw error;
    });
  }
};

const queue: (() => void)[] = [];

let inCallOrEnqueue = false;

const callOrEnqueue = (callback: () => void) => () => {
  queue.push(callback);
  if (inCallOrEnqueue) {
    return;
  }
  inCallOrEnqueue = true;
  let task;
  while ((task = queue.shift())) {
    safeCall(task);
  }
  inCallOrEnqueue = false;
};

export const createAsync = <T>(
  callback: (
    set: (arg: T | Async<T>) => void,
    err: (arg: unknown) => void
  ) => (() => void) | void
): Async<T> => {
  let unsubscribe: (() => void) | void | undefined;
  let unsubscribeInner: (() => void) | undefined;
  let value: T | typeof voidSymbol = voidSymbol;
  const subscribers = new Set<Subscriber<T>>();

  const setInternal = (newValue: T) => {
    value = newValue;
    for (const [set] of subscribers) {
      if (set) {
        safeCall(() => set(newValue));
      }
    }
  };

  const errInternal = (error: unknown) => {
    unsubscribe = undefined;
    unsubscribeInner = undefined;
    value = voidSymbol;
    for (const [, err] of subscribers) {
      safeCall(() => {
        if (err) {
          err(error);
        } else {
          throw error;
        }
      });
    }
    subscribers.clear();
  };

  const setExternal = (arg: T | Async<T>) =>
    callOrEnqueue(() => {
      if (subscribers.size === 0) {
        throw new Error("Called set when not subscribed.");
      }
      if (unsubscribeInner) {
        unsubscribeInner();
        unsubscribeInner = undefined;
      }
      if (isAsync(arg)) {
        unsubscribeInner = arg(setInternal, (error) => {
          if (unsubscribe) {
            safeCall(unsubscribe);
          }
          errInternal(error);
        });
      } else {
        if (arg !== value) {
          setInternal(arg);
        }
      }
    });

  const errExternal = (error: unknown) =>
    callOrEnqueue(() => {
      if (subscribers.size === 0) {
        throw new Error("Called err when not subscribed.");
      }
      unsubscribeInner?.();
      errInternal(error);
    });

  const subscribe = (...subscriber: Subscriber<T>) => {
    callOrEnqueue(() => {
      if (value !== voidSymbol) {
        const [set] = subscriber;
        if (set) {
          safeCall(() => set(value as T));
        }
      }
      if (subscribers.size === 0) {
        safeCall(() => {
          unsubscribe = callback(setExternal, errExternal);
        });
      }
      subscribers.add(subscriber);
    });
    return () =>
      callOrEnqueue(() => {
        subscribers.delete(subscriber);
        if (subscribers.size === 0) {
          value = voidSymbol;
          if (unsubscribeInner) {
            unsubscribeInner();
            unsubscribeInner = undefined;
          }
          if (unsubscribe) {
            safeCall(unsubscribe);
            unsubscribe = undefined;
          }
        }
      });
  };

  return Object.assign(subscribe, { [asyncSymbol]: true as const });
};
