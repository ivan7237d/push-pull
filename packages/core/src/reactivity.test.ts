/**
 * More tests in solidTests/.
 */

import { label } from "@1log/core";
import { readLog } from "@1log/jest";
import { batch, createEffect, pull, push } from "./reactivity";
import { createScope, runInScope } from "./scope";
import { log } from "./setupTests";
import { createSignal } from "./signal";

test("owner effect is run before child effect", () => {
  const [x, setX] = createSignal(0);
  const f = () => x() * 2;

  runInScope(createScope(), () => {
    createEffect(() => {
      log("outer effect");
      createEffect(() => {
        log("inner effect");
        pull(f);
      });
      pull(f);
    });
  });

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
    createScope((error) => log.add(label("error handler"))(error)),
    () => {
      createEffect(() => {
        pull(b);
      });
    }
  );
  expect(readLog()).toMatchInlineSnapshot(`> [error handler] "oops"`);
});

test("error handling: catching error thrown by pull", () => {
  const a = () => {
    throw "oops";
  };
  const b = {};
  runInScope(createScope(), () => {
    createEffect(() => {
      log("effect");
      expect(() => pull(a)).toThrowErrorMatchingInlineSnapshot(`undefined`);
      pull(b);
    });
  });
  expect(readLog()).toMatchInlineSnapshot(`> "effect"`);
  push(a);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
  push(b);
  expect(readLog()).toMatchInlineSnapshot(`> "effect"`);
});

test("batch: effects are deferred, return value", () => {
  const subject = {};
  runInScope(createScope(), () => {
    createEffect(() => {
      pull(subject);
      log("effect");
    });
  });
  readLog();
  expect(
    batch(() => {
      push(subject);
      expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
      return 1;
    })
  ).toMatchInlineSnapshot(`1`);
  expect(readLog()).toMatchInlineSnapshot(`> "effect"`);
});

test("batch: disposals are deferred", () => {
  const reaction = () => {
    log("reaction");
    return 1;
  };
  batch(() => {
    pull(reaction);
    // Since disposals are deferred, this will not make the reaction re-run.
    pull(reaction);
  });
  expect(readLog()).toMatchInlineSnapshot(`> "reaction"`);
});

test("batch: reactions are run as-needed", () => {
  const subject = { value: 1 };
  const a = () => log.add(label("reaction a"))((pull(subject), subject.value));
  const b = () => log.add(label("reaction b"))(pull(a) * 10);
  const c = () => log.add(label("reaction c"))(pull(a) * 100);
  runInScope(createScope(), () => {
    createEffect(() => {
      pull(b);
      pull(c);
    });
  });
  expect(readLog()).toMatchInlineSnapshot(`
    > [reaction a] 1
    > [reaction b] 10
    > [reaction c] 100
  `);
  batch(() => {
    subject.value = 2;
    push(subject);
    expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
    pull(b);
    expect(readLog()).toMatchInlineSnapshot(`
      > [reaction a] 2
      > [reaction b] 20
    `);
  });
  expect(readLog()).toMatchInlineSnapshot(`> [reaction c] 200`);
});
