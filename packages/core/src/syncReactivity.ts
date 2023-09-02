/**
 * This module implements synchronous reactivity. You give it a bunch of `() =>
 * void` functions, we'll call them thunks, that have these properties:
 *
 * - They can have side effects, but should provide cleanup logic that fully
 *   reverses them.
 *
 * - When you run one of them, it has a way to indicate which other thunks are
 *   its "direct dependencies". A "direct dependency" aka a "parent" is just a
 *   concept that we use for the purposes of the next property:
 *
 * - They stay idempotent until either we get an external notification or a
 *   parent thunk is run.
 *
 * - Dependencies are non-cyclical.
 *
 * The job of this module is to run all these thunks, and do it efficiently -
 * here's what we mean by that:
 *
 * - "run all these thunks" means this module runs everything that you throw at
 *   it, all the time - the only reason that doesn't imply forever eating all of
 *   your processor is the second part:
 *
 * - "do it efficiently" means that we do not run thunks uselessly. Since thunks
 *   stay idempotent until something happens, it is sufficient to run it once
 *   until it does happen. Also, efficiency means we have to solve the diamond
 *   problem (if you're not familiar with it, you can read up on it
 *   [here](https://dev.to/modderme123/super-charging-fine-grained-reactive-performance-47ph)
 *   for example): if a thunk is run while we're in an intermediate state, we'll
 *   have to immediately run the cleanup logic (reversing all the side effects
 *   and thus making the intermediate run useless) and then run it again in the
 *   final state.
 */
