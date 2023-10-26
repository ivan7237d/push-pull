import { createEffect, pull, push } from "./reactivity";

const voidSymbol = Symbol("voidSymbol");

export type Publisher<Value, Error = never> = [
  resolve: (value: Value) => void,
  reject: (error: Error) => void
];

export type Subscriber<Value, Error = never> = [Error] extends [never] // About square brackets: https://www.typescriptlang.org/docs/handbook/2/conditional-types.html#distributive-conditional-types
  ? [resolve?: (value: Value) => void]
  : [
      resolve: ((value: Value) => void) | undefined,
      reject: (error: Error) => void
    ];

export interface LazyPromise<Value, Error = never> {
  (...subscriber: Subscriber<Value, Error>): void;
}

export const createLazyPromise = <Value, Error = never>(
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
  };

  return ((resolve, reject) => {
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
