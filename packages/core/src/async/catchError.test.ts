import { label } from "@1log/core";
import { readLog } from "@1log/jest";
import { pipe } from "pipe-function";
import { createScope, runInScope } from "../scope";
import { log } from "../setupTests";
import { catchError } from "./catchError";
import { createLazyPromise } from "./lazyPromise";

test("return a non-promise", () => {
  // $ExpectType LazyPromise<"value" | "fix value", never>
  const promise = pipe(
    createLazyPromise<"value", "oops">((_, reject) => {
      reject("oops");
    }),
    catchError(() => "fix value" as const)
  );
  runInScope(createScope(), () => {
    promise(log.add(label("resolve")));
  });
  expect(readLog()).toMatchInlineSnapshot(`> [resolve] "fix value"`);
});

test("return a promise", () => {
  // $ExpectType LazyPromise<"value" | "fix value", "fix error">
  const promise = pipe(
    createLazyPromise<"value", "oops">((_, reject) => {
      reject("oops");
    }),
    catchError(() =>
      createLazyPromise<"fix value", "fix error">((resolve) => {
        resolve("fix value");
      })
    )
  );
  runInScope(createScope(), () => {
    promise(log.add(label("resolve")));
  });
  expect(readLog()).toMatchInlineSnapshot(`> [resolve] "fix value"`);
});

test("re-throw the error", () => {
  // $ExpectType LazyPromise<"value", "oops">
  const promise = pipe(
    createLazyPromise<"value", "oops">((_, reject) => {
      reject("oops");
    }),
    catchError((error) =>
      createLazyPromise<never, typeof error>((_, reject) => {
        reject(error);
      })
    )
  );
  runInScope(createScope(), () => {
    promise(undefined, log.add(label("reject")));
  });
  expect(readLog()).toMatchInlineSnapshot(`> [reject] "oops"`);
});

test("no error", () => {
  // $ExpectType LazyPromise<"value" | "fix value", never>
  const promise = pipe(
    createLazyPromise<"value", "oops">((resolve) => {
      resolve("value");
    }),
    catchError(() => "fix value" as const)
  );
  runInScope(createScope(), () => {
    promise(log.add(label("resolve")));
  });
  expect(readLog()).toMatchInlineSnapshot(`> [resolve] "value"`);
});
