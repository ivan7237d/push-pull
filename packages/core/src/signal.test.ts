import { label } from "@1log/core";
import { readLog } from "@1log/jest";
import { createEffect } from "./reactivity";
import { log } from "./setupTests";
import { createSignal } from "./signal";

test("signal", () => {
  const [signal, setSignal] = createSignal(0);
  createEffect(() => {
    log.add(label("effect"))(signal());
  });
  expect(readLog()).toMatchInlineSnapshot(`> [effect] 0`);
  setSignal(1);
  expect(readLog()).toMatchInlineSnapshot(`> [effect] 1`);
  setSignal(1);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
});
