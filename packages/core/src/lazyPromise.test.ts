import { label } from "@1log/core";
import { readLog } from "@1log/jest";
import { createLazyPromise } from "./lazyPromise";
import { createScope, runInScope } from "./scope";
import { log } from "./setupTests";

test("resolve", () => {
  let resolve: (value: string) => void;
  const promise = createLazyPromise<string>((newResolve) => {
    resolve = newResolve;
  });
  runInScope(createScope(), () => {
    promise(log.add(label("resolve")));
  });
  resolve!("value");
  expect(readLog()).toMatchInlineSnapshot(`> [resolve] "value"`);
});

test("reject", () => {
  let reject: (value: string) => void;
  const promise = createLazyPromise<unknown, string>((_, newReject) => {
    reject = newReject;
  });
  runInScope(createScope(), () => {
    promise(undefined, log.add(label("reject")));
  });
  reject!("oops");
  expect(readLog()).toMatchInlineSnapshot(`> [reject] "oops"`);
});

test("types", () => {
  const erroringPromise = createLazyPromise<string, number>(() => {});
  erroringPromise(
    (value) => {
      // $ExpectType string
      value;
    },
    (error) => {
      // $ExpectType number
      error;
    }
  );
  // @ts-expect-error No error handler provided, so we get "Expected 2
  // arguments, got 1".
  erroringPromise(() => {});

  // Error type defaults to `never`.
  // $ExpectType LazyPromise<string, never>
  const nonErroringPromise = createLazyPromise<string>(() => {});
  // No error handler required if error type is `never`.
  nonErroringPromise(() => {});
});
