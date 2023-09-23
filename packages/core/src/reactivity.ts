/**
 * This module implements reactivity using the [three-colors
 * algorithm](https://dev.to/modderme123/super-charging-fine-grained-reactive-performance-47ph).
 *
 * We want to use as broad a definition of reactivity as possible.
 *
 * Let's start from afar by asking what is "declarative" programming?
 * Declarative programming is about any kind of *guarantees* provided to the
 * developer that make that developer's job easier - for example, you can be
 * guaranteed that some variable is local to a module and so cannot be modified
 * from outside it. It's not like code is either declarative or non-declarative,
 * but the more guarantees there are, the more it's declarative.
 *
 * Now as to "reactive" programming. We're going to define it as a specific kind
 * of guarantee (and so a specific kind of declarative programming) which is
 * that a subroutine (an impure function that doesn't return a value) is
 * guaranteed to not produce side effects if run again.
 *
 * For example, a subroutine could read a value of one signal, multiply it by
 * two, and use the result to set the value of another signal. The guarantee we
 * just described has a corollary that values of the two signals will be
 * consistent with each other: re-running the subroutine will not produce side
 * effects only if the value of the second signal is already 2x the value of the
 * first signal. Another example, this time not involving a relationship between
 * values, is an effect such as updating DOM in response to a signal: since
 * re-running DOM update does not produce side effects, this means that DOM is
 * up-to-date.
 *
 * It's funny how in functional programming, the guarantee is that a *function*
 * doesn't have side effects (ever), and in reactive programming, that a
 * *subroutine* doesn't have side effects (at a given point in time).
 *
 * The API of this module is as follows. You give it a bunch of "reactions", `()
 * => boolean` functions whose returned value indicates whether the function has
 * produced any side effects. When the state is such that running a reaction
 * doesn't produce side effects, we'll say that the reaction is "stable".
 *
 * Inside a reaction, you can call `createDependency(<another reaction>)`.
 * Immediately after this call, the other reaction is guaranteed to be stable.
 *
 * Reactions that you provide must satisfy the following contract:
 *
 * - After a reaction is run, it will be stable for as long as its dependencies
 *   are stable, or until `push(<reaction>)` is called on it. `push` is just a
 *   short way to say "this reaction may no longer be stable even if its
 *   dependencies are still stable".
 *
 * - Dependencies are non-cyclical.
 *
 * The job of this module is to react to `push` calls by running reactions so
 * that all of them end up stable.
 */

const parentsSymbol = Symbol("parents");
const childrenSymbol = Symbol("children");
const stateSymbol = Symbol("state");
const effectSymbol = Symbol("effect");

const cleanReactionState = 0;
const checkReactionState = 1;
const dirtyReactionState = 2;
type State =
  | typeof cleanReactionState
  | typeof checkReactionState
  | typeof dirtyReactionState;

interface Subject {
  // eslint-disable-next-line no-use-before-define
  [parentsSymbol]?: Reaction[];
}

interface Reaction extends Subject {
  [childrenSymbol]?: (Subject | Reaction)[];
  (): void;
  /**
   * Absent state means `dirtyReactionState`.
   */
  [stateSymbol]?: Exclude<State, typeof dirtyReactionState>;
  /**
   * A positive integer.
   */
  [effectSymbol]?: number;
}

let currentReaction: Reaction | undefined;
/**
 * As part of a perf optimization trick, when running a reaction, we bump
 * `unchangedChildrenCount` until the children array diverges from the old
 * children array, at which point we begin adding children to `newChildren`.
 * This allows to avoid updating children when they stay the same.
 */
let newChildren: (Subject | Reaction)[] | undefined;
let unchangedChildrenCount = 0;
const effectQueue: Reaction[] = [];
const teardownQueue: Reaction[] = [];
let processingQueues = false;

const pushReaction = (
  reaction: Reaction,
  reactionState: typeof checkReactionState | typeof dirtyReactionState
) => {
  // TODO: handle the case of cyclical dependency?
  if ((reaction[stateSymbol] ?? dirtyReactionState) < reactionState) {
    // The reason for the first condition is that if the reaction is "check" or
    // "dirty", all its ancestors have already been marked as (at least)
    // "check".
    if (
      reaction[stateSymbol] === cleanReactionState &&
      parentsSymbol in reaction
    ) {
      const parents = reaction[parentsSymbol]!;
      for (let i = 0; i < parents.length; i++) {
        pushReaction(parents[i]!, checkReactionState);
      }
    }
    if (reactionState === dirtyReactionState) {
      delete reaction[stateSymbol];
      if (reaction[effectSymbol]) {
        effectQueue.push(reaction);
      }
    } else {
      reaction[stateSymbol] = reactionState;
    }
  }
};

