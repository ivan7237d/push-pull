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

A _reaction_ is defined as a `() => void` function that would not produce side effects if all of the following holds:

- The function has been run previously

- No subject pulled in the last run has been pushed since

- The reactions swept during the last run would not produce side effects
