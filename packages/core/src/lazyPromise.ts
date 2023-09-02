const voidSymbol = Symbol("voidSymbol");

export type Publisher = {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

export type Subscriber = {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

export interface LazyPromise {
  (subscriber: Subscriber): () => void;
}

export const createLazyPromise = (
  produce: (publisher: Publisher) => () => void
): LazyPromise => {
  let status: "idle" | "pending" | "resolved" | "rejected" = "idle";
  let value: unknown;
  let error: unknown;
  let teardown: (() => void) | undefined;
  const subscribers = new Set<Subscriber>();

  return (subscriber) => {
    if (status === "resolved") {
      subscriber.resolve(value);
    } else {
      subscribers.add(subscriber);
      if (status !== "pending") {
        status satisfies "idle" | "rejected";
        error = undefined;
        status = "pending";
        const teardownCanditate = produce({});
      }
    }
    throw "oops";
  };
};

export const map =
  (project: (value: unknown) => LazyPromise) => (from: LazyPromise) =>
    createLazyPromise(({ resolve, reject }) => {
      const unsubscribeFrom = from({
        resolve: () => {},
        reject: () => {},
      });
      return () => {};
    });
