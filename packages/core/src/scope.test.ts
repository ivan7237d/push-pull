import { label } from "@1log/core";
import { readLog } from "@1log/jest";
import {
  createScope,
  errScope,
  getContext,
  isAncestorScope,
  isDescendantScope,
  runInScope,
} from "./scope";
import { log, nameSymbol } from "./setupTests";

const contextKeySymbol1 = Symbol("contextKey1");
const contextKeySymbol2 = Symbol("contextKey2");

const mockMicrotaskQueue: (() => void)[] = [];
const originalQueueMicrotask = queueMicrotask;

const processMockMicrotaskQueue = () => {
  while (mockMicrotaskQueue.length) {
    mockMicrotaskQueue.shift()!();
  }
};

beforeEach(() => {
  global.queueMicrotask = (task) => mockMicrotaskQueue.push(task);
});

afterEach(() => {
  processMockMicrotaskQueue();
  global.queueMicrotask = originalQueueMicrotask;
});

// This is used for type tests in `test("context", ...)`.
declare module "./scope" {
  interface Scope {
    [contextKeySymbol1]?: number;
    [contextKeySymbol2]?: number | undefined;
  }
}

test("createScope", () => {
  // $ExpectType Scope
  const a = createScope();
  (a as any)[nameSymbol] = "a";
  expect(a).toMatchInlineSnapshot(`
    {
      Symbol(name): "a",
    }
  `);

  const b = createScope(() => {}, a);
  (b as any)[nameSymbol] = "b";
  expect(a).toMatchInlineSnapshot(`
    {
      Symbol(name): "a",
      Symbol(nextSibling): [Object b],
    }
  `);
  expect(b).toMatchInlineSnapshot(`
    {
      Symbol(parent): [Object a],
      Symbol(previousSibling): [Object a],
      Symbol(err): [Function],
      Symbol(name): "b",
    }
  `);

  const c = createScope(undefined, a);
  (c as any)[nameSymbol] = "c";
  expect(a).toMatchInlineSnapshot(`
    {
      Symbol(name): "a",
      Symbol(nextSibling): [Object c],
    }
  `);
  expect(b).toMatchInlineSnapshot(`
    {
      Symbol(parent): [Object a],
      Symbol(previousSibling): [Object c],
      Symbol(err): [Function],
      Symbol(name): "b",
    }
  `);
  expect(c).toMatchInlineSnapshot(`
    {
      Symbol(parent): [Object a],
      Symbol(previousSibling): [Object a],
      Symbol(nextSibling): [Object b],
      Symbol(name): "c",
    }
  `);
});

test("isAncestorScope, isDescendantScope", () => {
  expect(isAncestorScope(undefined, undefined)).toMatchInlineSnapshot(`true`);
  expect(isDescendantScope(undefined, undefined)).toMatchInlineSnapshot(`true`);
  const a = createScope();
  const b = createScope(undefined, a);
  const c = createScope(undefined, b);
  expect(isAncestorScope(a, c)).toMatchInlineSnapshot(`true`);
  expect(isDescendantScope(a, c)).toMatchInlineSnapshot(`false`);
  expect(isAncestorScope(a, a)).toMatchInlineSnapshot(`true`);
  expect(isDescendantScope(a, a)).toMatchInlineSnapshot(`true`);
  expect(isAncestorScope(c, a)).toMatchInlineSnapshot(`false`);
  expect(isDescendantScope(c, a)).toMatchInlineSnapshot(`true`);
  runInScope(() => {
    expect(isAncestorScope(a)).toMatchInlineSnapshot(`true`);
    expect(isDescendantScope(a)).toMatchInlineSnapshot(`false`);
    expect(isAncestorScope(c)).toMatchInlineSnapshot(`false`);
    expect(isDescendantScope(c)).toMatchInlineSnapshot(`true`);
  }, b);
});