const removeFromChildren = (parent: Subject | Reaction, index: number) => {
  if (childrenSymbol in parent) {
    const children = parent[childrenSymbol];
    let swap: number, child: Subject | Reaction, parents: Reaction[];
    for (let i = index; i < children.length; i++) {
      child = children[i]!;
      parents = child[parentsSymbol]!;
      if (parents.length === 1) {
        delete child[parentsSymbol];
        if (typeof child === "function" && !(effectSymbol in child)) {
          teardownQueue.push(child);
        }
      } else {
        swap = parents.indexOf(parent);
        parents[swap] = parents[parents.length - 1]!;
        parents.pop();
      }
    }
  }
};

const processQueues = () => {
  for (let i = 0; i < effectQueue.length; i++) {
    // eslint-disable-next-line no-use-before-define
    ensureIsClean(effectQueue[i]!);
  }
  effectQueue.length = 0;
  let reaction: Reaction;
  for (let i = 0; i < teardownQueue.length; i++) {
    reaction = teardownQueue[i]!;
    if (!(parentsSymbol in reaction || effectSymbol in reaction)) {
      removeFromChildren(reaction, 0);
      delete reaction[stateSymbol];
      delete reaction[childrenSymbol];
    }
  }
  teardownQueue.length = 0;
};

export const push: {
  (subject: Record<string | number | symbol, unknown> | (() => void)): void;
} = (subject: Subject | Reaction) => {
  if (parentsSymbol in subject) {
    const parents = subject[parentsSymbol]!;
    for (let i = 0; i < parents.length; i++) {
      pushReaction(parents[i]!, dirtyReactionState);
    }
  }
  if (!processingQueues) {
    processingQueues = true;
    processQueues();
    processingQueues = false;
  }
};

const runReaction = (reaction: Reaction) => {
  const outerNewChildren = newChildren;
  const outerUnchangedChildrenCount = unchangedChildrenCount;
  const outerCurrentReaction = currentReaction;
  newChildren = undefined as typeof newChildren;
  unchangedChildrenCount = 0;
  currentReaction = reaction;
  reaction();
  if (newChildren) {
    let children: (Reaction | Subject)[];
    removeFromChildren(reaction, unchangedChildrenCount);
    if (childrenSymbol in reaction && unchangedChildrenCount > 0) {
      children = reaction[childrenSymbol];
      children.length = unchangedChildrenCount + newChildren.length;
      for (let i = 0; i < newChildren.length; i++) {
        children[unchangedChildrenCount + i] = newChildren[i]!;
      }
    } else {
      children = reaction[childrenSymbol] = newChildren;
    }
    let child: Subject | Reaction;
    for (let i = unchangedChildrenCount; i < children.length; i++) {
      child = children[i]!;
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
  reaction[stateSymbol] = cleanReactionState;
  newChildren = outerNewChildren;
  unchangedChildrenCount = outerUnchangedChildrenCount;
  currentReaction = outerCurrentReaction;
};

const ensureIsClean = (reaction: Reaction) => {
  if (reaction[stateSymbol] === cleanReactionState) {
    return;
  }
  // In this case we don't know if the reaction needs to be run, but by
  // recursively calling `ensureIsClean` for children, we'll eventually know one
  // way or the other.
  if (reaction[stateSymbol] === checkReactionState) {
    const children = reaction[childrenSymbol]!;
    let child: Subject | Reaction;
    for (let i = 0; i < children.length; i++) {
      child = children[i]!;
      if (typeof child === "function") {
        ensureIsClean(child);
      }
      // "If the reaction is dirty..."
      if (!(stateSymbol in reaction)) {
        break;
      }
    }
  }
  // "If the reaction is dirty..."
  if (!(stateSymbol in reaction)) {
    runReaction(reaction);
  } else {
    // At this point we know that all children are clean, so we can mark the
    // reaction as clean.
    reaction[stateSymbol] = cleanReactionState;
  }
};

export const pull: {
  (subject: Record<string | number | symbol, unknown> | (() => void)): void;
} = (subject: Subject | Reaction) => {
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
    if (typeof subject === "function") {
      ensureIsClean(subject);
    }
  } else {
    // TODO: add untrack-like function to allow also triggering these errors
    // inside a reaction? Or is linting sufficient to prevent accidental
    // subscriptions?
    throw new Error(
      "A reaction (a function that invokes `pull`) cannot be called by the client (you), but can only be passed to `createEffect` and `pull`."
    );
  }
};

export const createEffect: {
  (reaction: () => void): void;
} = (reaction: Reaction) => {
  let disposed = false;
  reaction[effectSymbol] = (reaction[effectSymbol] ?? 0) + 1;
  if (reaction[effectSymbol] === 1) {
    effectQueue.push(reaction);
  }
  processQueues();
  return () => {
    if (disposed) {
      return;
    }
    disposed = true;
    if (reaction[effectSymbol] === 1) {
      delete reaction[effectSymbol];
      if (!(parentsSymbol in reaction)) {
        teardownQueue.push(reaction);
      }
    } else {
      reaction[effectSymbol]!--;
    }
  };
};
