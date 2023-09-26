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

export const getScope = () => currentScope;

export const createScope = (err?: (error: unknown) => void): Scope => {
  const scope: Scope = {};
  if (currentScope) {
    scope[parentSymbol] = currentScope;
    scope[previousSiblingSymbol] = currentScope;
    if (currentScope[nextSiblingSymbol]) {
      currentScope[nextSiblingSymbol][previousSiblingSymbol] = scope;
      scope[nextSiblingSymbol] = currentScope[nextSiblingSymbol];
    }
    currentScope[nextSiblingSymbol] = scope;
  }
  if (err) {
    scope[errSymbol] = err;
  }
  return scope;
};

export const getContext = <Key extends keyof Scope, DefaultValue = undefined>(
  key: Key,
  defaultValue?: DefaultValue
): Scope[Key] | DefaultValue => {
  let scope = currentScope;
  while (scope) {
    if (key in scope) {
      return scope[key];
    }
    scope = scope[parentSymbol];
  }
  return defaultValue;
};

export const runInScope = <T>(callback: () => T, scope?: Scope): T => {
  const outerScope = currentScope;
  currentScope = scope;
  if (scope && (errSymbol in scope || scope[parentSymbol] !== outerScope)) {
    try {
      return callback();
    } catch (error) {
      const err = getContext(errSymbol);
      if (err) {
        err(error);
      } else {
        queueMicrotask(() => {
          throw error;
        });
      }
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

export const createDisposable = (disposable: () => {}) => {
  if (!currentScope) {
    throw new Error("Disposables can only be created within a Scope.");
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

export const dispose = (scope: Scope) => {
  const head = scope[previousSiblingSymbol];
  let current = scope[nextSiblingSymbol];
  while (current && current[parentSymbol] === scope) {
    dispose(current);
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
