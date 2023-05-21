interface Decorator {
  <Args extends unknown[], Retval>(callback: (...args: Args) => Retval): (
    ...args: Args
  ) => Retval;
}

let syncStack: Decorator | undefined;

export const extendAsyncStack = <Args extends unknown[], Retval>(
  stack: Decorator,
  callback: (...args: Args) => Retval,
  ...args: Args
) => {
  const syncStackSnapshot = syncStack;
  syncStack = syncStackSnapshot
    ? (callback) => syncStackSnapshot(stack(callback))
    : stack;
  try {
    return stack(callback)(...args);
  } finally {
    syncStack = syncStackSnapshot;
  }
};

export const withAsyncStack: Decorator = (callback) => {
  const stack = syncStack;
  return (...args) => {
    const syncStackSnapshot = syncStack;
    syncStack = stack;
    try {
      return (stack ? stack(callback) : callback)(...args);
    } finally {
      syncStack = syncStackSnapshot;
    }
  };
};
