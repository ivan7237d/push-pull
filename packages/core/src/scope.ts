const parentSymbol = Symbol("parent");
const previousSymbol = Symbol("previous");
const nextSymbol = Symbol("next");
const runningSymbol = Symbol("running");
const disposablesSymbol = Symbol("disposables");
const disposedSymbol = Symbol("disposed");
const onErrorSymbol = Symbol("onError");

export interface Scope {
  [parentSymbol]?: Scope;
  [previousSymbol]?: Scope;
  [nextSymbol]?: Scope;
  [runningSymbol]?: true;
  [disposablesSymbol]?: (() => void) | (() => void)[];
  [disposedSymbol]?: true;
  [onErrorSymbol]?: (error: unknown, scope: Scope) => void;
}

let currentScope: Scope | undefined;

export const createRootScope = (
  onError?: (error: unknown, scope: Scope) => void
): Scope => {
  const newScope: Scope = {};
  if (onError) {
    newScope[onErrorSymbol] = onError;
  }
  return newScope;
};

export const createScope = (
  onError?: (error: unknown, scope: Scope) => void
): Scope => {
  const newScope: Scope = {};
  if (currentScope) {
    // This would happen in `onDispose` callback.
    if (disposedSymbol in currentScope) {
      throw new Error("You cannot create a child scope in a disposed scope.");
    }
    newScope[parentSymbol] = currentScope;
    newScope[previousSymbol] = currentScope;
    if (currentScope[nextSymbol]) {
      currentScope[nextSymbol][previousSymbol] = newScope;
      newScope[nextSymbol] = currentScope[nextSymbol];
    }
    currentScope[nextSymbol] = newScope;
  }
  if (onError) {
    newScope[onErrorSymbol] = onError;
  }
  return newScope;
};

export const getContext = <Key extends keyof Scope, DefaultValue = undefined>(
  key: Key,
  defaultValue?: DefaultValue
): Required<Scope>[Key] | DefaultValue => {
  let scope = currentScope;
  while (scope) {
    if (key in scope) {
      return scope[key] as Required<Scope>[Key];
    }
    scope = scope[parentSymbol];
  }
  return defaultValue as DefaultValue;
};

export const runInScope: {
  <T>(scope: Scope, callback: () => T): T | void;
} = <T>(scope: Scope | undefined, callback: () => T): T | void => {
  if (disposedSymbol in scope!) {
    throw new Error("You cannot run a callback in a disposed scope.");
  }
  const outerRunning = runningSymbol in scope!;
  const outerScope = currentScope;
  scope![runningSymbol] = true;
  currentScope = scope;
  try {
    try {
      return callback();
    } finally {
      if (!outerRunning) {
        delete (scope as Scope)[runningSymbol];
      }
      currentScope = outerScope;
    }
  } catch (error) {
    // We dispose before calling the error handler (and thus passing control to
    // the client) to make sure that once a scope errors, the clint can't run a
    // callback in it.

    // eslint-disable-next-line no-use-before-define
    disposeScope(scope!);

    // This is much the same as calling `getContext`, but we're doing it this
    // way as a performance optimization.
    do {
      if (onErrorSymbol in scope!) {
        break;
      }
      scope = scope![parentSymbol];
    } while (scope);

    if (scope) {
      try {
        scope[onErrorSymbol]!(error, scope);
        return;
      } catch (newError) {
        error = newError;
      }
    }
    queueMicrotask(() => {
      throw error;
    });
  }
};

export const onDispose = (disposable: () => void) => {
  if (!currentScope) {
    throw new Error("`onDispose` must be called within a `Scope`.");
  }
  // This would happen in `onDispose` callback.
  if (disposedSymbol in currentScope) {
    throw new Error("You cannot call `onDispose` in a disposed scope.");
  }
  if (disposablesSymbol in currentScope) {
    if (Array.isArray(currentScope[disposablesSymbol])) {
      currentScope[disposablesSymbol].push(disposable);
    } else {
      currentScope[disposablesSymbol] = [
        currentScope[disposablesSymbol],
        disposable,
      ];
    }
  } else {
    currentScope[disposablesSymbol] = disposable;
  }
};

export const isScopeDisposed = (
  scope: Scope | undefined = currentScope
): boolean => scope !== undefined && disposedSymbol in scope;

/**
 * Marks `scope` and its descendants as disposed, and returns the "next" scope
 * from the last scope it traverses.
 */
const markAsDisposed = (scope: Scope): Scope | undefined => {
  // Since this check is made for the scope and all of its descendants before
  // actually marking any scope as disposed or in general making any writes, we
  // will not end up in a half-disposed state.
  if (runningSymbol in scope) {
    throw new Error(
      "You cannot dispose a scope while a callback is running in that scope."
    );
  }

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
    const outerScope = currentScope;
    currentScope = scope;
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
    currentScope = outerScope;
  }

  return next;
};

export const disposeScope = (scope: Scope): void => {
  if (disposedSymbol in scope) {
    throw new Error("The scope is already disposed.");
  }
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
