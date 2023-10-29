import { label } from "@1log/core";
import { readLog } from "@1log/jest";
import { createScope, runInScope } from "../scope";
import { log } from "../setupTests";
import { createSignal } from "../signal";
import { createLazyPromise } from "./lazyPromise";

test("signals are tracked in promise callbacks", () => {
  const [x, setX] = createSignal(0);
  let resolve: (value: string) => void;
  const promise = createLazyPromise<string>((newResolve) => {
    log("produce");
    resolve = newResolve;
  });
  runInScope(createScope(), () => {
    promise(() => {
      log.add(label("signal"))(x());
    });
  });
  expect(readLog()).toMatchInlineSnapshot(`> "produce"`);
  resolve!("");
  expect(readLog()).toMatchInlineSnapshot(`> [signal] 0`);
  setX(1);
  expect(readLog()).toMatchInlineSnapshot(`> [signal] 1`);
});
