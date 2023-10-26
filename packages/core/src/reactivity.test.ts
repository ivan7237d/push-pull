/**
 * More tests in solidTests/.
 */

import { label } from "@1log/core";
import { readLog } from "@1log/jest";
import { batch, createEffect, pull, push } from "./reactivity";
import { createScope, onDispose, runInScope } from "./scope";
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

test("error handling: error in child scope of a lazy reaction", () => {
  const subject = { value: false };
  const reaction = () => {
    log("reaction");
    onDispose(log.add(label("reaction onDispose")));
    createEffect(() => {
      log("inner effect");
      onDispose(log.add(label("inner effect onDispose")));
      pull(subject);
      if (subject.value) {
        throw "oops";
      }
    });
  };
  runInScope(
    createScope((error) => log.add(label("error handler"))(error)),
    () => {
      createEffect(() => {
        log("outer effect");
        onDispose(log.add(label("outer effect onDispose")));
        pull(reaction);
      });
    }
  );
  readLog();
  subject.value = true;
  push(subject);
  expect(readLog()).toMatchInlineSnapshot(`
    > [inner effect onDispose]
    > "inner effect"
    > [inner effect onDispose]
    > [reaction onDispose]
    > [outer effect onDispose]
    > "outer effect"
    > [outer effect onDispose]
    > [error handler] "oops"
  `);
});

test("cyclical dependencies: pull directly", () => {
  // eslint-disable-next-line no-use-before-define
  const a: () => unknown = () => pull(b);
  const b: () => unknown = () => pull(a);
  expect(() => pull(b)).toThrowErrorMatchingInlineSnapshot(
    `"Cyclical dependency between lazy reactions. A dependency is created when a lazy reaction pulls another, either directly or in a descendant effect."`
  );
});

test("cyclical dependencies: pull in an effect", () => {
  const subject = { value: false };
  const a: () => unknown = () => {
    createEffect(() => {
      pull(subject);
      if (subject.value) {
        pull(a);
      }
    });
  };
  runInScope(
    createScope((error) => log(error)),
    () => {
      createEffect(() => {
        pull(a);
      });
    }
  );
  readLog();
  subject.value = true;
  push(subject);
  expect(readLog()).toMatchInlineSnapshot(
    `> [Error: Cyclical dependency between lazy reactions. A dependency is created when a lazy reaction pulls another, either directly or in a descendant effect.]`
  );
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
