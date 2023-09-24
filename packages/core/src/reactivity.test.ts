import { noopLog, resetLog } from "@1log/core";
import { getLogFunction } from "@1log/function";
import { jestPlugin, readLog } from "@1log/jest";
import { createEffect, pull, push } from "./reactivity";

const log = noopLog.add(jestPlugin());
const logFunction = getLogFunction(log);

afterEach(() => {
  resetLog();
});

test("flag graph", () => {
  //     X
  //   / |
  //  A  |
  //   \ |
  //     B
  //     |
  //     C
  const x = {};
  const a = logFunction("a", () => {
    pull(x);
    push(a);
  });
  const b = logFunction("b", () => {
    pull(x);
    pull(a);
    push(b);
  });
  const c = logFunction("c", () => {
    pull(b);
  });
  createEffect(c);
  expect(readLog()).toMatchInlineSnapshot(`
    > [c] [call 1]
    > [b] [call 1]
    > [a] [call 1]
    > [a] [1] [return] undefined
    > [b] [1] [return] undefined
    > [c] [1] [return] undefined
  `);
  push(x);
  expect(readLog()).toMatchInlineSnapshot(`
    > [b] [call 2]
    > [a] [call 2]
    > [a] [2] [return] undefined
    > [b] [2] [return] undefined
    > [c] [call 2]
    > [c] [2] [return] undefined
  `);
});

test("diamond graph", () => {
  //     X
  //   /   \
  //  A     B
  //   \   /
  //     C
  const x = {};
  const a = logFunction("a", () => {
    pull(x);
    push(a);
  });
  const b = logFunction("b", () => {
    pull(x);
    push(b);
  });
  const c = logFunction("c", () => {
    pull(a);
    pull(b);
  });
  createEffect(c);
  expect(readLog()).toMatchInlineSnapshot(`
    > [c] [call 1]
    > [a] [call 1]
    > [a] [1] [return] undefined
    > [b] [call 1]
    > [b] [1] [return] undefined
    > [c] [1] [return] undefined
  `);
  push(x);
  expect(readLog()).toMatchInlineSnapshot(`
    > [a] [call 2]
    > [a] [2] [return] undefined
    > [c] [call 2]
    > [b] [call 2]
    > [b] [2] [return] undefined
    > [c] [2] [return] undefined
  `);
});

test("diamond graph with a tail", () => {
  //     X
  //   /   \
  //  A     B
  //   \   /
  //     C
  //     |
  //     D
  const x = {};
  const a = logFunction("a", () => {
    pull(x);
    push(a);
  });
  const b = logFunction("b", () => {
    pull(x);
    push(b);
  });
  const c = logFunction("c", () => {
    pull(a);
    pull(b);
    push(c);
  });
  const d = logFunction("d", () => {
    pull(c);
  });
  createEffect(d);
  expect(readLog()).toMatchInlineSnapshot(`
    > [d] [call 1]
    > [c] [call 1]
    > [a] [call 1]
    > [a] [1] [return] undefined
    > [b] [call 1]
    > [b] [1] [return] undefined
    > [c] [1] [return] undefined
    > [d] [1] [return] undefined
  `);
  push(x);
  expect(readLog()).toMatchInlineSnapshot(`
    > [a] [call 2]
    > [a] [2] [return] undefined
    > [c] [call 2]
    > [b] [call 2]
    > [b] [2] [return] undefined
    > [c] [2] [return] undefined
    > [d] [call 2]
    > [d] [2] [return] undefined
  `);
});

test("bail out when a reaction doesn't push", () => {
  const x = {};
  const a = logFunction("a", () => {
    pull(x);
  });
  const b = logFunction("b", () => {
    pull(a);
  });
  createEffect(b);
  expect(readLog()).toMatchInlineSnapshot(`
    > [b] [call 1]
    > [a] [call 1]
    > [a] [1] [return] undefined
    > [b] [1] [return] undefined
  `);
  push(x);
  expect(readLog()).toMatchInlineSnapshot(`
    > [a] [call 2]
    > [a] [2] [return] undefined
  `);
});

test("asymmetric diamond with tails", () => {
  //     X
  //   /   \
  //  A     B
  //  |     |
  //  |     C
  //   \   /
  //     D
  //   /   \
  //  E     F
  const x = {};
  const a = logFunction("a", () => {
    pull(x);
    push(a);
  });
  const b = logFunction("b", () => {
    pull(x);
    push(b);
  });
  const c = logFunction("c", () => {
    pull(b);
    push(c);
  });
  const d = logFunction("d", () => {
    pull(a);
    pull(c);
    push(d);
  });
  const e = logFunction("e", () => {
    pull(d);
  });
  const f = logFunction("f", () => {
    pull(d);
  });
  createEffect(e);
  expect(readLog()).toMatchInlineSnapshot(`
    > [e] [call 1]
    > [d] [call 1]
    > [a] [call 1]
    > [a] [1] [return] undefined
    > [c] [call 1]
    > [b] [call 1]
    > [b] [1] [return] undefined
    > [c] [1] [return] undefined
    > [d] [1] [return] undefined
    > [e] [1] [return] undefined
  `);
  createEffect(f);
  expect(readLog()).toMatchInlineSnapshot(`
    > [f] [call 1]
    > [f] [1] [return] undefined
  `);
  push(x);
  expect(readLog()).toMatchInlineSnapshot(`
    > [a] [call 2]
    > [a] [2] [return] undefined
    > [d] [call 2]
    > [b] [call 2]
    > [b] [2] [return] undefined
    > [c] [call 2]
    > [c] [2] [return] undefined
    > [d] [2] [return] undefined
    > [e] [call 2]
    > [e] [2] [return] undefined
    > [f] [call 2]
    > [f] [2] [return] undefined
  `);
  push(x);
  expect(readLog()).toMatchInlineSnapshot(`
    > [a] [call 3]
    > [a] [3] [return] undefined
    > [d] [call 3]
    > [b] [call 3]
    > [b] [3] [return] undefined
    > [c] [call 3]
    > [c] [3] [return] undefined
    > [d] [3] [return] undefined
    > [e] [call 3]
    > [e] [3] [return] undefined
    > [f] [call 3]
    > [f] [3] [return] undefined
  `);
});

