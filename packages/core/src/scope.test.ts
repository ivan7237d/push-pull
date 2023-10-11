import { label } from "@1log/core";
import { readLog } from "@1log/jest";
import {
  createRootScope,
  createScope,
  disposeScope,
  getContext,
  isScopeDisposed,
  isScopeRunning,
  onDispose,
  runInScope,
} from "./scope";
import { hasSymbol, log, nameSymbol } from "./setupTests";

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

// This is used for type tests in `test("getContext", ...)`.
declare module "./scope" {
  interface Scope {
    [contextKey1]?: number;
    [contextKey2]?: number | undefined;
  }
}

test("createRootScope", () => {
  // $ExpectType Scope
  const a = createRootScope();
  expect(a).toMatchInlineSnapshot(`{}`);
  const err = () => {};
  err[nameSymbol] = "err";
  const b = createRootScope(err);
  expect(b).toMatchInlineSnapshot(`
    {
      Symbol(err): [Function err],
    }
  `);
});

test("createScope", () => {
  // $ExpectType Scope
  const a = createScope();
  (a as any)[nameSymbol] = "a";
  expect(a).toMatchInlineSnapshot(`
    {
      Symbol(name): "a",
    }
  `);

  const err = () => {};
  err[nameSymbol] = "err";
  const b = runInScope(() => createScope(err), a)!;
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
      Symbol(err): [Function err],
      Symbol(name): "b",
    }
  `);

  const c = runInScope(createScope, a)!;
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
      Symbol(err): [Function err],
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
});

test("getContext", () => {
  const a = createScope();
  const b = runInScope(createScope, a)!;
  const c = runInScope(createScope, b)!;
  const d = runInScope(createScope, c)!;
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
  expect(runInScope(() => getContext(contextKey1), a)).toMatchInlineSnapshot(
    `undefined`
  );
  expect(runInScope(() => getContext(contextKey1), b)).toMatchInlineSnapshot(
    `1`
  );
  expect(runInScope(() => getContext(contextKey1), c)).toMatchInlineSnapshot(
    `2`
  );
  expect(runInScope(() => getContext(contextKey1), d)).toMatchInlineSnapshot(
    `2`
  );
});

test("runInScope: case of no errors", () => {
  const a = createScope();
  a[contextKey1] = 1;
  const b = runInScope(createScope, a)!;
  b[contextKey1] = 2;

  // Make sure the callback is run in the right context and state is restored
  // afterwards.
  runInScope(() => {
    runInScope(() => {
      expect(hasSymbol(a, "running")).toMatchInlineSnapshot(`true`);
      expect(hasSymbol(b, "running")).toMatchInlineSnapshot(`true`);
      expect(getContext(contextKey1)).toMatchInlineSnapshot(`2`);
      // Make sure we've actually run the callbacks.
      log("done");
    }, b);
    expect(hasSymbol(a, "running")).toMatchInlineSnapshot(`true`);
    expect(hasSymbol(b, "running")).toMatchInlineSnapshot(`false`);
    expect(getContext(contextKey1)).toMatchInlineSnapshot(`1`);
  }, a);
  expect(readLog()).toMatchInlineSnapshot(`> "done"`);
  expect(hasSymbol(a, "running")).toMatchInlineSnapshot(`false`);
  expect(hasSymbol(b, "running")).toMatchInlineSnapshot(`false`);
  expect(getContext(contextKey1)).toMatchInlineSnapshot(`undefined`);

  disposeScope(a);
  expect(() =>
    runInScope(() => undefined, a)
  ).toThrowErrorMatchingInlineSnapshot(
    `"You cannot run a callback in a disposed scope."`
  );
});

test("isScopeRunning", () => {
  const a = createScope();
  expect(isScopeRunning(a)).toMatchInlineSnapshot(`false`);
  expect(runInScope(() => isScopeRunning(a), a)).toMatchInlineSnapshot(`true`);
});

test("runInScope: case of errors", () => {
  const a = createScope();
  const b = runInScope(
    () =>
      createScope((error) => {
        log.add(label("error handler for scope b"))(error);
        expect(isScopeDisposed(b)).toMatchInlineSnapshot(`true`);
        throw "error in error handler for scope b";
      }),
    a
  )!;
  const c = runInScope(
    () => createScope(log.add(label("error handler for scope c"))),
    b
  )!;
  const d = runInScope(createScope, c)!;

  runInScope(() => {
    throw "error in d";
  }, d);
  expect(readLog()).toMatchInlineSnapshot(
    `> [error handler for scope c] "error in d"`
  );
  processMockMicrotaskQueue();

  runInScope(() => {
    throw "error in c";
  }, c);
  expect(readLog()).toMatchInlineSnapshot(
    `> [error handler for scope c] "error in c"`
  );
  processMockMicrotaskQueue();

  runInScope(() => {
    throw "error in b";
  }, b);
  expect(readLog()).toMatchInlineSnapshot(
    `> [error handler for scope b] "error in b"`
  );
  expect(processMockMicrotaskQueue).toThrow(
    "error in error handler for scope b"
  );

  runInScope(() => {
    throw "error in a";
  }, a);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
  expect(processMockMicrotaskQueue).toThrow("error in a");
});

test("onDispose", () => {
  expect(() => {
    onDispose(() => {});
  }).toThrowErrorMatchingInlineSnapshot(
    `"\`onDispose\` must be called within a \`Scope\`."`
  );

  const a = createScope();
  runInScope(() => {
    onDispose(log.add(label("disposable in a")));
  }, a);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
  disposeScope(a);
  expect(readLog()).toMatchInlineSnapshot(`> [disposable in a]`);

  const b = createScope();
  runInScope(() => {
    onDispose(log.add(label("disposable 1 in b")));
    onDispose(log.add(label("disposable 2 in b")));
  }, b);
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
  disposeScope(b);
  expect(readLog()).toMatchInlineSnapshot(`
    > [disposable 2 in b]
    > [disposable 1 in b]
  `);
});

test("isScopeDisposed", () => {
  const a = createScope();
  expect(isScopeDisposed(a)).toMatchInlineSnapshot(`false`);
  disposeScope(a);
  expect(isScopeDisposed(a)).toMatchInlineSnapshot(`true`);
});

test("disposeScope: calling disposables", () => {
  const a = createScope();
  runInScope(() => {
    onDispose(log.add(label("disposable in a")));
  }, a);
  disposeScope(a);
  expect(readLog()).toMatchInlineSnapshot(`> [disposable in a]`);

  const b = createScope();
  runInScope(() => {
    onDispose(log.add(label("disposable 1 in b")));
    onDispose(log.add(label("disposable 2 in b")));
  }, b);
  disposeScope(b);
  expect(readLog()).toMatchInlineSnapshot(`
    > [disposable 2 in b]
    > [disposable 1 in b]
  `);
});

test("disposeScope: handling errors in disposables", () => {
  const a = createScope();
  (a as any)[nameSymbol] = "a";
  runInScope(() => {
    onDispose(() => {
      throw "error in disposable in a";
    });
  }, a);
  disposeScope(a);
  expect(a).toMatchInlineSnapshot(`
    {
      Symbol(name): "a",
      Symbol(disposables): [Function],
      Symbol(disposed): true,
    }
  `);
  expect(processMockMicrotaskQueue).toThrow("error in disposable in a");

  const b = createScope();
  (b as any)[nameSymbol] = "b";
  runInScope(() => {
    onDispose(log.add(label("first disposable in b")));
  }, b);
  runInScope(() => {
    onDispose(() => {
      log.add(label("second disposable in b"))();
      throw "error in second disposable in b";
    });
  }, b);
  runInScope(() => {
    onDispose(log.add(label("third disposable in b")));
  }, b);
  disposeScope(b);
  expect(readLog()).toMatchInlineSnapshot(`
    > [third disposable in b]
    > [second disposable in b]
    > [first disposable in b]
  `);
  expect(processMockMicrotaskQueue).toThrow("error in second disposable in b");
});

test("disposeScope: no re-dispose", () => {
  const a = createScope();
  disposeScope(a);
  expect(() => {
    disposeScope(a);
  }).toThrowErrorMatchingInlineSnapshot(`"The scope is already disposed."`);
});

test("disposeScope: no disposing from callback", () => {
  const a = createScope();
  (a as any)[nameSymbol] = "a";
  const b = runInScope(createScope, a)!;
  (b as any)[nameSymbol] = "b";
  runInScope(() => {
    expect(() => {
      disposeScope(a);
    }).toThrowErrorMatchingInlineSnapshot(
      `"You cannot dispose a scope from inside a callback run within that scope or that scope's descendant scope."`
    );
    log("done");
  }, b);
  expect(readLog()).toMatchInlineSnapshot(`> "done"`);
  expect(isScopeDisposed(a)).toMatchInlineSnapshot(`false`);
  expect(isScopeDisposed(b)).toMatchInlineSnapshot(`false`);
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
  runInScope(() => {
    onDispose(log.add(label("disposable in a")));
  }, a);
  const b = runInScope(createScope, a)!;
  (b as any)[nameSymbol] = "b";
  runInScope(() => {
    onDispose(log.add(label("disposable in b")));
  }, b);
  const c = runInScope(createScope, a)!;
  (c as any)[nameSymbol] = "c";
  runInScope(() => {
    onDispose(log.add(label("disposable in c")));
  }, c);

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
  runInScope(() => {
    onDispose(log.add(label("disposable in a")));
  }, a);
  const b = runInScope(createScope, a)!;
  (b as any)[nameSymbol] = "b";
  runInScope(() => {
    onDispose(log.add(label("disposable in b")));
  }, b);
  const c = runInScope(createScope, a)!;
  (c as any)[nameSymbol] = "c";
  runInScope(() => {
    onDispose(log.add(label("disposable in c")));
  }, c);

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
  runInScope(() => {
    onDispose(log.add(label("disposable in a")));
  }, a);
  const b = runInScope(createScope, a)!;
  (b as any)[nameSymbol] = "b";
  runInScope(() => {
    onDispose(log.add(label("disposable in b")));
  }, b);
  const c = runInScope(createScope, a)!;
  (c as any)[nameSymbol] = "c";
  runInScope(() => {
    onDispose(log.add(label("disposable in c")));
  }, c);

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
  runInScope(() => {
    onDispose(log.add(label("disposable in a")));
  }, a);
  const b = runInScope(createScope, a)!;
  (b as any)[nameSymbol] = "b";
  runInScope(() => {
    onDispose(log.add(label("disposable in b")));
  }, b);
  const c = runInScope(createScope, a)!;
  (c as any)[nameSymbol] = "c";
  runInScope(() => {
    onDispose(() => {
      log.add(label("disposable in c"))();
      expect(isScopeDisposed(a)).toMatchInlineSnapshot(`true`);
      expect(isScopeDisposed(b)).toMatchInlineSnapshot(`true`);
      expect(isScopeDisposed(c)).toMatchInlineSnapshot(`true`);
    });
  }, c);

  disposeScope(a);
  expect(readLog()).toMatchInlineSnapshot(`
    > [disposable in c]
    > [disposable in b]
    > [disposable in a]
  `);
});
