import { readLog } from "@1log/jest";
import {
  createScope,
  errScope,
  getContext,
  isAncestorScope,
  runInScope,
} from "./scope";
import { logFunction, nameSymbol } from "./setupTests";

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

test("isAncestorScope", () => {
  const a = createScope();
  const b = createScope(undefined, a);
  const c = createScope(undefined, b);
  expect(isAncestorScope(a, c)).toMatchInlineSnapshot(`true`);
  expect(isAncestorScope(a, a)).toMatchInlineSnapshot(`true`);
  expect(isAncestorScope(c, a)).toMatchInlineSnapshot(`false`);
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
  const b = createScope(
    logFunction("error handler for scope b", () => {}),
    a
  );
  const c = createScope(
    logFunction("error handler for scope c", () => {}),
    b
  );
  const d = createScope(undefined, b);

  errScope("oops1");
  expect(processMockMicrotaskQueue).toThrow("oops1");
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);

  errScope("oops2", a);
  expect(processMockMicrotaskQueue).toThrow("oops2");
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);

  errScope("oops3", b);
  expect(readLog()).toMatchInlineSnapshot(`
    > [error handler for scope b] [call 1] "oops3"
    > [error handler for scope b] [1] [return] undefined
  `);

  errScope("oops4", c);
  expect(readLog()).toMatchInlineSnapshot(`
    > [error handler for scope c] [call 1] "oops4"
    > [error handler for scope c] [1] [return] undefined
  `);

  errScope("oops5", d);
  expect(readLog()).toMatchInlineSnapshot(`
    > [error handler for scope b] [call 2] "oops5"
    > [error handler for scope b] [2] [return] undefined
  `);

  runInScope(() => {
    errScope("oops6");
  }, d);
  expect(readLog()).toMatchInlineSnapshot(`
    > [error handler for scope b] [call 3] "oops6"
    > [error handler for scope b] [3] [return] undefined
  `);
});
