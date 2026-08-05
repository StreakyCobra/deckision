import { createRef } from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Direction = "left" | "right" | "up" | "down";
type TurnCallback = (direction: Direction) => void;

const { activeTurn, cardTurn } = vi.hoisted(() => ({
  activeTurn: { current: null as TurnCallback | null },
  cardTurn: vi.fn(),
}));

vi.mock("motion/react", async () => {
  const React = await import("react");

  function MotionDiv({ animate, initial, onAnimationComplete, children, ...props }: Record<string, unknown>) {
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
      (onAnimationComplete as (() => void) | undefined)?.();
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
    disabledDirections?: readonly Direction[];
    initialTurn?: Direction;
    onTurn?: TurnCallback;
  };
  type MockCardHandle = {
    turn(direction: Direction): Promise<boolean>;
  };

  return {
    Card: React.forwardRef<MockCardHandle, MockCardProps>(function MockCard(
      { text, disabledDirections, initialTurn, onTurn },
      ref,
    ) {
      if (ref) {
        activeTurn.current = onTurn ?? null;
      }

      React.useImperativeHandle(
        ref,
        () => ({
          async turn(direction) {
            if (disabledDirections?.includes(direction)) {
              return false;
            }

            cardTurn(direction);
            return true;
          },
        }),
        [disabledDirections],
      );

      return React.createElement(
        "div",
        {
          "data-testid": "card",
          "data-direction": initialTurn,
          "data-face": initialTurn ? "back" : "front",
        },
        text,
      );
    }),
  };
});

import { Deck, type DeckCard, type DeckHandle } from "./Deck";

const cards: DeckCard[] = Array.from({ length: 10 }, (_, index) => ({
  id: `card-${index + 1}`,
  text: `Card ${index + 1}`,
}));

const directions = {
  right: { color: "#16804b", label: "Yes" },
  left: { color: "#c43d4a", label: "No" },
  up: { color: "#315bcf", label: "Skip" },
  down: { color: "#b8860b", label: "Back" },
} as const;

function getActiveIndex(container: HTMLElement) {
  return Number(container.querySelector('[data-active-card="true"]')?.getAttribute("data-card-index"));
}

