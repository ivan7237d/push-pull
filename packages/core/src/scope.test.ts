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
  isScopeDisposed,
  runInScope,
} from "./scope";
import { getNumberedString, log, nameSymbol } from "./setupTests";

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
      Symbol(next): [Object b],
    }
  `);
  expect(b).toMatchInlineSnapshot(`
    {
      Symbol(parent): [Object a],
      Symbol(previous): [Object a],
      Symbol(err): [Function],
      Symbol(name): "b",
    }
  `);

  const c = createScope(undefined, a);
  (c as any)[nameSymbol] = "c";
  expect(a).toMatchInlineSnapshot(`
    {
      Symbol(name): "a",
      Symbol(next): [Object c],
    }
  `);
  expect(b).toMatchInlineSnapshot(`
    {
      Symbol(parent): [Object a],
      Symbol(previous): [Object c],
      Symbol(err): [Function],
      Symbol(name): "b",
    }
  `);
  expect(c).toMatchInlineSnapshot(`
    {
      Symbol(parent): [Object a],
      Symbol(previous): [Object a],
      Symbol(next): [Object b],
      Symbol(name): "c",
    }
  `);

  disposeScope(c);
  expect(() => createScope(undefined, c)).toThrowErrorMatchingInlineSnapshot(
    `"The scope is expected to not be in disposed state."`
  );
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

  disposeScope(c);
  expect(() => isAncestorScope(a, c)).toThrowErrorMatchingInlineSnapshot(
    `"The scope is expected to not be in disposed state."`
  );
  expect(isAncestorScope(c, a)).toMatchInlineSnapshot(`false`);
  expect(() => isDescendantScope(c, a)).toThrowErrorMatchingInlineSnapshot(
    `"The scope is expected to not be in disposed state."`
  );
  expect(isDescendantScope(a, c)).toMatchInlineSnapshot(`false`);
});

test("getContext", () => {
  const a = createScope();
  const b = createScope(undefined, a);
  const c = createScope(undefined, b);
  const d = createScope(undefined, c);
  b[contextKey1] = 1;
  c[contextKey1] = 2;

  // Test returned type and default value.
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

  // Test picking up the right scope.
  expect(getContext(contextKey1, undefined, undefined)).toMatchInlineSnapshot(
    `undefined`
  );
  expect(getContext(contextKey1, undefined, a)).toMatchInlineSnapshot(
    `undefined`
  );
  expect(getContext(contextKey1, undefined, b)).toMatchInlineSnapshot(
    `undefined`
  );
  expect(getContext(contextKey1, undefined, c)).toMatchInlineSnapshot(`1`);
  expect(getContext(contextKey1, undefined, d)).toMatchInlineSnapshot(`2`);
  runInScope(() => {
    expect(getContext(contextKey1)).toMatchInlineSnapshot(`undefined`);
  }, a);
  runInScope(() => {
    expect(getContext(contextKey1)).toMatchInlineSnapshot(`1`);
  }, b);
  runInScope(() => {
    expect(getContext(contextKey1)).toMatchInlineSnapshot(`2`);
  }, c);
  runInScope(() => {
    expect(getContext(contextKey1)).toMatchInlineSnapshot(`2`);
  }, d);

  // Test checking for disposed scope.
  expect(() => {
    runInScope(() => {
      disposeScope(c);
      getContext(contextKey1, undefined);
    }, c);
  }).toThrowErrorMatchingInlineSnapshot(
    `"The scope is expected to not be in disposed state."`
  );
  expect(() =>
    getContext(contextKey1, undefined, c)
  ).toThrowErrorMatchingInlineSnapshot(
    `"The scope is expected to not be in disposed state."`
  );
});

test("errScope", () => {
  const a = createScope();
  const b = createScope(log.add(label("error handler for scope b")), a);
  const c = createScope(log.add(label("error handler for scope c")), b);
  const d = createScope(undefined, b);
  const nextOops = getNumberedString("oops");
  let oops: string;

  expect((oops = nextOops())).toMatchInlineSnapshot(`"oops1"`);
  errScope(oops);
  expect(processMockMicrotaskQueue).toThrow("oops1");
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);

  expect((oops = nextOops())).toMatchInlineSnapshot(`"oops2"`);
  errScope(oops, a);
  expect(processMockMicrotaskQueue).toThrow("oops2");
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);

  expect((oops = nextOops())).toMatchInlineSnapshot(`"oops3"`);
  errScope(oops, b);
  expect(readLog()).toMatchInlineSnapshot(
    `> [error handler for scope b] "oops3"`
  );

  expect((oops = nextOops())).toMatchInlineSnapshot(`"oops4"`);
  errScope(oops, c);
  expect(readLog()).toMatchInlineSnapshot(
    `> [error handler for scope c] "oops4"`
  );

  expect((oops = nextOops())).toMatchInlineSnapshot(`"oops5"`);
  errScope(oops, d);
  expect(readLog()).toMatchInlineSnapshot(
    `> [error handler for scope b] "oops5"`
  );

  expect((oops = nextOops())).toMatchInlineSnapshot(`"oops6"`);
  runInScope(() => {
    errScope(oops);
  }, d);
  expect(readLog()).toMatchInlineSnapshot(
    `> [error handler for scope b] "oops6"`
  );

  expect((oops = nextOops())).toMatchInlineSnapshot(`"oops7"`);
  disposeScope(c);
  expect(() => {
    errScope(oops, c);
  }).toThrowErrorMatchingInlineSnapshot(
    `"The scope is expected to not be in disposed state."`
  );
});

test("runInScope", () => {
  const a = createScope();
  a[contextKey1] = 1;
  runInScope(() => {
    expect(getContext(contextKey1)).toMatchInlineSnapshot(`1`);
  }, a);
  // Make sure the outer context is restored.
  expect(getContext(contextKey1)).toMatchInlineSnapshot(`undefined`);

  // Pass error to the scope's error handler.
  const b = createScope(log.add(label("error handler for scope b")));
  runInScope(() => {
    throw "oops1";
  }, b);
  expect(readLog()).toMatchInlineSnapshot(
    `> [error handler for scope b] "oops1"`
  );
  // Make sure the outer context is restored.
  expect(getContext(contextKey1)).toMatchInlineSnapshot(`undefined`);

  // When there is no error handler, throw in a microtask.
  runInScope(() => {
    throw "oops2";
  }, undefined);
  expect(processMockMicrotaskQueue).toThrow("oops2");

  disposeScope(b);
  expect(() => {
    runInScope(() => {}, b);
  }).toThrowErrorMatchingInlineSnapshot(
    `"The scope is expected to not be in disposed state."`
  );
});

test("createDisposable", () => {
  expect(() => {
    createDisposable(() => {});
  }).toThrowErrorMatchingInlineSnapshot(
    `"Disposables can only be created within a scope."`
  );

  const a = createScope();
  createDisposable(log.add(label("disposable 1")), a);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
  disposeScope(a);
  expect(readLog()).toMatchInlineSnapshot(`> [disposable 1]`);

  const b = createScope();
  runInScope(() => {
    createDisposable(log.add(label("disposable 2")));
    createDisposable(log.add(label("disposable 3")));
  }, b);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
  disposeScope(b);
  expect(readLog()).toMatchInlineSnapshot(`
    > [disposable 3]
    > [disposable 2]
  `);

  expect(() => {
    createDisposable(() => {}, b);
  }).toThrowErrorMatchingInlineSnapshot(
    `"The scope is expected to not be in disposed state."`
  );
});

test("isScopeDisposed", () => {
  expect(isScopeDisposed()).toMatchInlineSnapshot(`false`);
  const a = createScope();
  expect(isScopeDisposed(a)).toMatchInlineSnapshot(`false`);
  runInScope(() => {
    expect(isScopeDisposed()).toMatchInlineSnapshot(`false`);
  }, a);
  disposeScope(a);
  expect(isScopeDisposed(a)).toMatchInlineSnapshot(`true`);
});

test("disposeScope: calling disposables", () => {
  const a = createScope();
  createDisposable(log.add(label("disposable 1")), a);
  disposeScope(a);
  expect(readLog()).toMatchInlineSnapshot(`> [disposable 1]`);

  const b = createScope();
  createDisposable(log.add(label("disposable 2")), b);
  createDisposable(log.add(label("disposable 3")), b);
  disposeScope(b);
  expect(readLog()).toMatchInlineSnapshot(`
    > [disposable 3]
    > [disposable 2]
  `);
});

test("disposeScope: handling errors in disposables", () => {
  const a = createScope();
  (a as any)[nameSymbol] = "a";
  createDisposable(() => {
    throw "oops1";
  }, a);
  disposeScope(a);
  expect(a).toMatchInlineSnapshot(`
    {
      Symbol(name): "a",
      Symbol(disposables): [Function],
      Symbol(disposed): true,
    }
  `);
  expect(processMockMicrotaskQueue).toThrow("oops1");

  const b = createScope();
  (b as any)[nameSymbol] = "b";
  createDisposable(log.add(label("first disposable in b")), b);
  createDisposable(() => {
    throw "oops2";
  }, b);
  createDisposable(log.add(label("third disposable in b")), b);
  disposeScope(b);
  expect(b).toMatchInlineSnapshot(`
    {
      Symbol(name): "b",
      Symbol(disposables): [
        [Function],
        [Function],
        [Function],
      ],
      Symbol(disposed): true,
    }
  `);
  expect(readLog()).toMatchInlineSnapshot(`
    > [third disposable in b]
    > [first disposable in b]
  `);
  expect(processMockMicrotaskQueue).toThrow("oops2");
});

test("disposeScope: no re-dispose", () => {
  const a = createScope();
  disposeScope(a);
  expect(() => {
    disposeScope(a);
  }).toThrowErrorMatchingInlineSnapshot(
    `"The scope is expected to not be in disposed state."`
  );
});

test("disposeScope: disposing single scope", () => {
  const a = createScope();
  disposeScope(a);
  expect(a).toMatchInlineSnapshot(`
    {
      Symbol(disposed): true,
    }
  `);
});

test("disposeScope: disposing last scope", () => {
  const a = createScope();
  (a as any)[nameSymbol] = "a";
  createDisposable(log.add(label("disposable in a")), a);
  const b = createScope(undefined, a);
  (b as any)[nameSymbol] = "b";
  createDisposable(log.add(label("disposable in b")), b);
  const c = createScope(undefined, a);
  (c as any)[nameSymbol] = "c";
  createDisposable(log.add(label("disposable in c")), c);

  disposeScope(c);
  expect(a).toMatchInlineSnapshot(`
    {
      Symbol(name): "a",
      Symbol(disposables): [Function],
      Symbol(next): [Object b],
    }
  `);
  expect(b).toMatchInlineSnapshot(`
    {
      Symbol(parent): [Object a],
      Symbol(previous): [Object a],
      Symbol(name): "b",
      Symbol(disposables): [Function],
    }
  `);
  expect(c).toMatchInlineSnapshot(`
    {
      Symbol(parent): [Object a],
      Symbol(previous): [Object a],
      Symbol(next): [Object b],
      Symbol(name): "c",
      Symbol(disposables): [Function],
      Symbol(disposed): true,
    }
  `);
  expect(readLog()).toMatchInlineSnapshot(`> [disposable in c]`);
});

test("disposeScope: disposing middle scope", () => {
  const a = createScope();
  (a as any)[nameSymbol] = "a";
  createDisposable(log.add(label("disposable in a")), a);
  const b = createScope(undefined, a);
  (b as any)[nameSymbol] = "b";
  createDisposable(log.add(label("disposable in b")), b);
  const c = createScope(undefined, a);
  (c as any)[nameSymbol] = "c";
  createDisposable(log.add(label("disposable in c")), c);

  disposeScope(b);
  expect(a).toMatchInlineSnapshot(`
    {
      Symbol(name): "a",
      Symbol(disposables): [Function],
      Symbol(next): [Object c],
    }
  `);
  expect(b).toMatchInlineSnapshot(`
    {
      Symbol(parent): [Object a],
      Symbol(previous): [Object c],
      Symbol(name): "b",
      Symbol(disposables): [Function],
      Symbol(disposed): true,
    }
  `);
  expect(c).toMatchInlineSnapshot(`
    {
      Symbol(parent): [Object a],
      Symbol(previous): [Object a],
      Symbol(name): "c",
      Symbol(disposables): [Function],
    }
  `);
  expect(readLog()).toMatchInlineSnapshot(`> [disposable in b]`);
});

test("disposeScope: disposing first scope", () => {
  const a = createScope();
  (a as any)[nameSymbol] = "a";
  createDisposable(log.add(label("disposable in a")), a);
  const b = createScope(undefined, a);
  (b as any)[nameSymbol] = "b";
  createDisposable(log.add(label("disposable in b")), b);
  const c = createScope(undefined, a);
  (c as any)[nameSymbol] = "c";
  createDisposable(log.add(label("disposable in c")), c);

  disposeScope(a);
  expect(a).toMatchInlineSnapshot(`
    {
      Symbol(name): "a",
      Symbol(disposables): [Function],
      Symbol(next): [Object c],
      Symbol(disposed): true,
    }
  `);
  expect(b).toMatchInlineSnapshot(`
    {
      Symbol(parent): [Object a],
      Symbol(previous): [Object c],
      Symbol(name): "b",
      Symbol(disposables): [Function],
      Symbol(disposed): true,
    }
  `);
  expect(c).toMatchInlineSnapshot(`
    {
      Symbol(parent): [Object a],
      Symbol(previous): [Object a],
      Symbol(next): [Object b],
      Symbol(name): "c",
      Symbol(disposables): [Function],
      Symbol(disposed): true,
    }
  `);
  expect(readLog()).toMatchInlineSnapshot(`
    > [disposable in c]
    > [disposable in b]
    > [disposable in a]
  `);
});

test("disposeScope: re-entry", () => {
  const a = createScope();
  (a as any)[nameSymbol] = "a";
  createDisposable(log.add(label("disposable in a")), a);
  const b = createScope(undefined, a);
  (b as any)[nameSymbol] = "b";
  createDisposable(log.add(label("disposable in b")), b);
  const c = createScope(undefined, a);
  (c as any)[nameSymbol] = "c";
  createDisposable(() => {
    log.add(label("disposable in c"))();
    expect(isScopeDisposed(a)).toMatchInlineSnapshot(`true`);
    expect(isScopeDisposed(b)).toMatchInlineSnapshot(`true`);
    expect(isScopeDisposed(c)).toMatchInlineSnapshot(`true`);
  }, c);

  disposeScope(a);
  expect(readLog()).toMatchInlineSnapshot(`
    > [disposable in c]
    > [disposable in b]
    > [disposable in a]
  `);
});
