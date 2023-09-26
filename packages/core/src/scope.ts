const parentSymbol = Symbol("parent");
const previousSiblingSymbol = Symbol("previousSibling");
const nextSiblingSymbol = Symbol("nextSibling");
const disposablesSymbol = Symbol("disposables");
const errSymbol = Symbol("err");

interface Scope {
  [parentSymbol]?: Scope;
  [previousSiblingSymbol]?: Scope;
  [nextSiblingSymbol]?: Scope;
  [disposablesSymbol]?: (() => void) | (() => void)[];
  [errSymbol]?: (error: unknown) => void;
}

let currentScope: Scope | undefined;

export const getScope = (): Scope | undefined => currentScope;

export const createScope = (
  err?: (error: unknown) => void,
  scope: Scope | undefined = currentScope
): Scope => {
  const newScope: Scope = {};
  if (scope) {
    newScope[parentSymbol] = scope;
    newScope[previousSiblingSymbol] = scope;
    if (scope[nextSiblingSymbol]) {
      scope[nextSiblingSymbol][previousSiblingSymbol] = newScope;
      newScope[nextSiblingSymbol] = scope[nextSiblingSymbol];
    }
    scope[nextSiblingSymbol] = newScope;
  }
  if (err) {
    newScope[errSymbol] = err;
  }
  return newScope;
};

export const getContext = <Key extends keyof Scope, DefaultValue = undefined>(
  key: Key,
  defaultValue?: DefaultValue,
  scope: Scope | undefined = currentScope
): Scope[Key] | DefaultValue => {
  while (scope) {
    if (key in scope) {
      return scope[key];
    }
    scope = scope[parentSymbol];
  }
  return defaultValue;
};

export const errScope = (
  error: unknown,
  scope: Scope | undefined = currentScope
): void => {
  const err = getContext(errSymbol, undefined, scope);
  if (err) {
    err(error);
  } else {
    queueMicrotask(() => {
      throw error;
    });
  }
};

export const runInScope = <T>(
  callback: () => T,
  scope: Scope | undefined
): T => {
  const outerScope = currentScope;
  currentScope = scope;
  if (scope && (errSymbol in scope || scope[parentSymbol] !== outerScope)) {
    try {
      return callback();
    } catch (error) {
      errScope(scope);
    } finally {
      currentScope = outerScope;
    }
  }
  try {
    return callback();
  } finally {
    currentScope = outerScope;
  }
};

export const createDisposable: {
  (disposable: () => {}, scope?: Scope): void;
} = (disposable: () => {}, scope: Scope | undefined = currentScope) => {
  if (!scope) {
    throw new Error("Disposables can only be created within a Scope.");
  }
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

export const disposeScope = (scope: Scope): void => {
  const head = scope[previousSiblingSymbol];
  let current = scope[nextSiblingSymbol];
  while (current && current[parentSymbol] === scope) {
    disposeScope(current);
    current = current[nextSiblingSymbol];
  }

  if (scope[previousSiblingSymbol]) {
    delete scope[previousSiblingSymbol][nextSiblingSymbol];
  }
  delete scope[parentSymbol];
  delete scope[previousSiblingSymbol];
  if (scope[disposablesSymbol]) {
    if (Array.isArray(scope[disposablesSymbol])) {
      const disposables = scope[disposablesSymbol];
      for (let i = 0; i < disposables.length; i++) {
        try {
          disposables[i]!();
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
    delete scope[disposablesSymbol];
  }

  if (current) {
    delete current[previousSiblingSymbol];
  }
  if (head) {
    if (current) {
      head[nextSiblingSymbol] = current;
    } else {
      delete head[nextSiblingSymbol];
    }
  }
};
