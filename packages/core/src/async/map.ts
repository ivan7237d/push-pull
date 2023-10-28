import { LazyPromise, createLazyPromise, isLazyPromise } from "./lazyPromise";

export const map =
  <Value, NewValue, NewError = never>(
    callback: (value: Value) => NewValue | LazyPromise<NewValue, NewError>
  ) =>
  <Error>(
    source: LazyPromise<Value, Error>
  ): LazyPromise<NewValue, Error | NewError> =>
    createLazyPromise((resolve, reject) => {
      source((value) => {
        const returnValue = callback(value);
        if (isLazyPromise(returnValue)) {
          returnValue(resolve, reject);
        } else {
          resolve(returnValue);
        }
      }, reject);
    });
