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

interface SubjectInternal {
  // eslint-disable-next-line no-use-before-define
  [parentsSymbol]?: Reaction[];
}

interface Reaction extends SubjectInternal {
  [childrenSymbol]?: (SubjectInternal | Reaction)[];
  (): void;
  /**
   * Absent state means dirty state.
   */
  [stateSymbol]?: Exclude<State, typeof dirtyReactionState>;
  /**
   * A positive integer.
   */
  [effectSymbol]?: number;
}

type Subject = Record<string | number | symbol, unknown> | (() => void);

let currentReaction: Reaction | undefined;
const effectQueue: Reaction[] = [];
const teardownQueue: Reaction[] = [];

const pushReaction = (
  reaction: Reaction,
  reactionState: typeof checkReactionState | typeof dirtyReactionState
) => {
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

const processQueues = () => {
  let reaction: Reaction;
  for (let i = 0; i < effectQueue.length; i++) {
    // TODO
  }
  effectQueue.length = 0;
  for (let i = 0; i < teardownQueue.length; i++) {
    reaction = teardownQueue[i]!;
    if (!(parentsSymbol in reaction || effectSymbol in reaction)) {
      delete reaction[stateSymbol];
    }
  }
};

export const push: {
  (subject: Subject): void;
} = (subject: SubjectInternal | Reaction) => {
  if (parentsSymbol in subject) {
    const parents = subject[parentsSymbol]!;
    for (let i = 0; i < parents.length; i++) {
      pushReaction(parents[i]!, dirtyReactionState);
    }
  }
  // TODO: should not be called recursively.
  processQueues();
};

const removeFromChildren = (parent: SubjectInternal | Reaction) => {
  if (childrenSymbol in parent) {
    const children = parent[childrenSymbol]!;
    delete parent[childrenSymbol];
    let swap: number, child: SubjectInternal | Reaction, parents: Reaction[];
    for (let i = 0; i < children.length; i++) {
      child = children[i]!;
      parents = child[parentsSymbol]!;
      if (parents.length === 1) {
        delete child[parentsSymbol];
        if (!(effectSymbol in child) && typeof child === "function") {
          teardownQueue.push(child);
          removeFromChildren(child);
        }
      } else {
        swap = parents.indexOf(parent);
        parents[swap] = parents[parents.length - 1]!;
        parents.pop();
      }
    }
  }
};

export const pull = (subject: Subject) => {};

export const createEffect = (reaction: Reaction) => {
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
        removeFromChildren(reaction);
      }
    } else {
      reaction[effectSymbol]!--;
    }
  };
};

// const runReaction = (reaction: Reaction) => {
//   // Remove dependencies.
//   const parents = childToParents.get(reaction)!;
//   for (const parent of parents) {
//     parentToChildren.get(parent)!.delete(reaction);
//   }
//   parents.clear();

//   const outerReaction = currentReaction;
//   currentReaction = reaction;
//   if (reaction()) {
//     for (const child of parentToChildren.get(reaction)!) {
//       dirtyReactions.add(child);
//     }
//   }
//   queue.delete(reaction);

//   currentReaction = outerReaction;
// };

// /**
//  * Run reaction if dirty or if a parent is dirty.
//  */
// const runReactionIfNecessary = (reaction: Reaction) => {
//   if (pendingReactions.has(reaction)) {
//     for (const parent of childToParents.get(reaction)!) {
//       runReactionIfNecessary(parent);
//       if (dirtyReactions.has(reaction)) {
//         break;
//       }
//     }
//     pendingReactions.delete(reaction);
//   }

//   if (dirtyReactions.has(reaction)) {
//     runReaction(reaction);
//     dirtyReactions.delete(reaction);
//   }
// };

// export const addReaction = (reaction: Reaction) => {
//   // TODO
// };

// /**
//  * Should only be called when the reaction has no children.
//  */
// export const removeReaction = (reaction: Reaction) => {
//   parentToChildren.delete(reaction);
//   for (const parent of childToParents.get(reaction)!) {
//     parentToChildren.get(parent)!.delete(reaction);
//   }
//   childToParents.delete(reaction);
// };

// export const push = (reaction: Reaction) => {
//   dirtyReactions.add(reaction);
//   // TODO
// };
