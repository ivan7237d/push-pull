import { label } from "@1log/core";
import { readLog } from "@1log/jest";
import { createMemo } from "./memo";
import { createEffect } from "./reactivity";
import { createScope, runInScope } from "./scope";
import { log, logFunction } from "./setupTests";
import { createSignal } from "./signal";

test("memo", () => {
  runInScope(() => {
    const [signal, setSignal] = createSignal(0);
    const memo = createMemo(logFunction("memo", () => signal() > 5));
    expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
    createEffect(() => {
      log.add(label("effect"))(memo());
    });
    expect(readLog()).toMatchInlineSnapshot(`
      > [memo] [call 1]
      > [memo] [1] [return] false
      > [effect] false
    `);
    setSignal(1);
    expect(readLog()).toMatchInlineSnapshot(`
      > [memo] [call 2]
      > [memo] [2] [return] false
    `);
    setSignal(6);
    expect(readLog()).toMatchInlineSnapshot(`
      > [memo] [call 3]
      > [memo] [3] [return] true
      > [effect] true
    `);
  }, createScope());
});
