import { createRef } from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Direction = "left" | "right" | "up" | "down";
type TurnCallback = (direction: Direction) => void;

const { activeTurn, cardTurn, deferredAnimation, pendingAnimation } = vi.hoisted(() => ({
  activeTurn: { current: null as TurnCallback | null },
  cardTurn: vi.fn(),
  deferredAnimation: { current: false },
  pendingAnimation: { current: null as (() => void) | null },
}));

vi.mock("motion/react", async () => {
  const React = await import("react");

  function MotionDiv({
    animate,
    initial,
    onAnimationComplete,
    children,
    ...props
  }: Record<string, unknown>) {
    const targetY = (animate as { y?: number } | undefined)?.y;
    const initialY = React.useRef(
      initial === false ? undefined : (initial as { y?: number } | undefined)?.y,
    );
    const previousY = React.useRef<number | undefined>(undefined);

    React.useEffect(() => {
      if (previousY.current === targetY) {
        return;
      }

      previousY.current = targetY;
      const complete = onAnimationComplete as (() => void) | undefined;

      if (deferredAnimation.current && complete) {
        pendingAnimation.current = complete;
        return;
      }

      complete?.();
    }, [onAnimationComplete, targetY]);

    return React.createElement(
      "div",
      { ...props, "data-initial-y": initialY.current, "data-y": targetY },
      children as React.ReactNode,
    );
  }

  return {
    motion: { div: MotionDiv },
  };
});

vi.mock("./Card", async () => {
  const React = await import("react");

  type MockCardProps = {
    text: string;
    directions?: Partial<Record<Direction, { color?: string; label?: string }>>;
    disabledDirections?: readonly Direction[];
    initialTurn?: Direction;
    onTurn?: TurnCallback;
  };
  type MockCardHandle = {
    turn(direction: Direction): Promise<boolean>;
  };

  return {
    Card: React.forwardRef<MockCardHandle, MockCardProps>(function MockCard(
      { text, directions, disabledDirections, initialTurn, onTurn },
      ref,
    ) {
      const isBackRef = React.useRef(Boolean(initialTurn));

      if (initialTurn) {
        isBackRef.current = true;
      }

      if (ref) {
        activeTurn.current = onTurn ?? null;
      }

      React.useImperativeHandle(
        ref,
        () => ({
          async turn(direction) {
            if (
              !isBackRef.current &&
              (disabledDirections?.includes(direction) || !directions?.[direction])
            ) {
              return false;
            }

            cardTurn(direction);
            isBackRef.current = !isBackRef.current;
            return true;
          },
        }),
        [directions, disabledDirections],
      );

      return React.createElement(
        "div",
        {
          "data-testid": "card",
          "data-direction": initialTurn,
          "data-face": initialTurn ? "back" : "front",
          "data-right-color": directions?.right?.color,
          "data-right-label": directions?.right?.label,
        },
        text,
      );
    }),
  };
});

import { Deck, type DeckDefinition, type DeckHandle } from "./Deck";

const deck: DeckDefinition = {
  startCardId: "a",
  directionDefaults: {
    right: { color: "#16804b", label: "Yes" },
    left: { color: "#c43d4a", label: "No" },
    up: { color: "#315bcf", label: "Skip" },
    down: { color: "#b8860b", label: "Back" },
  },
  cards: [
    {
      id: "a",
      text: "A",
      transitions: {
        right: { targetCardId: "b", label: "Continue" },
        left: { targetCardId: "c" },
        up: { targetCardId: "terminal-a" },
      },
    },
    {
      id: "b",
      text: "B",
      transitions: {
        right: { targetCardId: "c" },
        left: { targetCardId: "a" },
        up: { targetCardId: "terminal-b" },
      },
    },
    {
      id: "c",
      text: "C",
      transitions: {
        right: { targetCardId: "terminal-a" },
        left: { targetCardId: "terminal-b" },
        up: { targetCardId: "terminal-a" },
      },
    },
    { id: "terminal-a", text: "Terminal A" },
    { id: "terminal-b", text: "Terminal B" },
  ],
};

const selfLoopDeck: DeckDefinition = {
  startCardId: "loop",
  cards: [
    {
      id: "loop",
      text: "Loop",
      transitions: { right: { targetCardId: "loop" } },
    },
    { id: "end", text: "End" },
  ],
};

