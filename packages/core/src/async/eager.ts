import { createRootScope, runInScope } from "../scope";
import { LazyPromise } from "./lazyPromise";

export const eager = <Value>(
  lazyPromise: LazyPromise<Value, unknown>
): Promise<Value> =>
  new Promise((resolve, reject) => {
    runInScope(createRootScope(reject), () => {
      lazyPromise(resolve, reject);
    });
  });
