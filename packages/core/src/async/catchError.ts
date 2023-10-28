import { LazyPromise, createLazyPromise, isLazyPromise } from "./lazyPromise";

export const catchError =
  <Error, FixValue, FixError = never>(
    callback: (error: Error) => FixValue | LazyPromise<FixValue, FixError>
  ) =>
  <Value>(
    source: LazyPromise<Value, Error>
  ): LazyPromise<Value | FixValue, FixError> =>
    createLazyPromise((resolve, reject) => {
      source(resolve, (error) => {
        const fix = callback(error);
        if (isLazyPromise(fix)) {
          fix(resolve, reject);
        } else {
          resolve(fix);
        }
      });
    });
