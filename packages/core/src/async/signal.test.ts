import { label } from "@1log/core";
import { readLog } from "@1log/jest";
import { createScope, runInScope } from "../scope";
import { log } from "../setupTests";
import { createSignal } from "../signal";
import { createLazyPromise } from "./lazyPromise";

test("signals are tracked in promise callbacks", () => {
  const [signal, setSignal] = createSignal(0);
  let resolve: (value: string) => void;
  const promise = createLazyPromise<string>((newResolve) => {
    log("produce");
    resolve = newResolve;
  });
  runInScope(createScope(), () => {
    promise(() => {
      log.add(label("signal"))(signal());
    });
  });
  expect(readLog()).toMatchInlineSnapshot(`> "produce"`);
  resolve!("");
  expect(readLog()).toMatchInlineSnapshot(`> [signal] 0`);
  setSignal(1);
  expect(readLog()).toMatchInlineSnapshot(`> [signal] 1`);
});
