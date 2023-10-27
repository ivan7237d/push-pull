import { onDispose } from "../scope";
import { LazyPromise, createLazyPromise } from "./lazyPromise";

export const lazy = <Value>(
  callback: (abortSignal: AbortSignal) => PromiseLike<Value>
): LazyPromise<Value, unknown> =>
  createLazyPromise((resolve, reject) => {
    const abortController = new AbortController();
    onDispose(() => {
      abortController.abort();
    });
    callback(abortController.signal).then(resolve, (error) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        reject(error);
      }
    });
  });
