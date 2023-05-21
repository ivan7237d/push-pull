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
) => {
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
  const stack = globalStack;
  return (...args) => {
    const globalStackSnapshot = globalStack;
    globalStack = stack;
    try {
      return (stack ? stack(callback) : callback)(...args);
    } finally {
      globalStack = globalStackSnapshot;
    }
  };
};
