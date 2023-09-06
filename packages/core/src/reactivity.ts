/**
 * This module implements a generic version of the [three-colors
 * algorithm](https://dev.to/modderme123/super-charging-fine-grained-reactive-performance-47ph).
 * You give it a bunch of "reactions": `() => boolean` functions whose returned
 * value indicates whether the function has produced any side effects. Since
 * reactions are impure, they can at one point produce side effects, and at
 * another point act like no-ops. When the state is such that running a reaction
 * doesn't produce side effects, we'll say that the reaction is "clean".
 *
 * Inside a reaction, you can call `createDependency(<another reaction>)`.
 * Immediately after this call, the other reaction is guaranteed to be clean.
 *
 * Reactions that you provide must satisfy the following contract:
 *
 * - After a reaction is run, it will be clean for as long as its dependencies
 *   are clean, or until `push(<reaction>)` is called on it. `push` is just a
 *   short way to say "this reaction may no longer be clean even if its
 *   dependencies are still clean".
 *
 * - Dependencies are non-cyclical.
 *
 * The job of this module is to react to `push` calls by running reactions so
 * that all of them end up clean.
 */