test("getContext", () => {
  const a = createScope();
  const b = createScope(undefined, a);
  const c = createScope(undefined, b);
  b[contextKeySymbol1] = 1;
  c[contextKeySymbol1] = 2;
  expect(
    // $ExpectType number | undefined
    getContext(contextKeySymbol1)
  ).toMatchInlineSnapshot(`undefined`);
  expect(
    // $ExpectType number | undefined
    getContext(contextKeySymbol2)
  ).toMatchInlineSnapshot(`undefined`);
  expect(
    // $ExpectType number | undefined
    getContext(contextKeySymbol1, undefined)
  ).toMatchInlineSnapshot(`undefined`);
  expect(
    // $ExpectType number | undefined
    getContext(contextKeySymbol2, undefined)
  ).toMatchInlineSnapshot(`undefined`);
  expect(
    // $ExpectType number | "a"
    getContext(contextKeySymbol1, "a")
  ).toMatchInlineSnapshot(`"a"`);
  expect(
    // $ExpectType number | "a" | undefined
    getContext(contextKeySymbol2, "a")
  ).toMatchInlineSnapshot(`"a"`);
  expect(getContext(contextKeySymbol1, undefined, a)).toMatchInlineSnapshot(
    `undefined`
  );
  expect(getContext(contextKeySymbol1, undefined, b)).toMatchInlineSnapshot(
    `1`
  );
  expect(getContext(contextKeySymbol1, undefined, c)).toMatchInlineSnapshot(
    `2`
  );
  runInScope(() => {
    expect(getContext(contextKeySymbol1)).toMatchInlineSnapshot(`2`);
  }, c);
});

test("errScope", () => {
  const a = createScope();
  const b = createScope(log.add(label("error handler for scope b")), a);
  const c = createScope(log.add(label("error handler for scope c")), b);
  const d = createScope(undefined, b);

  errScope("oops1");
  expect(processMockMicrotaskQueue).toThrow("oops1");
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);

  errScope("oops2", a);
  expect(processMockMicrotaskQueue).toThrow("oops2");
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);

  errScope("oops3", b);
  expect(readLog()).toMatchInlineSnapshot(
    `> [error handler for scope b] "oops3"`
  );

  errScope("oops4", c);
  expect(readLog()).toMatchInlineSnapshot(
    `> [error handler for scope c] "oops4"`
  );

  errScope("oops5", d);
  expect(readLog()).toMatchInlineSnapshot(
    `> [error handler for scope b] "oops5"`
  );

  runInScope(() => {
    errScope("oops6");
  }, d);
  expect(readLog()).toMatchInlineSnapshot(
    `> [error handler for scope b] "oops6"`
  );
});

test("runInScope", () => {
  const a = createScope();
  a[contextKeySymbol1] = 1;
  runInScope(() => {
    expect(getContext(contextKeySymbol1)).toMatchInlineSnapshot(`1`);
  }, a);
  // Make sure the outer context is restored.
  expect(getContext(contextKeySymbol1)).toMatchInlineSnapshot(`undefined`);

  // When there is no error handler and synthetic parent scope is the same as
  // native parent scope, do not catch the error.
  expect(() => {
    runInScope(() => {
      throw "oops1";
    }, a);
  }).toThrow("oops1");

  // Pass error to this scope's error handler.
  const b = createScope(log.add(label("error handler for scope b")));
  runInScope(() => {
    throw "oops2";
  }, b);
  expect(readLog()).toMatchInlineSnapshot(
    `> [error handler for scope b] "oops2"`
  );

  // Pass error to ancestor scope's error handler.
  const c = createScope(undefined, b);
  runInScope(() => {
    throw "oops3";
  }, c);
  expect(readLog()).toMatchInlineSnapshot(
    `> [error handler for scope b] "oops3"`
  );

  // When there is no error handler but synthetic and native parent scopes do
  // not match, throw in a microtask.
  runInScope(() => {
    runInScope(() => {
      throw "oops4";
    }, a);
  }, b);
  expect(processMockMicrotaskQueue).toThrow("oops4");
});
