import { label } from "@1log/core";
import { readLog } from "@1log/jest";
import { createEffect } from "./reactivity";
import { createScope, runInScope } from "./scope";
import { log } from "./setupTests";
import { createSignal } from "./signal";

test("signal", () => {
  const [x, setX] = createSignal(0);
  expect(x()).toMatchInlineSnapshot(`0`);
  runInScope(createScope(), () => {
    createEffect(() => {
      log.add(label("effect"))(x());
    });
  });
  expect(readLog()).toMatchInlineSnapshot(`> [effect] 0`);
  setX(1);
  expect(readLog()).toMatchInlineSnapshot(`> [effect] 1`);
  setX(1);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
});
