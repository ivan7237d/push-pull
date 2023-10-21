import { label } from "@1log/core";
import { readLog } from "@1log/jest";
import {
  createRootScope,
  createScope,
  disposeScope,
  getContext,
  isScopeDisposed,
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
  const onError = () => {};
  onError[nameSymbol] = "onError";
  const b = createRootScope(onError);
  expect(b).toMatchInlineSnapshot(`
    {
      Symbol(onError): [Function onError],
    }
  `);
});

test("createScope: creating linked list", () => {
  const a = createScope();
  (a as any)[nameSymbol] = "a";
  expect(a).toMatchInlineSnapshot(`
    {
      Symbol(name): "a",
    }
  `);

  const onError = () => {};
  onError[nameSymbol] = "onError";
  const b = runInScope(a, () => createScope(onError))!;
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
      Symbol(onError): [Function onError],
      Symbol(name): "b",
    }
  `);

  const c = runInScope(a, createScope)!;
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
      Symbol(onError): [Function onError],
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

test("createScope: error if scope is disposed", () => {
  const a = createScope();
  runInScope(a, () => {
    onDispose(() => {
      createScope();
    });
  });
  processMockMicrotaskQueue();
  disposeScope(a);
  expect(processMockMicrotaskQueue).toThrow(
    "You cannot create a child scope in a disposed scope."
  );
});

test("getContext", () => {
  const a = createScope();
  const b = runInScope(a, createScope)!;
  const c = runInScope(b, createScope)!;
  const d = runInScope(c, createScope)!;
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
  expect(runInScope(a, () => getContext(contextKey1))).toMatchInlineSnapshot(
    `undefined`
  );
  expect(runInScope(b, () => getContext(contextKey1))).toMatchInlineSnapshot(
    `1`
  );
  expect(runInScope(c, () => getContext(contextKey1))).toMatchInlineSnapshot(
    `2`
  );
  expect(runInScope(d, () => getContext(contextKey1))).toMatchInlineSnapshot(
    `2`
  );
});

test("runInScope: case of no errors", () => {
  const a = createScope();
  a[contextKey1] = 1;
  const b = runInScope(a, createScope)!;
  b[contextKey1] = 2;

  // Test returned type.

  // $ExpectType number | void
  runInScope(a, () => 1);
  // $ExpectType void
  runInScope(a, () => {});
  // $ExpectType void | undefined
  runInScope(a, () => undefined);

  // Make sure the callback is run in the right context and state is restored
  // afterwards.
  runInScope(a, () => {
    runInScope(b, () => {
      expect(hasSymbol(a, "running")).toMatchInlineSnapshot(`true`);
      expect(hasSymbol(b, "running")).toMatchInlineSnapshot(`true`);
      expect(getContext(contextKey1)).toMatchInlineSnapshot(`2`);
      // Make sure we've actually run the callbacks.
      log("done");
    });
    expect(hasSymbol(a, "running")).toMatchInlineSnapshot(`true`);
    expect(hasSymbol(b, "running")).toMatchInlineSnapshot(`false`);
    expect(getContext(contextKey1)).toMatchInlineSnapshot(`1`);
  });
  expect(readLog()).toMatchInlineSnapshot(`> "done"`);
  expect(hasSymbol(a, "running")).toMatchInlineSnapshot(`false`);
  expect(hasSymbol(b, "running")).toMatchInlineSnapshot(`false`);
  expect(getContext(contextKey1)).toMatchInlineSnapshot(`undefined`);
});

test("runInScope: case of errors", () => {
  const a = createScope();
  const b = runInScope(a, () =>
    createScope((error, scope) => {
      expect(scope).toBe(b);
      log.add(label("error handler for scope b"))(error);
      expect(isScopeDisposed(b)).toMatchInlineSnapshot(`true`);
      throw "error in error handler for scope b";
    })
  )!;
  const c = runInScope(b, () =>
    createScope((error, scope) => {
      expect(scope).toBe(c);
      log.add(label("error handler for scope c"))(error);
    })
  )!;
  const d = runInScope(c, createScope)!;

  runInScope(d, () => {
    throw "error in d";
  });
  expect(readLog()).toMatchInlineSnapshot(
    `> [error handler for scope c] "error in d"`
  );
  processMockMicrotaskQueue();

  runInScope(c, () => {
    throw "error in c";
  });
  expect(readLog()).toMatchInlineSnapshot(
    `> [error handler for scope c] "error in c"`
  );
  processMockMicrotaskQueue();

  runInScope(b, () => {
    throw "error in b";
  });
  expect(readLog()).toMatchInlineSnapshot(
    `> [error handler for scope b] "error in b"`
  );
  expect(processMockMicrotaskQueue).toThrow(
    "error in error handler for scope b"
  );

  runInScope(a, () => {
    throw "error in a";
  });
  expect(readLog()).toMatchInlineSnapshot(`[Empty log]`);
  expect(processMockMicrotaskQueue).toThrow("error in a");
});

test("runInScope: error if scope is disposed", () => {
  const a = createScope();
  disposeScope(a);
  expect(() =>
    runInScope(a, () => undefined)
  ).toThrowErrorMatchingInlineSnapshot(
    `"You cannot run a callback in a disposed scope."`
  );
});

test("onDispose: updating disposables", () => {
  const a = createScope();
  runInScope(a, () => {
    const disposable = () => {};
    disposable[nameSymbol] = "a";
    onDispose(disposable);
  });
  expect(a).toMatchInlineSnapshot(`
    {
      Symbol(disposables): [Function a],
    }
  `);
  runInScope(a, () => {
    const disposable = () => {};
    disposable[nameSymbol] = "b";
    onDispose(disposable);
  });
  expect(a).toMatchInlineSnapshot(`
    {
      Symbol(disposables): [
        [Function a],
        [Function b],
      ],
    }
  `);
});

test("onDispose: error if run outside a scope", () => {
  expect(() => {
    onDispose(() => {});
  }).toThrowErrorMatchingInlineSnapshot(
    `"\`onDispose\` must be called within a \`Scope\`."`
  );
});

test("onDispose: error if the scope is disposed", () => {
  const scope = createScope();
  runInScope(scope, () => {
    onDispose(() => {
      expect(() => {
        onDispose(() => {});
      }).toThrowErrorMatchingInlineSnapshot(
        `"You cannot call \`onDispose\` in a disposed scope."`
      );
      log("done");
    });
  });
  disposeScope(scope);
  expect(readLog()).toMatchInlineSnapshot(`> "done"`);
});

test("isScopeDisposed", () => {
  expect(isScopeDisposed()).toMatchInlineSnapshot(`false`);

  const a = createScope();
  expect(isScopeDisposed(a)).toMatchInlineSnapshot(`false`);

  runInScope(a, () => {
    expect(isScopeDisposed()).toMatchInlineSnapshot(`false`);
    onDispose(() => {
      expect(isScopeDisposed()).toMatchInlineSnapshot(`true`);
      log("done");
    });
  });

  disposeScope(a);
  expect(isScopeDisposed(a)).toMatchInlineSnapshot(`true`);
  expect(readLog()).toMatchInlineSnapshot(`> "done"`);
});

test("disposeScope: calling disposables", () => {
  const a = createScope();
  runInScope(a, () => {
    onDispose(log.add(label("disposable in a")));
  });
  disposeScope(a);
  expect(readLog()).toMatchInlineSnapshot(`> [disposable in a]`);

  const b = createScope();
  runInScope(b, () => {
    onDispose(log.add(label("disposable 1 in b")));
    onDispose(log.add(label("disposable 2 in b")));
  });
  disposeScope(b);
  expect(readLog()).toMatchInlineSnapshot(`
    > [disposable 2 in b]
    > [disposable 1 in b]
  `);
});

test("disposeScope: scope in which disposables are called", () => {
  const a = createScope();
  a[contextKey1] = 1;
  const b = runInScope(a, createScope)!;
  b[contextKey1] = 2;
  runInScope(a, () => {
    onDispose(() =>
      log.add(label("context value in disposable in a"))(
        getContext(contextKey1)
      )
    );
  });
  runInScope(b, () => {
    onDispose(() =>
      log.add(label("context value in disposable in b"))(
        getContext(contextKey1)
      )
    );
  });
  disposeScope(a);
  expect(readLog()).toMatchInlineSnapshot(`
    > [context value in disposable in b] 2
    > [context value in disposable in a] 1
  `);
  // Check that scope is restored.
  expect(getContext(contextKey1)).toMatchInlineSnapshot(`undefined`);
});

test("disposeScope: handling errors in disposables", () => {
  const a = createScope();
  (a as any)[nameSymbol] = "a";
  runInScope(a, () => {
    onDispose(() => {
      throw "error in disposable in a";
    });
  });
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
  runInScope(b, () => {
    onDispose(log.add(label("first disposable in b")));
  });
  runInScope(b, () => {
    onDispose(() => {
      log.add(label("second disposable in b"))();
      throw "error in second disposable in b";
    });
  });
  runInScope(b, () => {
    onDispose(log.add(label("third disposable in b")));
  });
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
  const b = runInScope(a, createScope)!;
  (b as any)[nameSymbol] = "b";
  runInScope(b, () => {
    expect(() => {
      disposeScope(a);
    }).toThrowErrorMatchingInlineSnapshot(
      `"You cannot dispose a scope while a callback is running in that scope."`
    );
    log("done");
  });
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
  runInScope(a, () => {
    onDispose(log.add(label("disposable in a")));
  });
  const b = runInScope(a, createScope)!;
  (b as any)[nameSymbol] = "b";
  runInScope(b, () => {
    onDispose(log.add(label("disposable in b")));
  });
  const c = runInScope(a, createScope)!;
  (c as any)[nameSymbol] = "c";
  runInScope(c, () => {
    onDispose(log.add(label("disposable in c")));
  });

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
  runInScope(a, () => {
    onDispose(log.add(label("disposable in a")));
  });
  const b = runInScope(a, createScope)!;
  (b as any)[nameSymbol] = "b";
  runInScope(b, () => {
    onDispose(log.add(label("disposable in b")));
  });
  const c = runInScope(a, createScope)!;
  (c as any)[nameSymbol] = "c";
  runInScope(c, () => {
    onDispose(log.add(label("disposable in c")));
  });

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
  runInScope(a, () => {
    onDispose(log.add(label("disposable in a")));
  });
  const b = runInScope(a, createScope)!;
  (b as any)[nameSymbol] = "b";
  runInScope(b, () => {
    onDispose(log.add(label("disposable in b")));
  });
  const c = runInScope(a, createScope)!;
  (c as any)[nameSymbol] = "c";
  runInScope(c, () => {
    onDispose(log.add(label("disposable in c")));
  });

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
  runInScope(a, () => {
    onDispose(log.add(label("disposable in a")));
  });
  const b = runInScope(a, createScope)!;
  (b as any)[nameSymbol] = "b";
  runInScope(b, () => {
    onDispose(log.add(label("disposable in b")));
  });
  const c = runInScope(a, createScope)!;
  (c as any)[nameSymbol] = "c";
  runInScope(c, () => {
    onDispose(() => {
      log.add(label("disposable in c"))();
      expect(isScopeDisposed(a)).toMatchInlineSnapshot(`true`);
      expect(isScopeDisposed(b)).toMatchInlineSnapshot(`true`);
      expect(isScopeDisposed(c)).toMatchInlineSnapshot(`true`);
    });
  });

  disposeScope(a);
  expect(readLog()).toMatchInlineSnapshot(`
    > [disposable in c]
    > [disposable in b]
    > [disposable in a]
  `);
});
