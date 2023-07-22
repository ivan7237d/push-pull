import { AsyncVar, Consumer, createAsyncVar } from "./createAsyncVar";

/**
 * Used as a key to nominally type async constants.
 */
declare const asyncConstSymbol: unique symbol;

export interface AsyncConst<Value, Error> extends AsyncVar<Value, Error> {
  [asyncConstSymbol]: true;
}

export const createAsyncConst = <Value, Error>(
  produce: (publisher: Required<Consumer<Value, Error>>) => (() => void) | void
): AsyncConst<Value, Error> =>
  createAsyncVar(({ set, err, dispose }) => {
    let valueExists = false;
    return produce({
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
  }) as AsyncConst<Value, Error>;
