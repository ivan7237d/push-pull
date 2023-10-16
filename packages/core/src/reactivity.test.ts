/**
 * More tests in solidTests/.
 */

import { readLog } from "@1log/jest";
import { createEffect, pull } from "./reactivity";
import { createScope, runInScope } from "./scope";
import { log } from "./setupTests";
import { createSignal } from "./signal";

test("nested effect", () => {
  const [x, setX] = createSignal(0);
  const f = () => x() * 2;

  runInScope(() => {
    createEffect(() => {
      log("outer effect");
      createEffect(() => {
        log("inner effect");
        pull(f);
      });
      pull(f);
    });
  }, createScope());

  readLog();
  setX(1);
  expect(readLog()).toMatchInlineSnapshot(`
    > "outer effect"
    > "inner effect"
  `);
});
