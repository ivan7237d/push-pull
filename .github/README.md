# Push-Pull

WIP.

## Installation

```bash
bun add @push-pull/core
```

```bash
pnpm add @push-pull/core
```

```bash
yarn add @push-pull/core
```

```bash
npm install @push-pull/core
```

## Usage

A _reaction_ is defined as a function that would not produce side effects if all of the following holds:

- The function has been run previously

- The subjects pulled in that last run have not been pushed since

- The reactions swept during that last run would not currently produce side effects