test("3-sided diamond", () => {
  //     X
  //   / | \
  //  A  B  C
  //   \ | /
  //     D
  const x = {};
  const a = logFunction("a", () => {
    pull(x);
    push(a);
  });
  const b = logFunction("b", () => {
    pull(x);
    push(b);
  });
  const c = logFunction("c", () => {
    pull(x);
    push(c);
  });
  const d = logFunction("d", () => {
    pull(a);
    pull(b);
    pull(c);
    push(d);
  });
  createEffect(d);
  expect(readLog()).toMatchInlineSnapshot(`
    > [d] [call 1]
    > [a] [call 1]
    > [a] [1] [return] undefined
    > [b] [call 1]
    > [b] [1] [return] undefined
    > [c] [call 1]
    > [c] [1] [return] undefined
    > [d] [1] [return] undefined
  `);
  push(x);
  expect(readLog()).toMatchInlineSnapshot(`
    > [a] [call 2]
    > [a] [2] [return] undefined
    > [d] [call 2]
    > [b] [call 2]
    > [b] [2] [return] undefined
    > [c] [call 2]
    > [c] [2] [return] undefined
    > [d] [2] [return] undefined
  `);
});

test("criss-crossing dependencies", () => {
  //     X
  //   / | \
  //  A  B  C
  //           <- D, E and F each depends on A, B and C.
  //  D  E  F
  //   \ | /
  //     G
  const x = {};
  const a = logFunction("a", () => {
    pull(x);
    push(a);
  });
  const b = logFunction("b", () => {
    pull(x);
    push(b);
  });
  const c = logFunction("c", () => {
    pull(x);
    push(c);
  });
  const d = logFunction("d", () => {
    pull(a);
    pull(b);
    pull(c);
    push(d);
  });
  const e = logFunction("e", () => {
    pull(a);
    pull(b);
    pull(c);
    push(e);
  });
  const f = logFunction("f", () => {
    pull(a);
    pull(b);
    pull(c);
    push(f);
  });
  const g = logFunction("g", () => {
    pull(d);
    pull(e);
    pull(f);
  });
  createEffect(g);
  expect(readLog()).toMatchInlineSnapshot(`
    > [g] [call 1]
    > [d] [call 1]
    > [a] [call 1]
    > [a] [1] [return] undefined
    > [b] [call 1]
    > [b] [1] [return] undefined
    > [c] [call 1]
    > [c] [1] [return] undefined
    > [d] [1] [return] undefined
    > [e] [call 1]
    > [e] [1] [return] undefined
    > [f] [call 1]
    > [f] [1] [return] undefined
    > [g] [1] [return] undefined
  `);
  push(x);
  expect(readLog()).toMatchInlineSnapshot(`
    > [a] [call 2]
    > [a] [2] [return] undefined
    > [d] [call 2]
    > [b] [call 2]
    > [b] [2] [return] undefined
    > [c] [call 2]
    > [c] [2] [return] undefined
    > [d] [2] [return] undefined
    > [g] [call 2]
    > [e] [call 2]
    > [e] [2] [return] undefined
    > [f] [call 2]
    > [f] [2] [return] undefined
    > [g] [2] [return] undefined
  `);
});

test("changing dependencies", () => {
  const x = {};
  const y = {};
  const a = logFunction("a", () => {
    pull(x);
    push(a);
  });
  const b = logFunction("b", () => {
    pull(y);
    push(b);
  });
  let active: "x" | "y" = "x";
  const c = logFunction("c", () => {
    if (active === "x") {
      pull(a);
    }
    if (active === "y") {
      pull(b);
    }
    push(c);
  });
  createEffect(c);
  expect(readLog()).toMatchInlineSnapshot(`
    > [c] [call 1]
    > [a] [call 1]
    > [a] [1] [return] undefined
    > [c] [1] [return] undefined
  `);
  active = "y";
  push(x);
  expect(readLog()).toMatchInlineSnapshot(`
    > [a] [call 2]
    > [a] [2] [return] undefined
    > [c] [call 2]
    > [b] [call 1]
    > [b] [1] [return] undefined
    > [c] [2] [return] undefined
  `);
  push(x);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
  push(y);
  expect(readLog()).toMatchInlineSnapshot(`
    > [b] [call 2]
    > [b] [2] [return] undefined
    > [c] [call 3]
    > [c] [3] [return] undefined
  `);
});
