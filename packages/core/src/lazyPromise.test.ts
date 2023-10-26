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
