# Deckision

_» Decisions, one card at a time_

## Deck format

Deck configurations describe a directed graph. A card can transition in any of
the `left`, `down`, `up`, and `right` directions. For readability, authored
JSON or YAML may use `no`, `back`, `skip`, and `yes` as aliases respectively.

```yaml
startCardId: question

directionDefaults:
  yes:
    label: "Yes"
    color: "#16804b"
  no:
    label: "No"
    color: "#c43d4a"
  skip:
    label: "Skip"
    color: "#315bcf"
  back:
    label: "Back"
    color: "#b8860b"

cards:
  - id: question
    text: "Should we ship this idea today?"
    transitions:
      yes:
        targetCardId: approved
      no:
        targetCardId: rejected
        label: "Not yet"
      skip:
        targetCardId: undecided
        color: "#7c3aed"

  - id: approved
    text: "Let's ship it."
    transitions:
      back:
        targetCardId: question
        label: "Reconsider"

  - id: rejected
    text: "What needs to change?"

  - id: undecided
    text: "Let's revisit this later."
```

Normalize parsed configuration before rendering it:

```ts
const deck = normalizeDeckConfig(config);

<Deck deck={deck} />;
```

`DeckConfig` accepts aliases, while the resulting `DeckDefinition` contains
only canonical direction keys. Defining both forms of one direction, such as
`yes` and `right`, is rejected instead of silently choosing one.

Direction appearance is resolved property by property in this order:

```text
application built-ins < deck directionDefaults < card transition overrides
```

A card without explicit transitions is terminal in the graph. Graph cycles and
multiple terminal cards are supported. When a card has no explicit `down` or
`back` transition, turning down traverses the current visit history. An explicit
`down` or `back` transition takes precedence and requires a `targetCardId` like
every other graph transition.

Transition objects are also the extension point for a future action DSL or
application-defined action reference:

```yaml
transitions:
  yes:
    targetCardId: approved
    action:
      type: set
      path: decision.approved
      value: true
```

The action field is illustrative and is not part of the model yet.
