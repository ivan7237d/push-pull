let syncStack: ((callback: () => void) => void) | undefined;

export const callWithAsyncStack = (
  stack: (callback: () => void) => void,
  callback: () => void
) => {
  const syncStackSnapshot = syncStack;
  syncStack = syncStackSnapshot
    ? (callback) => syncStackSnapshot(() => stack(callback))
    : stack;
  try {
    stack(callback);
  } finally {
    syncStack = syncStackSnapshot;
  }
};

export const withAsyncStack = (callback: () => void): (() => void) => {
  if (syncStack === undefined) {
    return callback;
  }
  const stack = syncStack;
  return () => {
    if (syncStack === undefined) {
      syncStack = stack;
      try {
        stack(callback);
      } finally {
        syncStack = undefined;
      }
    } else {
      callback();
    }
  };
};
