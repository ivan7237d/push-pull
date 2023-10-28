import { label } from "@1log/core";
import { readLog } from "@1log/jest";
import { pipe } from "pipe-function";
import { createScope, runInScope } from "../scope";
import { log } from "../setupTests";
import { createLazyPromise } from "./lazyPromise";
import { map } from "./map";

test("map to a value", () => {
  // $ExpectType LazyPromise<string, "oops">
  const promise = pipe(
    createLazyPromise<"value", "oops">((resolve) => {
      resolve("value");
    }),
    map((value) => `mapped ${value}`)
  );
  runInScope(createScope(), () => {
    promise(log.add(label("resolve")));
  });
  expect(readLog()).toMatchInlineSnapshot(`> [resolve] "mapped value"`);
});

// TODO: more tests
