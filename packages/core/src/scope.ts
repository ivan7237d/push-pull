const parentSymbol = Symbol("parent");
const previousSymbol = Symbol("previous");
const nextSymbol = Symbol("next");
const disposablesSymbol = Symbol("disposables");
const disposedSymbol = Symbol("disposed");
const errSymbol = Symbol("err");

export interface Scope {
  [parentSymbol]?: Scope;
  [previousSymbol]?: Scope;
  [nextSymbol]?: Scope;
  [disposablesSymbol]?: (() => void) | (() => void)[];
  [disposedSymbol]?: true;
  [errSymbol]?: (error: unknown) => void;
}

let currentScope: Scope | undefined;

const assertScopeNotDisposed = (scope: Scope) => {
  if (disposedSymbol in scope) {
    throw new Error("The scope is expected to not be in disposed state.");
  }
};

export const createScope = (
  err?: (error: unknown) => void,
  scope: Scope | undefined = currentScope
): Scope => {
  if (scope) {
    assertScopeNotDisposed(scope);
  }
  const newScope: Scope = {};
  if (scope) {
    newScope[parentSymbol] = scope;
    newScope[previousSymbol] = scope;
    if (scope[nextSymbol]) {
      scope[nextSymbol][previousSymbol] = newScope;
      newScope[nextSymbol] = scope[nextSymbol];
    }
    scope[nextSymbol] = newScope;
  }
  if (err) {
    newScope[errSymbol] = err;
  }
  return newScope;
};

/**
 * This is a weak operator, meaning that a scope is considered an ancestor of
 * itself.
 */
export const isAncestorScope = (
  maybeAncestor: Scope | undefined,
  scope: Scope | undefined = currentScope
): boolean => {
  if (scope) {
    assertScopeNotDisposed(scope);
  }
  while (scope !== maybeAncestor) {
    if (!scope) {
      return false;
    }
    scope = scope[parentSymbol];
  }
  return true;
};

/**
 * This is a weak operator, meaning that a scope is considered a descendant of
 * itself.
 */
export const isDescendantScope = (
  maybeDescendant: Scope | undefined,
  scope: Scope | undefined = currentScope
): boolean => {
  if (maybeDescendant) {
    assertScopeNotDisposed(maybeDescendant);
  }
  while (scope !== maybeDescendant) {
    if (!maybeDescendant) {
      return false;
    }
    maybeDescendant = maybeDescendant[parentSymbol];
  }
  return true;
};

export const getContext = <Key extends keyof Scope, DefaultValue = undefined>(
  key: Key,
  defaultValue?: DefaultValue,
  scope: Scope | undefined = currentScope
): Required<Scope>[Key] | DefaultValue => {
  if (scope) {
    assertScopeNotDisposed(scope);
  }
  while (scope) {
    if (key in scope) {
      return scope[key] as Required<Scope>[Key];
    }
    scope = scope[parentSymbol];
  }
  return defaultValue as DefaultValue;
};

export const errScope = (
  error: unknown,
  scope: Scope | undefined = currentScope
): void => {
  if (scope) {
    assertScopeNotDisposed(scope);
  }
  const err = getContext(errSymbol, undefined, scope);
  if (err) {
    err(error);
  } else {
    queueMicrotask(() => {
      throw error;
    });
  }
};

export const runInScope = (
  callback: () => void,
  scope: Scope | undefined
): void => {
  if (scope) {
    assertScopeNotDisposed(scope);
  }
  const outerScope = currentScope;
  currentScope = scope;
  try {
    callback();
  } catch (error) {
    errScope(error, scope);
  } finally {
    currentScope = outerScope;
  }
};

export const createDisposable: {
  (disposable: () => void, scope?: Scope): void;
} = (disposable: () => void, scope: Scope | undefined = currentScope) => {
  if (!scope) {
    throw new Error("Disposables can only be created within a scope.");
  }
  assertScopeNotDisposed(scope);
  if (disposablesSymbol in scope) {
    if (Array.isArray(scope[disposablesSymbol])) {
      scope[disposablesSymbol].push(disposable);
    } else {
      scope[disposablesSymbol] = [scope[disposablesSymbol], disposable];
    }
  } else {
    scope[disposablesSymbol] = disposable;
  }
};

export const isScopeDisposed = (scope: Scope | undefined = currentScope) => {
  if (scope) {
    return disposedSymbol in scope;
  }
  return false;
};

/**
 * Marks `scope` and its descendants as disposed, and returns the "next" scope
 * from the last scope it traverses.
 */
const markAsDisposed = (scope: Scope): Scope | undefined => {
  let next = scope[nextSymbol];
  while (next && next[parentSymbol] === scope) {
    next = markAsDisposed(next);
  }

  scope[disposedSymbol] = true;

  return next;
};

/**
 * Runs disposables for `scope` and its descendants, and returns the "next"
 * scope from the last scope it traverses.
 */
const runDisposables = (scope: Scope): Scope | undefined => {
  let next = scope[nextSymbol];
  while (next && next[parentSymbol] === scope) {
    next = runDisposables(next);
  }

  if (scope[disposablesSymbol]) {
    if (Array.isArray(scope[disposablesSymbol])) {
      for (let i = scope[disposablesSymbol].length - 1; i >= 0; i--) {
        try {
          scope[disposablesSymbol][i]!();
        } catch (error) {
          queueMicrotask(() => {
            throw error;
          });
        }
      }
    } else {
      try {
        scope[disposablesSymbol]();
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }

  return next;
};

export const disposeScope = (scope: Scope): void => {
  assertScopeNotDisposed(scope);
  // Make sure the client will not be able to dispose scopes or create
  // disposables from inside disposables.
  markAsDisposed(scope);
  const next = runDisposables(scope);
  // Otherwise `scope` is a root node and we don't need to unlink anything.
  if (scope[previousSymbol]) {
    if (next) {
      scope[previousSymbol][nextSymbol] = next;
    } else {
      delete scope[previousSymbol][nextSymbol];
    }
    if (scope[nextSymbol]) {
      scope[nextSymbol][previousSymbol] = scope[previousSymbol];
    }
  }
};
