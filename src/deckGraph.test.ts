import { describe, expect, it } from "vitest";

import { normalizeDeckConfig, type DeckConfig } from "./deckGraph";

describe("normalizeDeckConfig", () => {
  it("normalizes aliases in defaults and transitions", () => {
    const config = {
      startCardId: "a",
      directionDefaults: {
        yes: { label: "Yes" },
        no: { label: "No" },
        skip: { label: "Skip" },
        back: { label: "Back" },
      },
      cards: [
        {
          id: "a",
          text: "A",
          transitions: {
            yes: { targetCardId: "b" },
            no: { targetCardId: "c" },
            skip: { targetCardId: "d" },
            back: { targetCardId: "e" },
          },
        },
      ],
    } satisfies DeckConfig;

    expect(normalizeDeckConfig(config)).toEqual({
      startCardId: "a",
      directionDefaults: {
        right: { label: "Yes" },
        left: { label: "No" },
        up: { label: "Skip" },
        down: { label: "Back" },
      },
      cards: [
        {
          id: "a",
          text: "A",
          transitions: {
            right: { targetCardId: "b" },
            left: { targetCardId: "c" },
            up: { targetCardId: "d" },
            down: { targetCardId: "e" },
          },
        },
      ],
    });
  });

  it("rejects alias and canonical key collisions", () => {
    const config = {
      startCardId: "a",
      directionDefaults: {
        yes: { label: "Yes" },
        right: { label: "Continue" },
      },
      cards: [],
    } satisfies DeckConfig;

    expect(() => normalizeDeckConfig(config)).toThrow(
      "directionDefaults defines multiple keys for the right direction",
    );
  });

  it("rejects unsupported direction keys from parsed configuration", () => {
    const config = {
      startCardId: "a",
      directionDefaults: { forward: { label: "Forward" } },
      cards: [],
    } as unknown as DeckConfig;

    expect(() => normalizeDeckConfig(config)).toThrow(
      'Unsupported deck direction "forward"',
    );
  });
});
