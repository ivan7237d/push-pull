import {
  Scope,
  createRootScope,
  createScope,
  disposeScope,
  getContext,
  isScopeDisposed,
  isScopeRunning,
  onDispose,
  runInScope,
} from "./scope";

const parentsSymbol = Symbol("parents");
const childrenSymbol = Symbol("children");
const scopeSymbol = Symbol("scope");
const checkSymbol = Symbol("check");
const lazyReactionSymbol = Symbol("lazyReaction");
const returnValueSymbol = Symbol("value");
const errorSymbol = Symbol("error");
const callbackSymbol = Symbol("callback");

interface Subject {
  /**
   * Reactions that have pulled this subject.
   */
  // eslint-disable-next-line no-use-before-define
  [parentsSymbol]?: (LazyReaction | Effect)[];
}

/**
 * In the context of the [three-colors
 * algorithm](https://dev.to/modderme123/super-charging-fine-grained-reactive-performance-47ph),
 *
 * - "clean" state = `[scopeSymbol]` is present and points to a scope that has
 *   no `[checkSymbol]`,
 *
 * - "check" state = `[scopeSymbol]` is present and points to a scope that has
 *   `[checkSymbol]`,
 *
 * - "dirty" state = absent `[scopeSymbol]`.
 *
 * This implies that marking a reaction as dirty is the same operation as
 * disposing the associated scope.
 */
interface Reaction {
  /**
   * Subjects that this reaction has pulled.
   */
  // eslint-disable-next-line no-use-before-define
  [childrenSymbol]?: (Subject | LazyReaction)[];
  /**
   * The scope in which the reaction is run. When the reaction is re-run, this
   * scope is disposed and re-created.
   */
  [scopeSymbol]?: Scope;
}

interface LazyReaction extends Reaction, Subject {
  (): unknown;
  [returnValueSymbol]?: unknown;
  /**
   * When a lazy reaction throws an error, we store the error here. After that,
   * as each parent tries to pull the reaction, it will remove the edge, so
   * that finally the reaction has no parents and gets cleaned up.
   */
  [errorSymbol]?: unknown;
}

/**
 * An effect = eager reaction. Effect objects are not made accessible to the
 * client and so are guaranteed to not be used as subjects. An effect object is
 * among other things a `Scope` which is a child of the scope where `createEffect`
 * was run and the parent of `effect[scopeSymbol]`.
 */
interface Effect extends Reaction, Scope {
  [callbackSymbol]: () => void;
}

declare module "./scope" {
  interface Scope {
    /**
     * Used in `[scopeSymbol]` of a `Reaction` and points to that reaction. This
     * prop is used to indicate that a reaction is in "check" state. Storing the
     * reaction (rather than say just `true`) as value allows us to take
     * advantage of `getContext` to retrieve the owner of an effect.
     */
    [checkSymbol]?: LazyReaction | Effect;
    /**
     * Always present in `[scopeSymbol]` of a `LazyReaction` and points to that
     * reaction. This prop is used for a performance optimization where we use a
     * single global error handler function that handles errors in lazy
     * reactions, instead of creating a function for each lazy reaction
     * individually.
     */
    [lazyReactionSymbol]?: LazyReaction;
  }
}

let currentReaction: LazyReaction | Effect | undefined;
/**
 * As part of a perf optimization trick, when running a reaction, we bump
 * `unchangedChildrenCount` until the children array diverges from the old
 * children array, at which point we begin adding children to `newChildren`.
 * This allows to avoid updating children when they stay the same.
 */
let newChildren: (Subject | LazyReaction)[] | undefined;
let unchangedChildrenCount = 0;

/**
 * Effect queue is only flushed when this counter goes down to 0.
 */
let effectLock = 0;
const effectQueue: Effect[] = [];

/**
 * Disposal queue is only flushed when this counter goes down to 0.
 */
let disposalLock = 0;
const disposalQueue: LazyReaction[] = [];

/**
 * Makes sure ancestors are marked as at least "check", and if `dirty` is
 * `true`, also that parents are marked as dirty. Queues up any effects that are
 * no longer clean.
 */
const markAncestors = (subject: Subject | LazyReaction, dirty: boolean) => {
  if (parentsSymbol in subject) {
    for (let i = 0; i < subject[parentsSymbol].length; i++) {
      const reaction = subject[parentsSymbol][i]!;
      if (scopeSymbol in reaction && !isScopeRunning(reaction[scopeSymbol])) {
        // If the reaction is clean.
        if (!(checkSymbol in reaction[scopeSymbol])) {
          if (dirty) {
            disposeScope(reaction[scopeSymbol]);
            delete reaction[scopeSymbol];
          } else {
            reaction[scopeSymbol][checkSymbol] = reaction;
          }
          // If it's an effect.
          if (callbackSymbol in reaction) {
            effectQueue.push(reaction);
          } else {
            markAncestors(reaction, false);
          }
        } else if (dirty) {
          // Here the reaction is in "check" state, all its ancestors have
          // already been marked as at least "check", and if it's an effect,
          // it's been added to the effect queue.
          disposeScope(reaction[scopeSymbol]);
          delete reaction[scopeSymbol];
        }
      }
    }
  }
};

