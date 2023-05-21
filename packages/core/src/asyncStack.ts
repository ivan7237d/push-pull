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
  if (syncStack === undefined) {
    return callback;
  }
  const stack = syncStack;
  return (...args) => {
    if (syncStack === undefined) {
      syncStack = stack;
      try {
        return stack(callback)(...args);
      } finally {
        syncStack = undefined;
      }
    } else {
      return callback(...args);
    }
  };
};
