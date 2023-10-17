import { createEffect, pull, push } from "./reactivity";
import { onDispose } from "./scope";

const voidSymbol = Symbol("voidSymbol");

export type Publisher<Value, Error> = [
  resolve: (value: Value) => void,
  reject: (error: Error) => void
];

export type Subscriber<Value, Error> = [Error] extends [never] // About square brackets: https://www.typescriptlang.org/docs/handbook/2/conditional-types.html#distributive-conditional-types
  ? [resolve?: (value: Value) => void]
  : [
      resolve: ((value: Value) => void) | undefined,
      reject: (error: Error) => void
    ];

export interface LazyPromise<Value, Error> {
  (...subscriber: Subscriber<Value, Error>): void;
}

export const createLazyPromise = <Value, Error>(
  produce: (...publisher: Publisher<Value, Error>) => void
): LazyPromise<Value, Error> => {
  let value: Value | typeof voidSymbol = voidSymbol;
  let error: Error | typeof voidSymbol = voidSymbol;

  const lazyReaction = () => {
    produce(
      (newValue) => {
        value = newValue;
        push(lazyReaction);
      },
      (newError) => {
        error = newError;
        push(lazyReaction);
      }
    );
    // Let error object be garbage-collected when the lazy promise rejects but
    // the client retains a reference to it.
    onDispose(() => {
      error = voidSymbol;
    });
  };

  return ((resolve, reject) => {
    // Retry when the client re-subscribes.
    error = voidSymbol;
    createEffect(() => {
      if (value !== voidSymbol) {
        resolve?.(value);
      } else if (error !== voidSymbol) {
        if (reject) {
          reject(error);
        } else {
          throw error;
        }
      } else {
        pull(lazyReaction);
      }
    });
  }) as LazyPromise<Value, Error>;
};
