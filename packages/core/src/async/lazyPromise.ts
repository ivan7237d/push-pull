import { createEffect, pull, push } from "../reactivity";

const lazyPromiseSymbol = Symbol("lazyPromise");
const resolvedSymbol = Symbol("resolved");
const rejectedSymbol = Symbol("rejected");

export interface LazyPromise<Value, Error = never> {
  (resolve?: (value: Value) => void, reject?: (error: Error) => void): void;
  [lazyPromiseSymbol]: true;
}

export const createLazyPromise = <Value, Error = never>(
  produce: (
    resolve: (value: Value) => void,
    reject: (error: Error) => void
  ) => void
): LazyPromise<Value, Error> => {
  let status: undefined | typeof resolvedSymbol | typeof rejectedSymbol;
  let result: undefined | Value | Error;

  const lazyReaction = () => {
    produce(
      (value) => {
        result = value;
        status = resolvedSymbol;
        push(lazyReaction);
      },
      (error) => {
        result = error;
        status = rejectedSymbol;
        push(lazyReaction);
      }
    );
  };

  const lazyPromise = (
    resolve?: (value: Value) => void,
    reject?: (error: Error) => void
  ) => {
    createEffect(() => {
      if (!status) {
        pull(lazyReaction);
      }
      if (status === resolvedSymbol) {
        resolve?.(result as Value);
      } else if (status === rejectedSymbol) {
        if (reject) {
          reject(result as Error);
        } else {
          throw result;
        }
      }
    });
  };
  lazyPromise[lazyPromiseSymbol] = true as const;
  return lazyPromise;
};

export const isLazyPromise = (
  value: unknown
): value is LazyPromise<unknown, unknown> =>
  typeof value === "function" && lazyPromiseSymbol in value;

export const never = (() => {}) as LazyPromise<never, never>;
never[lazyPromiseSymbol] = true;
