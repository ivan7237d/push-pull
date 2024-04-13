import { createScope, runInScope } from "../scope";
import { LazyPromise } from "./lazyPromise";

export const eager = <Value>(
  lazyPromise: LazyPromise<Value, unknown>
): Promise<Value> =>
  new Promise((resolve, reject) => {
    runInScope(undefined, () => {
      runInScope(createScope(reject), () => {
        lazyPromise(resolve, reject);
      });
    });
  });
