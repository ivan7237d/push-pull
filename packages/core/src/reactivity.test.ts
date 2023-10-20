/**
 * More tests in solidTests/.
 */

import { label } from "@1log/core";
import { readLog } from "@1log/jest";
import { createEffect, pull, push } from "./reactivity";
import { createScope, runInScope } from "./scope";
import { log } from "./setupTests";
import { createSignal } from "./signal";

test("owner effect is run before child effect", () => {
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

test("error handling: error in reaction propagates to effect's containing scope", () => {
  const a = () => {
    throw "oops";
  };
  const b = () => {
    pull(a);
  };
  runInScope(
    () => {
      createEffect(() => {
        pull(b);
      });
    },
    createScope((error) => log.add(label("error handler"))(error))
  );
  expect(readLog()).toMatchInlineSnapshot(`> [error handler] "oops"`);
});

test("error handling: catching error thrown by pull", () => {
  const a = () => {
    throw "oops";
  };
  const b = {};
  runInScope(() => {
    createEffect(() => {
      log("effect");
      expect(() => pull(a)).toThrowErrorMatchingInlineSnapshot(`undefined`);
      pull(b);
    });
  }, createScope());
  expect(readLog()).toMatchInlineSnapshot(`> "effect"`);
  push(a);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
  push(b);
  expect(readLog()).toMatchInlineSnapshot(`> "effect"`);
});
