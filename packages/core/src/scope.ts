interface Scope {}

let currentScope: Scope | undefined;

export const getScope = () => currentScope;

export const createScope = (err?: (error: unknown) => void): Scope => {
  return {};
};

export const runInScope = <T>(callback: () => T, scope?: Scope): T => {};

export const err = (error: unknown, scope?: Scope) => {};

export const createDisposable = (disposable: () => {}) => {};

export const dispose = (scope: Scope) => {};

export const getContext = <Key extends keyof Scope, DefaultValue = undefined>(
  key: Key,
  defaultValue?: DefaultValue
): Scope[Key] | DefaultValue => {};
