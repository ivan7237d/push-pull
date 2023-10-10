import {
  Scope,
  createScope,
  disposeScope,
  getContext,
  isScopeDisposed,
  onDispose,
  rootScope,
  runInScope,
} from "./scope";

const parentsSymbol = Symbol("parents");
const childrenSymbol = Symbol("children");
const scopeSymbol = Symbol("scope");
const checkSymbol = Symbol("check");
const runningSymbol = Symbol("running");
const callbackSymbol = Symbol("callback");

interface Subject {
  // eslint-disable-next-line no-use-before-define
  [parentsSymbol]?: (LazyReaction | Effect)[];
}

/**
 * In the context of the [three-colors
 * algorithm](https://dev.to/modderme123/super-charging-fine-grained-reactive-performance-47ph),
 *
 * - "clean" state = `[scopeSymbol]` is present and the scope has no
 *   `[checkSymbol]`,
 *
 * - "check" state = `[scopeSymbol]` is present and the scope has
 *   `[checkSymbol]`,
 *
 * - "dirty" state = absent `[scopeSymbol]`.
 *
 * What that implies is that marking a reaction as dirty is the same operation
 * as disposing the scope, and that when we have an effect to sweep, we can use
 * `getContext` to get hold of reactions that created that effect and need to be
 * swept first.
 */
interface Reaction {
  // eslint-disable-next-line no-use-before-define
  [childrenSymbol]?: (Subject | LazyReaction)[];
  [scopeSymbol]?: Scope;
}

interface LazyReaction extends Reaction, Subject {
  (): void;
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
    /**
     * Used in `[scopeSymbol]` of a `Reaction` and points to that reaction.
     */
    [runningSymbol]?: LazyReaction | Effect;
  }
}

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

const pushReaction = (reaction: LazyReaction | Effect, dirty?: boolean) => {
  // TODO: handle the case of cyclical dependency?

  // If the reaction is in "clean" or "check" state and not currently running.
  if (scopeSymbol in reaction && !(runningSymbol in reaction[scopeSymbol])) {
    // If the reaction is clean.
    if (!(checkSymbol in reaction[scopeSymbol])) {
      if (parentsSymbol in reaction) {
        for (let i = 0; i < reaction[parentsSymbol].length; i++) {
          pushReaction(reaction[parentsSymbol][i]!, false);
        }
      }
      // If it's an effect.
      if (callbackSymbol in reaction) {
        effectQueue.push(reaction);
      }
      if (dirty) {
        disposeScope(reaction[scopeSymbol]);
        delete reaction[scopeSymbol];
      } else {
        reaction[scopeSymbol][checkSymbol] = reaction;
      }
    } else if (dirty) {
      // Here the reaction is in "check" state, all its ancestors have already
      // been marked as (at least) "check", and if it's an effect, it's been
      // added to the effect queue.
      disposeScope(reaction[scopeSymbol]);
      delete reaction[scopeSymbol];
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
  if (parentsSymbol in subject) {
    for (let i = 0; i < subject[parentsSymbol].length; i++) {
      pushReaction(subject[parentsSymbol][i]!, true);
    }
  }
  maybeProcessQueues();
};

const runReaction = (reaction: LazyReaction | Effect) => {
  const outerNewChildren = newChildren;
  const outerUnchangedChildrenCount = unchangedChildrenCount;
  newChildren = undefined as typeof newChildren;
  unchangedChildrenCount = 0;
  let callback: () => void;
  if (callbackSymbol in reaction) {
    callback = reaction[callbackSymbol];
  } else {
    callback = reaction;
  }
  reaction[scopeSymbol] = createScope(
    // TODO error handling
    undefined,
    callbackSymbol in reaction ? reaction : rootScope
  );
  reaction[scopeSymbol][runningSymbol] = reaction;
  runInScope(callback, reaction[scopeSymbol]);
  delete reaction[scopeSymbol][runningSymbol];
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
  newChildren = outerNewChildren;
  unchangedChildrenCount = outerUnchangedChildrenCount;
};

/**
 * Ensures the `reaction` is clean.
 */
const sweep = (reaction: LazyReaction | Effect) => {
  // If the reaction is clean.
  if (scopeSymbol in reaction && !(checkSymbol in reaction[scopeSymbol])) {
    return;
  }

  // If the reaction is an effect.
  if (callbackSymbol in reaction) {
    // See if there is another effect or a lazy reaction in whose scope this
    // effect was created and that may re-run. If it does get re-run, this
    // effect would be disposed, so we sweep the ancestor first, and return
    // early if we end up disposed.
    const check = getContext(checkSymbol, undefined, reaction);
    if (check) {
      sweep(check);
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
  <T>(subject: T & (T extends Function ? () => void : object)): void;
} = (
  // This cannot be an `Effect` because we're not exposing effects to the
  // client.
  subject: Subject | LazyReaction
) => {
  const reaction = getContext(runningSymbol);
  if (reaction) {
    if (
      !newChildren &&
      reaction[childrenSymbol]?.[unchangedChildrenCount] === subject
    ) {
      unchangedChildrenCount++;
    } else if (newChildren) {
      newChildren.push(subject);
    } else {
      newChildren = [subject];
    }
    if (typeof subject === "function") {
      sweep(subject);
    }
  } else {
    throw new Error(
      "`pull` can only be called synchronously within the `Scope` of a function passed to `createEffect` or `pull`."
    );
  }
};

export const createEffect = (callback: () => void): void => {
  const effect = createScope() as Effect;
  effect[callbackSymbol] = callback;
  onDispose(() => {
    removeFromChildren(effect, 0);
  });
  sweep(effect);
};
