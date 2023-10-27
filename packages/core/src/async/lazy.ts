import { onDispose } from "../scope";
import { LazyPromise, createLazyPromise } from "./lazyPromise";

// DOMException was only made a global in Node v17.0.0. We use this constant to
// support Node 16.
const DOMException =
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  globalThis.DOMException ??
  (() => {
    try {
      atob("~");
    } catch (err) {
      return Object.getPrototypeOf(err).constructor;
    }
  })();

export const lazy = <Value>(
  callback: (abortSignal: AbortSignal) => PromiseLike<Value>
): LazyPromise<Value, unknown> =>
  createLazyPromise((resolve, reject) => {
    const abortController = new AbortController();
    onDispose(() => {
      abortController.abort(
        new DOMException(
          "The lazy promise no longer has any subscribers.",
          "AbortError"
        )
      );
    });
    callback(abortController.signal).then(resolve, (error) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        reject(error);
      }
    });
  });