const explicitDownDeck: DeckDefinition = {
  startCardId: "a",
  cards: [
    {
      id: "a",
      text: "A",
      transitions: { right: { targetCardId: "b" } },
    },
    {
      id: "b",
      text: "B",
      transitions: { down: { targetCardId: "c" } },
    },
    { id: "c", text: "C" },
  ],
};

function getActiveCard(container: HTMLElement) {
  return container.querySelector('[data-active-card="true"]');
}

function getActiveCardId(container: HTMLElement) {
  return getActiveCard(container)?.getAttribute("data-card-id");
}

function getActiveVisitId(container: HTMLElement) {
  return getActiveCard(container)?.getAttribute("data-visit-id");
}

function getRenderedPathIndices(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>("[data-card-index]")].map((element) =>
    Number(element.getAttribute("data-card-index")),
  );
}

async function completeTurn(direction: Direction) {
  await act(async () => {
    activeTurn.current?.(direction);
    await Promise.resolve();
  });
}

describe("Deck", () => {
  beforeEach(() => {
    activeTurn.current = null;
    cardTurn.mockClear();
    deferredAnimation.current = false;
    pendingAnimation.current = null;
  });

  it("starts at the graph start card", () => {
    const { container } = render(<Deck deck={deck} />);

    expect(getActiveCardId(container)).toBe("a");
    expect(getRenderedPathIndices(container)).toEqual([0]);
    expect(container.querySelector('[data-bottom-peek="true"]')).toBeInTheDocument();
    expect(container.querySelector('[data-bottom-peek="true"] [data-testid="card"]'))
      .toHaveTextContent("");
  });

  it("merges deck defaults with transition appearance overrides", () => {
    const { container } = render(<Deck deck={deck} />);
    const activeCard = getActiveCard(container)?.querySelector('[data-testid="card"]');

    expect(activeCard).toHaveAttribute("data-right-color", "#16804b");
    expect(activeCard).toHaveAttribute("data-right-label", "Continue");
  });

  it("blocks native dragging at the deck boundary", () => {
    const { container } = render(<Deck deck={deck} />);
    const viewport = container.firstElementChild as HTMLElement;

    expect(viewport).toHaveAttribute("draggable", "false");
    expect(fireEvent.dragStart(viewport)).toBe(false);
  });

  it("navigates only after the active card reports a completed turn", async () => {
    const ref = createRef<DeckHandle>();
    const { container } = render(<Deck ref={ref} deck={deck} />);

    await act(async () => {
      expect(await ref.current!.turn("right")).toBe(true);
    });

    expect(cardTurn).toHaveBeenCalledWith("right");
    expect(getActiveCardId(container)).toBe("a");

    await completeTurn("right");

    await waitFor(() => expect(getActiveCardId(container)).toBe("b"));
  });

  it("shows the next blank peek during a forward transition", async () => {
    deferredAnimation.current = true;
    const { container } = render(<Deck deck={deck} />);

    await act(async () => {
      activeTurn.current?.("right");
    });

    expect(getActiveCardId(container)).toBe("a");
    expect(container.querySelector('[data-bottom-peek="true"]')).toBeInTheDocument();

    await act(async () => {
      pendingAnimation.current?.();
      await Promise.resolve();
    });

    await waitFor(() => expect(getActiveCardId(container)).toBe("b"));
  });

  it.each([
    ["right", "b"],
    ["left", "c"],
    ["up", "terminal-a"],
  ] as const)("follows the %s graph edge", async (direction, targetId) => {
    const { container } = render(<Deck deck={deck} />);

    await completeTurn(direction);

    await waitFor(() => expect(getActiveCardId(container)).toBe(targetId));
  });

  it("supports cycles without reusing visit identity", async () => {
    const { container } = render(<Deck deck={deck} />);
    const firstVisitId = getActiveVisitId(container);

    await completeTurn("right");
    await waitFor(() => expect(getActiveCardId(container)).toBe("b"));

    await completeTurn("left");
    await waitFor(() => expect(getActiveCardId(container)).toBe("a"));

    expect(getActiveVisitId(container)).not.toBe(firstVisitId);
    expect(getRenderedPathIndices(container)).toEqual([1, 2]);
  });

  it("supports self-loops with distinct visit instances", async () => {
    const { container } = render(<Deck deck={selfLoopDeck} />);
    const firstVisitId = getActiveVisitId(container);

    await completeTurn("right");
    await waitFor(() => expect(getActiveCardId(container)).toBe("loop"));

    expect(getActiveVisitId(container)).not.toBe(firstVisitId);
    expect(container.querySelectorAll('[data-card-id="loop"]')).toHaveLength(2);

    await completeTurn("down");
    await waitFor(() => expect(getActiveVisitId(container)).toBe(firstVisitId));
  });

  it("backs through the exact traversal history", async () => {
    const { container } = render(<Deck deck={deck} />);

    await completeTurn("right");
    await waitFor(() => expect(getActiveCardId(container)).toBe("b"));
    await completeTurn("left");
    await waitFor(() => expect(getActiveCardId(container)).toBe("a"));

    await completeTurn("down");
    await waitFor(() => expect(getActiveCardId(container)).toBe("b"));
    await completeTurn("down");
    await waitFor(() => expect(getActiveCardId(container)).toBe("a"));

    expect(getRenderedPathIndices(container)).toEqual([0]);
  });

  it.each([
    ["right", "b", "left"],
    ["left", "c", "right"],
    ["up", "terminal-a", "down"],
  ] as const)(
    "reverses a %s transition from %s using %s",
    async (outgoingDirection, targetCardId, returnDirection) => {
      const { container } = render(<Deck deck={deck} />);

      await completeTurn(outgoingDirection);
      await waitFor(() => expect(getActiveCardId(container)).toBe(targetCardId));
      cardTurn.mockClear();

      await completeTurn("down");
      await waitFor(() => expect(getActiveCardId(container)).toBe("a"));
      await waitFor(() => expect(cardTurn).toHaveBeenCalledWith(returnDirection));
    },
  );

  it("prefers an explicit down transition over traversal history", async () => {
    const { container } = render(<Deck deck={explicitDownDeck} />);

    await completeTurn("right");
    await waitFor(() => expect(getActiveCardId(container)).toBe("b"));
    await completeTurn("down");
    await waitFor(() => expect(getActiveCardId(container)).toBe("c"));

    await completeTurn("down");
    await waitFor(() => expect(getActiveCardId(container)).toBe("b"));
  });

  it("derives terminal state from cards without outgoing directions", async () => {
    const ref = createRef<DeckHandle>();
    const { container } = render(<Deck ref={ref} deck={deck} />);

    await completeTurn("up");
    await waitFor(() => expect(getActiveCardId(container)).toBe("terminal-a"));
    expect(getActiveCard(container)).toHaveAttribute("data-terminal-card", "true");
    expect(container.querySelector('[data-bottom-peek="true"]')).not.toBeInTheDocument();

    await act(async () => {
      expect(await ref.current!.turn("right")).toBe(false);
      expect(await ref.current!.turn("left")).toBe(false);
      expect(await ref.current!.turn("up")).toBe(false);
      expect(await ref.current!.turn("down")).toBe(true);
    });

    expect(getActiveCardId(container)).toBe("terminal-a");
    await completeTurn("down");
    await waitFor(() => expect(getActiveCardId(container)).toBe("a"));
  });

  it("supports returning from one of multiple terminal cards", async () => {
    const { container } = render(<Deck deck={deck} />);

    await completeTurn("right");
    await waitFor(() => expect(getActiveCardId(container)).toBe("b"));
    await completeTurn("up");
    await waitFor(() => expect(getActiveCardId(container)).toBe("terminal-b"));

    await completeTurn("down");
    await waitFor(() => expect(getActiveCardId(container)).toBe("b"));
  });

  it("ignores a second turn while the first transition is active", async () => {
    const { container } = render(<Deck deck={deck} />);

    await act(async () => {
      activeTurn.current?.("right");
      activeTurn.current?.("right");
    });

    await waitFor(() => expect(getActiveCardId(container)).toBe("b"));
  });

  it("shows a previous visit as a back peek after a forward turn", async () => {
    const { container } = render(<Deck deck={deck} />);

    await completeTurn("right");
    await waitFor(() => expect(getActiveCardId(container)).toBe("b"));

    const previousCard = container.querySelector('[data-card-index="0"] [data-testid="card"]');

    expect(previousCard).toHaveAttribute("data-face", "back");
    expect(previousCard).toHaveAttribute("data-direction", "right");
  });
});
