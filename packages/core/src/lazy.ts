import { LazyPromise, createLazyPromise } from "./lazyPromise";
import { onDispose } from "./scope";

export const lazy = <T>(
  callback: (abortSignal: AbortSignal) => PromiseLike<T>
): LazyPromise<T, unknown> =>
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
