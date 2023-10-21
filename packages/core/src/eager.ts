import { LazyPromise } from "./lazyPromise";

export const eager = <Value>(
  lazyPromise: LazyPromise<Value, unknown>
): Promise<Value> =>
  new Promise((resolve, reject) => {
    lazyPromise(resolve, reject);
  });
