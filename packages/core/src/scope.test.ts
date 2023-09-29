import { label } from "@1log/core";
import { readLog } from "@1log/jest";
import {
  createDisposable,
  createScope,
  disposeScope,
  errScope,
  getContext,
  isAncestorScope,
  isDescendantScope,
  runInScope,
} from "./scope";
import { log, nameSymbol } from "./setupTests";

const contextKey1 = Symbol("contextKey1");
const contextKey2 = Symbol("contextKey2");

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
    [contextKey1]?: number;
    [contextKey2]?: number | undefined;
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
  b[contextKey1] = 1;
  c[contextKey1] = 2;
  expect(
    // $ExpectType number | undefined
    getContext(contextKey1)
  ).toMatchInlineSnapshot(`undefined`);
  expect(
    // $ExpectType number | undefined
    getContext(contextKey2)
  ).toMatchInlineSnapshot(`undefined`);
  expect(
    // $ExpectType number | undefined
    getContext(contextKey1, undefined)
  ).toMatchInlineSnapshot(`undefined`);
  expect(
    // $ExpectType number | undefined
    getContext(contextKey2, undefined)
  ).toMatchInlineSnapshot(`undefined`);
  expect(
    // $ExpectType number | "a"
    getContext(contextKey1, "a")
  ).toMatchInlineSnapshot(`"a"`);
  expect(
    // $ExpectType number | "a" | undefined
    getContext(contextKey2, "a")
  ).toMatchInlineSnapshot(`"a"`);
  expect(getContext(contextKey1, undefined, a)).toMatchInlineSnapshot(
    `undefined`
  );
  expect(getContext(contextKey1, undefined, b)).toMatchInlineSnapshot(`1`);
  expect(getContext(contextKey1, undefined, c)).toMatchInlineSnapshot(`2`);
  runInScope(() => {
    expect(getContext(contextKey1)).toMatchInlineSnapshot(`2`);
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
  // If the provided scope is the same as the current scope, just run the
  // callback.
  expect(() => {
    runInScope(() => {
      throw "oops1";
    }, undefined);
  }).toThrow("oops1");

  const a = createScope();
  a[contextKey1] = 1;
  runInScope(() => {
    expect(getContext(contextKey1)).toMatchInlineSnapshot(`1`);
  }, a);
  // Make sure the outer context is restored.
  expect(getContext(contextKey1)).toMatchInlineSnapshot(`undefined`);

  // When there is no error handler and synthetic parent scope is the same as
  // native parent scope, do not catch the error.
  expect(() => {
    runInScope(() => {
      throw "oops2";
    }, a);
  }).toThrow("oops2");

  // Pass error to this scope's error handler.
  const b = createScope(log.add(label("error handler for scope b")));
  runInScope(() => {
    throw "oops3";
  }, b);
  expect(readLog()).toMatchInlineSnapshot(
    `> [error handler for scope b] "oops3"`
  );
  // Make sure the outer context is restored.
  expect(getContext(contextKey1)).toMatchInlineSnapshot(`undefined`);

  // Pass error to ancestor scope's error handler.
  const c = createScope(undefined, b);
  runInScope(() => {
    throw "oops4";
  }, c);
  expect(readLog()).toMatchInlineSnapshot(
    `> [error handler for scope b] "oops4"`
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

test("createDisposable", () => {
  expect(() => createDisposable(() => {})).toThrowErrorMatchingInlineSnapshot(
    `"Disposables can only be created within a Scope."`
  );

  const a = createScope();
  createDisposable(log.add(label("disposable 1")), a);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
  disposeScope(a);
  expect(readLog()).toMatchInlineSnapshot(`> [disposable 1]`);

  runInScope(() => {
    createDisposable(log.add(label("disposable 2")));
    createDisposable(log.add(label("disposable 3")));
  }, a);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
  disposeScope(a);
  expect(readLog()).toMatchInlineSnapshot(`
    > [disposable 2]
    > [disposable 3]
  `);
});

test("disposeScope", () => {});
