import { createScope, getContext, runInScope } from "./scope";
import { nameSymbol } from "./setupTests";

const contextKeySymbol1 = Symbol("contextKey1");
const contextKeySymbol2 = Symbol("contextKey2");

// This is used for type tests in test("context", ...).
declare module "./scope" {
  interface Scope {
    [contextKeySymbol1]?: number;
    [contextKeySymbol2]?: number | undefined;
  }
}

test("create scope", () => {
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

test("context", () => {
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
    getContext(contextKeySymbol1, undefined)
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
