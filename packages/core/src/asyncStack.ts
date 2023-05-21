interface Decorator {
  <Args extends unknown[], Retval>(callback: (...args: Args) => Retval): (
    ...args: Args
  ) => Retval;
}

let globalStack: Decorator | undefined;

export const extendAsyncStack = <Args extends unknown[], Retval>(
  stack: Decorator,
  callback: (...args: Args) => Retval,
  ...args: Args
): Retval => {
  const globalStackSnapshot = globalStack;
  globalStack = globalStackSnapshot
    ? (callback) => globalStackSnapshot(stack(callback))
    : stack;
  try {
    return stack(callback)(...args);
  } finally {
    globalStack = globalStackSnapshot;
  }
};

export const withAsyncStack: Decorator = (callback) => {
  if (globalStack === undefined) {
    return callback;
  }
  const stack = globalStack;
  return (...args) => {
    if (globalStack) {
      throw new Error(
        "You cannot call a function wrapped in `withAsyncStack` synchronously."
      );
    }
    globalStack = stack;
    try {
      return stack(callback)(...args);
    } finally {
      globalStack = undefined;
    }
  };
};
