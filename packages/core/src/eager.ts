import { LazyPromise } from "./lazyPromise";
import { createRootScope, runInScope } from "./scope";

export const eager = <Value>(
  lazyPromise: LazyPromise<Value, unknown>
): Promise<Value> =>
  new Promise((resolve, reject) => {
    runInScope(createRootScope(reject), () => {
      lazyPromise(resolve, reject);
    });
  });