function getRenderedIndices(container: HTMLElement) {
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
  });

  it("renders a moving window instead of every card", () => {
    const { container } = render(<Deck cards={cards} directions={directions} />);

    expect(getRenderedIndices(container)).toEqual([0, 1, 2]);
    expect(getActiveIndex(container)).toBe(0);
  });

  it("blocks native dragging at the deck boundary", () => {
    const { container } = render(<Deck cards={cards} directions={directions} />);
    const viewport = container.firstElementChild as HTMLElement;

    expect(viewport).toHaveAttribute("draggable", "false");
    expect(fireEvent.dragStart(viewport)).toBe(false);
  });

  it("navigates only after the active card reports a completed turn", async () => {
    const ref = createRef<DeckHandle>();
    const { container } = render(<Deck ref={ref} cards={cards} directions={directions} />);

    await act(async () => {
      expect(await ref.current!.turn("right")).toBe(true);
    });

    expect(cardTurn).toHaveBeenCalledWith("right");
    expect(getActiveIndex(container)).toBe(0);

    await completeTurn("right");

    await waitFor(() => expect(getActiveIndex(container)).toBe(1));
  });

  it("keeps the active card when the deck is reordered", async () => {
    const { container, rerender } = render(<Deck cards={cards} directions={directions} />);

    await completeTurn("right");
    await waitFor(() => expect(getActiveIndex(container)).toBe(1));

    rerender(
      <Deck
        cards={[cards[0], cards[2], cards[1], ...cards.slice(3)]}
        directions={directions}
      />,
    );

    expect(container.querySelector('[data-active-card="true"]')).toHaveAttribute(
      "data-card-id",
      "card-2",
    );
  });

  it("ignores a second turn while the first transition is active", async () => {
    const { container } = render(<Deck cards={cards} directions={directions} />);

    await act(async () => {
      activeTurn.current?.("right");
      activeTurn.current?.("right");
    });

    await waitFor(() => expect(getActiveIndex(container)).toBe(1));
  });

  it("keeps the previous card's turn direction on its back peek", async () => {
    const { container } = render(<Deck cards={cards} directions={directions} />);

    await completeTurn("right");
    await waitFor(() => expect(getActiveIndex(container)).toBe(1));

    const previousCard = container.querySelector('[data-card-index="0"] [data-testid="card"]');

    expect(previousCard).toHaveAttribute("data-face", "back");
    expect(previousCard).toHaveAttribute("data-direction", "right");
  });

  it("uses equal offsets for the previous and next peeks", async () => {
    const { container } = render(<Deck cards={cards} directions={directions} />);

    await completeTurn("right");
    await waitFor(() => expect(getActiveIndex(container)).toBe(1));

    const previousCardSlot = container.querySelector('[data-card-index="0"]');
    const nextCardSlot = container.querySelector('[data-card-index="2"]');

    expect(Math.abs(Number.parseFloat(previousCardSlot?.getAttribute("data-y") ?? "0"))).toBe(
      Math.abs(Number.parseFloat(nextCardSlot?.getAttribute("data-y") ?? "0")),
    );
  });

  it("moves a new bottom card into the edge peek", async () => {
    const { container } = render(<Deck cards={cards} directions={directions} />);

    await completeTurn("right");
    await waitFor(() => expect(getActiveIndex(container)).toBe(1));
    await completeTurn("right");
    await waitFor(() => expect(getActiveIndex(container)).toBe(2));

    const replacementCard = container.querySelector('[data-card-index="3"]');
    const initialY = Number(replacementCard?.getAttribute("data-initial-y"));
    const targetY = Number(replacementCard?.getAttribute("data-y"));

    expect(initialY).toBe(targetY * 2);
  });

  it("moves a new top card into the edge peek", async () => {
    const { container } = render(<Deck cards={cards} directions={directions} />);

    await completeTurn("right");
    await waitFor(() => expect(getActiveIndex(container)).toBe(1));
    await completeTurn("right");
    await waitFor(() => expect(getActiveIndex(container)).toBe(2));
    await completeTurn("down");
    await waitFor(() => expect(getActiveIndex(container)).toBe(1));

    const replacementCard = container.querySelector('[data-card-index="0"]');
    const initialY = Number(replacementCard?.getAttribute("data-initial-y"));
    const targetY = Number(replacementCard?.getAttribute("data-y"));

    expect(initialY).toBe(targetY * 2);
  });

  it("advances through all ten cards and updates the rendered window", async () => {
    const { container } = render(<Deck cards={cards} directions={directions} />);

    for (let index = 1; index < cards.length; index += 1) {
      await completeTurn("up");
      await waitFor(() => expect(getActiveIndex(container)).toBe(index));
    }

    expect(getRenderedIndices(container)).toEqual([7, 8, 9]);
  });

  it("stops at both ends of the deck", async () => {
    const ref = createRef<DeckHandle>();
    const { container } = render(<Deck ref={ref} cards={cards} directions={directions} />);

    await act(async () => {
      expect(await ref.current!.turn("down")).toBe(false);
    });
    expect(getActiveIndex(container)).toBe(0);

    for (let index = 1; index < cards.length; index += 1) {
      await completeTurn("right");
      await waitFor(() => expect(getActiveIndex(container)).toBe(index));
    }

    await act(async () => {
      expect(await ref.current!.turn("right")).toBe(false);
    });
    expect(getActiveIndex(container)).toBe(cards.length - 1);
  });

  it("moves backward only for a completed down turn", async () => {
    const { container } = render(<Deck cards={cards} directions={directions} />);

    await completeTurn("left");
    await waitFor(() => expect(getActiveIndex(container)).toBe(1));

    await completeTurn("down");
    await waitFor(() => expect(getActiveIndex(container)).toBe(0));

    expect(container.querySelector('[data-card-index="1"] [data-testid="card"]')).toHaveAttribute(
      "data-face",
      "front",
    );
  });
});
