import { AsyncVar, createAsyncVar, Subscriber } from "./createAsyncVar";

/**
 * Used as a key to nominally type async constants.
 */
declare const asyncConstSymbol: unique symbol;

export interface AsyncConst<T> extends AsyncVar<T> {
  [asyncConstSymbol]: true;
}

export const createAsyncConst = <T>(
  callback: (subscriber: Required<Subscriber<T>>) => (() => void) | void
): AsyncConst<T> =>
  createAsyncVar(({ set, err, dispose }) => {
    let valueExists = false;
    return callback({
      set: (value) => {
        if (valueExists) {
          throw new Error(
            "You cannot `set` the value of an async constant that already has a value."
          );
        }
        valueExists = true;
        set(value);
      },
      err,
      dispose,
    });
  }) as AsyncConst<T>;