const removeFromChildren = (parent: LazyReaction | Effect, index: number) => {
  if (childrenSymbol in parent) {
    for (let i = index; i < parent[childrenSymbol].length; i++) {
      const child = parent[childrenSymbol][i]!;
      // Explicitly typing because TS is thrown off by the `parents[swap] = ...`
      // line below.
      const parents: (LazyReaction | Effect)[] = child[parentsSymbol]!;
      if (parents.length === 1) {
        delete child[parentsSymbol];
        if (typeof child === "function") {
          disposalQueue.push(child);
        }
      } else {
        const swap = parents.indexOf(parent);
        parents[swap] = parents[parents.length - 1]!;
        parents.pop();
      }
    }
  }
};

const maybeFlushDisposalQueue = () => {
  if (!disposalLock) {
    for (let i = 0; i < disposalQueue.length; i++) {
      const lazyReaction = disposalQueue[i]!;
      if (!(parentsSymbol in lazyReaction)) {
        removeFromChildren(lazyReaction, 0);
        delete lazyReaction[childrenSymbol];
        if (scopeSymbol in lazyReaction) {
          disposeScope(lazyReaction[scopeSymbol]);
          delete lazyReaction[scopeSymbol];
        }
        delete lazyReaction[returnValueSymbol];
        delete lazyReaction[errorSymbol];
      }
    }
    disposalQueue.length = 0;
  }
};

const maybeFlushEffectQueue = () => {
  if (!effectLock) {
    effectLock++;
    disposalLock++;
    for (let i = 0; i < effectQueue.length; i++) {
      const effect = effectQueue[i]!;
      if (!isScopeDisposed(effect)) {
        // eslint-disable-next-line no-use-before-define
        sweep(effect);
      }
    }
    effectQueue.length = 0;
    effectLock--;
    disposalLock--;
    maybeFlushDisposalQueue();
  }
};

export const push: {
  <T>(subject: T & (T extends Function ? () => void : object)): void;
} = (
  // This cannot be an `Effect` because we're not exposing effect objects to the
  // client.
  subject: Subject | LazyReaction
) => {
  effectLock++;
  markAncestors(subject, true);
  effectLock--;
  maybeFlushEffectQueue();
};

const onLazyReactionError = (error: unknown, scope: Scope) => {
  const reaction = scope[lazyReactionSymbol]!;
  delete reaction[scopeSymbol];
  reaction[errorSymbol] = error;
  push(reaction);
};

const runReaction = (reaction: LazyReaction | Effect) => {
  const outerReaction = currentReaction;
  const outerNewChildren = newChildren;
  const outerUnchangedChildrenCount = unchangedChildrenCount;
  currentReaction = reaction;
  newChildren = undefined as typeof newChildren;
  unchangedChildrenCount = 0;
  try {
    // If it's an effect.
    if (callbackSymbol in reaction) {
      reaction[scopeSymbol] = runInScope(reaction, createScope)!;
      // Can re-throw if we're currently running the reaction that created this
      // effect.
      runInScope(reaction[scopeSymbol], reaction[callbackSymbol]);
      // If the effect has errored.
      if (isScopeDisposed(reaction)) {
        // Do not update edges.
        return;
      }
    } else {
      reaction[scopeSymbol] = createRootScope(onLazyReactionError);
      reaction[scopeSymbol][lazyReactionSymbol] = reaction;
      const returnValue = runInScope(reaction[scopeSymbol], reaction);
      if (errorSymbol in reaction) {
        return;
      }
      if (
        returnValueSymbol in reaction &&
        reaction[returnValueSymbol] !== returnValue
      ) {
        // TODO: what if the client pulls from onDispose
        markAncestors(reaction, true);
      }
      reaction[returnValueSymbol] = returnValue;
    }

    // The rest of this `try` clause is saving the edges collected using
    // `newChildren` and `unchangedChildrenCount`.
    if (newChildren) {
      removeFromChildren(reaction, unchangedChildrenCount);
      if (childrenSymbol in reaction && unchangedChildrenCount > 0) {
        reaction[childrenSymbol].length =
          unchangedChildrenCount + newChildren.length;
        for (let i = 0; i < newChildren.length; i++) {
          reaction[childrenSymbol][unchangedChildrenCount + i] =
            newChildren[i]!;
        }
      } else {
        reaction[childrenSymbol] = newChildren;
      }
      for (
        let i = unchangedChildrenCount;
        i < reaction[childrenSymbol].length;
        i++
      ) {
        const child = reaction[childrenSymbol][i]!;
        if (parentsSymbol in child) {
          child[parentsSymbol].push(reaction);
        } else {
          child[parentsSymbol] = [reaction];
        }
      }
    } else if (
      childrenSymbol in reaction &&
      unchangedChildrenCount < reaction[childrenSymbol].length
    ) {
      removeFromChildren(reaction, unchangedChildrenCount);
      reaction[childrenSymbol].length = unchangedChildrenCount;
    }
  } finally {
    currentReaction = outerReaction;
    newChildren = outerNewChildren;
    unchangedChildrenCount = outerUnchangedChildrenCount;
  }
};

