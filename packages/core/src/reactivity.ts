import {
  Scope,
  createRootScope,
  createScope,
  disposeScope,
  getContext,
  isScopeDisposed,
  onDispose,
  runInScope,
} from "./scope";

const parentsSymbol = Symbol("parents");
const childrenSymbol = Symbol("children");
const scopeSymbol = Symbol("scope");
const checkSymbol = Symbol("check");
const runningSymbol = Symbol("running");
const returnValueSymbol = Symbol("value");
const errorSymbol = Symbol("error");
const callbackSymbol = Symbol("callback");

interface Subject {
  // eslint-disable-next-line no-use-before-define
  [parentsSymbol]?: (LazyReaction | Effect)[];
}

/**
 * In the context of the [three-colors
 * algorithm](https://dev.to/modderme123/super-charging-fine-grained-reactive-performance-47ph),
 *
 * - "clean" state = either `[errorSymbol]` is present, or `[scopeSymbol]` is
 *   present and points to a scope that has no `[checkSymbol]`,
 *
 * - "check" state = `[errorSymbol]` is absent, `[scopeSymbol]` is present and
 *   points to a scope that has `[checkSymbol]`,
 *
 * - "dirty" state = absent `[errorSymbol]` and `[scopeSymbol]`.
 *
 * What that implies is that error handling aside, marking a reaction as dirty
 * is the same operation as disposing the associated scope.
 */
interface Reaction {
  // eslint-disable-next-line no-use-before-define
  [childrenSymbol]?: (Subject | LazyReaction)[];
  [scopeSymbol]?: Scope;
}

interface LazyReaction extends Reaction, Subject {
  (): unknown;
  [runningSymbol]?: true;
  [returnValueSymbol]?: unknown;
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
     * Used in `[scopeSymbol]` of a `Reaction` and points to that reaction.
     */
    [checkSymbol]?: LazyReaction | Effect;
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
const effectQueue: Effect[] = [];
const disposalQueue: LazyReaction[] = [];
let processingQueues = false;

/**
 * Makes sure ancestors are marked as at least "check", and if `dirty` is
 * `true`, also that parents are marked as dirty. Queues up any effects that are
 * no longer clean.
 */
const markAncestors = (subject: Subject | LazyReaction, dirty: boolean) => {
  if (parentsSymbol in subject) {
    for (let i = 0; i < subject[parentsSymbol].length; i++) {
      const reaction = subject[parentsSymbol][i]!;
      if (errorSymbol in reaction) {
        delete reaction[errorSymbol];
        markAncestors(reaction, false);
      } else if (scopeSymbol in reaction) {
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

const maybeProcessQueues = () => {
  if (!processingQueues) {
    processingQueues = true;
    for (let i = 0; i < effectQueue.length; i++) {
      const effect = effectQueue[i]!;
      if (!isScopeDisposed(effect)) {
        // eslint-disable-next-line no-use-before-define
        sweep(effect);
      }
    }
    effectQueue.length = 0;
    for (let i = 0; i < disposalQueue.length; i++) {
      const lazyReaction = disposalQueue[i]!;
      if (!(parentsSymbol in lazyReaction)) {
        removeFromChildren(lazyReaction, 0);
        delete lazyReaction[childrenSymbol];
        // TODO: handle re-entry.
        if (scopeSymbol in lazyReaction) {
          disposeScope(lazyReaction[scopeSymbol]);
          delete lazyReaction[scopeSymbol];
        }
        delete lazyReaction[returnValueSymbol];
        delete lazyReaction[errorSymbol];
      }
    }
    disposalQueue.length = 0;
    processingQueues = false;
  }
};

export const push: {
  <T>(subject: T & (T extends Function ? () => void : object)): void;
} = (
  // This cannot be an `Effect` because we're not exposing effects to the
  // client.
  subject: Subject | LazyReaction
) => {
  markAncestors(subject, true);
  maybeProcessQueues();
};

const onLazyReactionError = (error: unknown) => {
  (currentReaction as LazyReaction)[errorSymbol] = error;
};

const runReaction = (reaction: LazyReaction | Effect) => {
  const outerCurrentReaction = currentReaction;
  const outerNewChildren = newChildren;
  const outerUnchangedChildrenCount = unchangedChildrenCount;
  currentReaction = reaction;
  newChildren = undefined as typeof newChildren;
  unchangedChildrenCount = 0;
  // If it's an effect.
  if (callbackSymbol in reaction) {
    const scope = runInScope(createScope, reaction)!;
    runInScope(reaction[callbackSymbol], scope);
    if (!isScopeDisposed(reaction)) {
      reaction[scopeSymbol] = scope;
    }
  } else {
    const scope = createRootScope(onLazyReactionError);
    reaction[runningSymbol] = true;
    const returnValue = runInScope(reaction, scope);
    delete reaction[runningSymbol];
    if (errorSymbol in reaction) {
      delete reaction[returnValueSymbol];
      markAncestors(reaction, true);
    } else {
      reaction[scopeSymbol] = scope;
      if (
        returnValueSymbol in reaction &&
        reaction[returnValueSymbol] !== returnValue
      ) {
        // TODO: what if the client pulls from onDispose
        markAncestors(reaction, true);
      }
      reaction[returnValueSymbol] = returnValue;
    }
  }
  if (newChildren) {
    removeFromChildren(reaction, unchangedChildrenCount);
    if (childrenSymbol in reaction && unchangedChildrenCount > 0) {
      reaction[childrenSymbol].length =
        unchangedChildrenCount + newChildren.length;
      for (let i = 0; i < newChildren.length; i++) {
        reaction[childrenSymbol][unchangedChildrenCount + i] = newChildren[i]!;
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
  currentReaction = outerCurrentReaction;
  newChildren = outerNewChildren;
  unchangedChildrenCount = outerUnchangedChildrenCount;
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
  // If the reaction is clean.
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
    const ownerToSweep = runInScope(getOwnerToSweep, reaction);
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
  // This cannot be an `Effect` because we're not exposing effects to the
  // client.
  subject: Subject | LazyReaction
) => {
  if (runningSymbol in subject) {
    throw new Error("Cyclical dependency.");
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
  }
  if (typeof subject === "function") {
    sweep(subject);
    if (errorSymbol in subject) {
      throw subject[errorSymbol];
    }
    return subject[returnValueSymbol] as any;
  }
};

export const createEffect = (callback: () => void): void => {
  const effect = createScope() as Effect;
  effect[callbackSymbol] = callback;
  onDispose(() => {
    removeFromChildren(effect, 0);
    // TODO: process just the disposal queue.
    maybeProcessQueues();
  });
  sweep(effect);
};
