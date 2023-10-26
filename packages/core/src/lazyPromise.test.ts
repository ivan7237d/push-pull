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

test("types: erroring promise", () => {
  const promise = createLazyPromise<string, number>(() => {});
  runInScope(createScope(), () => {
    promise(
      (value) => {
        // $ExpectType string
        value;
      },
      (error) => {
        // $ExpectType number
        error;
      }
    );

    // Resolve callback can be omitted.
    promise(undefined, () => {});

    // @ts-expect-error No error handler provided, so we get "Expected 2
    // arguments, but got 1".
    promise(() => {});
  });
});

test("types: non-erroring promise", () => {
  // Error type defaults to `never`.
  // $ExpectType LazyPromise<string, never>
  const promise = createLazyPromise<string>(() => {});
  runInScope(createScope(), () => {
    // No error handler required if error type is `never`.
    promise(() => {});
    promise(() => {}, undefined);
    promise(undefined);
    promise();

    promise(
      () => {},
      // @ts-expect-error Error handler will never be run, so we get "Argument
      // of type '() => void' is not assignable to parameter of type
      // 'undefined'".
      () => {}
    );
  });
});
