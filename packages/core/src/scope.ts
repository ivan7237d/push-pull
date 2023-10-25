const parentSymbol = Symbol("parent");
const previousSymbol = Symbol("previous");
const nextSymbol = Symbol("next");
const runningSymbol = Symbol("running");
const disposedSymbol = Symbol("disposed");
const disposablesSymbol = Symbol("disposables");
const errorSymbol = Symbol("error");
const onErrorSymbol = Symbol("onError");

export interface Scope {
  [parentSymbol]?: Scope;
  [previousSymbol]?: Scope;
  [nextSymbol]?: Scope;
  [runningSymbol]?: true;
  [disposedSymbol]?: true;
  [disposablesSymbol]?: (() => void) | (() => void)[];
  [errorSymbol]?: unknown;
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
  if (runningSymbol in scope) {
    throw new Error(
      "You cannot dispose a scope while a callback is running in that scope."
    );
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

export const runInScope = <T>(scope: Scope, callback: () => T): T | void => {
  if (disposedSymbol in scope) {
    throw new Error("You cannot run a callback in a disposed scope.");
  }
  if (runningSymbol in scope) {
    throw new Error(
      "In a nested `runInScope` call, you cannot use the same scope or an ancestor scope."
    );
  }
  let nearestRunningAncestor: Scope | undefined = scope;
  do {
    nearestRunningAncestor[runningSymbol] = true;
    nearestRunningAncestor = nearestRunningAncestor[parentSymbol];
  } while (
    nearestRunningAncestor &&
    !(runningSymbol in nearestRunningAncestor)
  );
  const outerScope = currentScope;
  currentScope = scope;
  try {
    try {
      return callback();
    } finally {
      currentScope = outerScope;
      let ancestor: Scope | undefined = scope;
      do {
        delete ancestor![runningSymbol];
        ancestor = ancestor![parentSymbol];
      } while (ancestor !== nearestRunningAncestor);
    }
  } catch (error) {
    while (true) {
      // We dispose before calling the error handler (and thus passing control to
      // the client) to make sure that once a scope errors, the clint can't run a
      // callback in it.

      disposeScope(scope);
      if (onErrorSymbol in scope) {
        currentScope = scope[parentSymbol];
        try {
          scope[onErrorSymbol](error, scope);
          return;
        } catch (newError) {
          // We keep going with the new error as if there was no error handler.
          error = newError;
        } finally {
          currentScope = outerScope;
        }
      }
      if (parentSymbol in scope) {
        scope = scope[parentSymbol];
        if (scope === nearestRunningAncestor) {
          scope[errorSymbol] =
            errorSymbol in scope
              ? AggregateError([
                  ...(scope[errorSymbol] instanceof AggregateError
                    ? scope[errorSymbol].errors
                    : [scope[errorSymbol]]),
                  ...(error instanceof AggregateError ? error.errors : [error]),
                ])
              : error;
          return;
        }
      } else {
        queueMicrotask(() => {
          throw error;
        });
        return;
      }
    }
  } finally {
    if (currentScope && errorSymbol in currentScope) {
      const error = currentScope[errorSymbol];
      delete currentScope[errorSymbol];

      // The catch clause doesn't throw, so we're not overwriting an error here.

      // eslint-disable-next-line no-unsafe-finally
      throw error;
    }
  }
};

/**
 * Whether a callback is currently running in the provided scope or one of its
 * descendants (not counting `onDispose` callbacks).
 */
export const isScopeRunning = (scope: Scope): boolean => runningSymbol in scope;

export const isScopeDisposed = (scope: Scope): boolean =>
  disposedSymbol in scope;

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
