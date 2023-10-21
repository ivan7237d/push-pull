import { label } from "@1log/core";
import { readLog } from "@1log/jest";
import { createEffect } from "./reactivity";
import { createScope, runInScope } from "./scope";
import { log } from "./setupTests";
import { createSignal } from "./signal";

test("signal", () => {
  const [signal, setSignal] = createSignal(0);
  expect(signal()).toMatchInlineSnapshot(`0`);
  runInScope(createScope(), () => {
    createEffect(() => {
      log.add(label("effect"))(signal());
    });
  });
  expect(readLog()).toMatchInlineSnapshot(`> [effect] 0`);
  setSignal(1);
  expect(readLog()).toMatchInlineSnapshot(`> [effect] 1`);
  setSignal(1);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
});