/**
 * Find the nearest ancestor scope that is the `[scopeSymbol]` of a reaction in
 * "check" state, and return that reaction.
 */
const getOwnerToSweep = () => getContext(checkSymbol);

/**
 * Ensures the `reaction` is clean.
 */
const sweep = (reaction: LazyReaction | Effect) => {
  // If the reaction is clean or has an error.
  if (
    errorSymbol in reaction ||
    (scopeSymbol in reaction && !(checkSymbol in reaction[scopeSymbol]))
  ) {
    return;
  }

  // If the reaction is an effect.
  if (callbackSymbol in reaction) {
    // See if there is another effect or a lazy reaction in whose
    // `[scopeSymbol]` this effect was created and that may re-run. If it does
    // get re-run, this effect would be disposed, so we sweep the owner first,
    // and return early if the effect ends up disposed.
    const ownerToSweep = runInScope(reaction, getOwnerToSweep);
    if (ownerToSweep) {
      sweep(ownerToSweep);
    }
    if (isScopeDisposed(reaction)) {
      return;
    }
  }

  // If the reaction is in "check" state. In this case we don't know if the
  // reaction needs to be run, but by recursively calling `sweep` for children,
  // we'll eventually know one way or the other.
  if (scopeSymbol in reaction && checkSymbol in reaction[scopeSymbol]) {
    for (let i = 0; i < reaction[childrenSymbol]!.length; i++) {
      const child = reaction[childrenSymbol]![i]!;
      if (typeof child === "function") {
        sweep(child);
      }
      // If the reaction is dirty.
      if (!(scopeSymbol in reaction)) {
        break;
      }
    }
  }

  if (scopeSymbol in reaction) {
    // If the reaction is still not dirty, this means we never broke out of the
    // loop above and all the children are now clean, and so we can mark
    // `reaction` as clean too.
    delete reaction[scopeSymbol][checkSymbol];
  } else {
    // Here the reaction is dirty.
    runReaction(reaction);
  }
};

export const pull: {
  <Subject, ReturnValue = void>(
    subject: Subject & (Subject extends Function ? () => ReturnValue : object)
  ): ReturnValue;
} = (
  // This cannot be an `Effect` because we're not exposing effect objects to the
  // client.
  subject: Subject | LazyReaction
) => {
  disposalLock++;
  try {
    if (scopeSymbol in subject && isScopeRunning(subject[scopeSymbol])) {
      throw new Error(
        "Cyclical dependency between lazy reactions. A dependency is created when a lazy reaction pulls another, either directly or in a descendant effect."
      );
    }
    if (typeof subject === "function") {
      sweep(subject);
      if (errorSymbol in subject) {
        throw subject[errorSymbol];
      }
    }
    if (currentReaction) {
      if (
        !newChildren &&
        currentReaction[childrenSymbol]?.[unchangedChildrenCount] === subject
      ) {
        unchangedChildrenCount++;
      } else if (newChildren) {
        newChildren.push(subject);
      } else {
        newChildren = [subject];
      }
    } else if (typeof subject === "function" && !(parentsSymbol in subject)) {
      disposalQueue.push(subject);
    }
    if (typeof subject === "function") {
      return subject[returnValueSymbol] as any;
    }
  } finally {
    disposalLock--;
    maybeFlushDisposalQueue();
  }
};

export const createEffect = (callback: () => void): void => {
  const effect = createScope() as Effect;
  effect[callbackSymbol] = callback;
  onDispose(() => {
    removeFromChildren(effect, 0);
    maybeFlushDisposalQueue();
  });
  disposalLock++;
  try {
    sweep(effect);
  } finally {
    disposalLock--;
  }
  maybeFlushDisposalQueue();
};

export const untrack = <T>(callback: () => T): T => {
  const outerReaction = currentReaction;
  currentReaction = undefined;
  try {
    return callback();
  } finally {
    currentReaction = outerReaction;
  }
};

export const batch = <T>(callback: () => T): T => {
  effectLock++;
  disposalLock++;
  try {
    return callback();
  } finally {
    effectLock--;
    disposalLock--;
    maybeFlushEffectQueue();
  }
};
