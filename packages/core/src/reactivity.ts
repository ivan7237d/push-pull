/**
 * This module implements a the [three-colors
 * algorithm](https://dev.to/modderme123/super-charging-fine-grained-reactive-performance-47ph).
 * You give it a bunch of "reactions", `() => boolean` functions whose returned
 * value indicates whether the function has produced any side effects. When the
 * state is such that running a reaction doesn't produce side effects, we'll say
 * that the reaction is "stable".
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

interface Reaction {
  (): boolean;
}

/**
 * Has a key for each reaction, even if the value is an empty set.
 */
const parentToChildren = new Map<Reaction, Set<Reaction>>();
/**
 * Has a key for each reaction, even if the value is an empty set.
 */
const childToParents = new Map<Reaction, Set<Reaction>>();
/**
 * Reactions that need to be re-run.
 */
const dirtyReactions = new Set<Reaction>();
/**
 * TODO
 */
const checkReactions = new Set<Reaction>();

const runReaction = (reaction: Reaction) => {
  // TODO
};

/**
 * Run reaction if dirty or if a parent is dirty.
 */
const runReactionIfNecessary = (reaction: Reaction) => {
  if (checkReactions.has(reaction)) {
    for (const parent of childToParents.get(reaction)!) {
      runReactionIfNecessary(parent);
      if (dirtyReactions.has(reaction)) {
        break;
      }
    }
    checkReactions.delete(reaction);
  }

  if (dirtyReactions.has(reaction)) {
    runReaction(reaction);
    dirtyReactions.delete(reaction);
  }
};

export const addReaction = (reaction: Reaction) => {
  // TODO
};

/**
 * Should only be called when the reaction has no children.
 */
export const removeReaction = (reaction: Reaction) => {
  parentToChildren.delete(reaction);
  for (const parent of childToParents.get(reaction)!) {
    parentToChildren.get(parent)!.delete(reaction);
  }
  childToParents.delete(reaction);
};

export const push = (reaction: Reaction) => {
  dirtyReactions.add(reaction);
  // TODO
};
