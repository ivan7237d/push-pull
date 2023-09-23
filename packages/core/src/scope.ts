type Scope = [dispose: () => void, err: () => void];

let currentScope: Scope | undefined;

export const createScope = (
  callback: () => void,
  err: (error: unknown) => void
): Scope => {
  currentScope;
  callback;
  err;
  throw "not implemented";
};
