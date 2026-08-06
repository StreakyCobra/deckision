import { createRef, type ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import styles from "./Card.module.css";
import { Card, type CardHandle } from "./Card";

type TestPanInfo = {
  offset: { x: number; y: number };
  velocity: { x: number; y: number };
};

type MotionDivProps = {
  children?: ReactNode;
  onPanStart?: (event: PointerEvent) => void;
  onPan?: (event: PointerEvent, info: TestPanInfo) => void;
  onPanEnd?: (event: PointerEvent, info: TestPanInfo) => void;
  [key: string]: unknown;
};

type MotionElementProps = MotionDivProps & {
  tagName: "div" | "span";
};

vi.mock("motion/react", async () => {
  const React = await import("react");

  function MotionElement({
    tagName,
    children,
    onPanStart,
    onPan,
    onPanEnd,
    ...props
  }: MotionElementProps) {
    const origin = React.useRef({ x: 0, y: 0 });

    function getInfo(event: { clientX: number; clientY: number }): TestPanInfo {
      const offset = {
        x: event.clientX - origin.current.x,
        y: event.clientY - origin.current.y,
      };

      return { offset, velocity: offset };
    }

    return React.createElement(
      tagName,
      {
        ...props,
        onPointerDown: (event: {
          clientX: number;
          clientY: number;
          nativeEvent: PointerEvent;
        }) => {
          origin.current = { x: event.clientX, y: event.clientY };
          onPanStart?.(event.nativeEvent);
        },
        onPointerMove: (event: {
          clientX: number;
          clientY: number;
          nativeEvent: PointerEvent;
        }) => onPan?.(event.nativeEvent, getInfo(event)),
        onPointerUp: (event: {
          clientX: number;
          clientY: number;
          nativeEvent: PointerEvent;
        }) => onPanEnd?.(event.nativeEvent, getInfo(event)),
      },
      children,
    );
  }

  function MotionDiv(props: MotionDivProps) {
    return React.createElement(MotionElement, { ...props, tagName: "div" });
  }

  function MotionSpan(props: MotionDivProps) {
    return React.createElement(MotionElement, { ...props, tagName: "span" });
  }

  return {
    animate: async (value: { set: (nextValue: number) => void }, target: number) => {
      value.set(target);
    },
    motion: { div: MotionDiv, span: MotionSpan },
    useMotionValue: (initialValue: number) => {
      const value = React.useRef(initialValue);

      return {
        get: () => value.current,
        set: (nextValue: number) => {
          value.current = nextValue;
        },
      };
    },
    useTransform: (transform: () => number) => transform(),
  };
});

function getCard(container: HTMLElement) {
  return container.firstElementChild?.firstElementChild as HTMLElement;
}

function getCurrentFace(container: HTMLElement) {
  return container.querySelector(`.${styles.face}:not([data-axis])`) as HTMLElement;
}

function drag(card: HTMLElement, x: number, y: number) {
  fireEvent.pointerDown(card, { clientX: 0, clientY: 0 });
  fireEvent.pointerMove(card, { clientX: x, clientY: y });
}

describe("Card", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the same text after returning from the back face", async () => {
    const text = "Do you want to turn me around?";
    const { container } = render(<Card text={text} />);
    const card = getCard(container);

    expect(screen.getByText(text)).toBeInTheDocument();

    drag(card, 130, 0);
    fireEvent.pointerUp(card, { clientX: 130, clientY: 0 });

    await waitFor(() => expect(getCurrentFace(container)).toHaveClass(styles.back));

    drag(card, -130, 0);
    fireEvent.pointerUp(card, { clientX: -130, clientY: 0 });

    await waitFor(() => {
      expect(getCurrentFace(container)).toHaveClass(styles.front);
      expect(screen.getByText(text)).toBeInTheDocument();
    });
  });

  it("can be turned through its imperative handle", async () => {
    const ref = createRef<CardHandle>();
    const { container } = render(<Card ref={ref} text="Should I do it?" />);

    let turned = false;
    await act(async () => {
      turned = await ref.current!.turn("right");
    });

    expect(turned).toBe(true);
    expect(getCurrentFace(container)).toHaveClass(styles.back);

    await act(async () => {
      turned = await ref.current!.turn("up");
    });

    expect(turned).toBe(true);
    expect(getCurrentFace(container)).toHaveClass(styles.front);
  });

  it("notifies the owner after a successful turn", async () => {
    const onTurn = vi.fn();
    const ref = createRef<CardHandle>();

    render(<Card ref={ref} text="Should I do it?" onTurn={onTurn} />);

    await act(async () => {
      await ref.current!.turn("right");
    });

    expect(onTurn).toHaveBeenCalledOnce();
    expect(onTurn).toHaveBeenCalledWith("right");
  });

  it("can render a colored back face initially", () => {
    const { container } = render(
      <Card
        text="Should I do it?"
        directions={{ right: { color: "#123456", label: "Yes" } }}
        initialTurn="right"
      />,
    );

    expect(getCurrentFace(container)).toHaveClass(styles.back);
    expect(getCurrentFace(container).style.getPropertyValue("--card-color")).toBe("#123456");
  });

  it("notifies the owner after a successful pointer turn", async () => {
    const onTurn = vi.fn();
    const { container } = render(<Card text="Should I do it?" onTurn={onTurn} />);
    const card = getCard(container);

    drag(card, 130, 0);
    fireEvent.pointerUp(card, { clientX: 130, clientY: 0 });

    await waitFor(() => expect(onTurn).toHaveBeenCalledWith("right"));
  });

  it("rejects an imperative turn that is not configured", async () => {
    const ref = createRef<CardHandle>();
    const { container } = render(
      <Card
        ref={ref}
        text="Should I do it?"
        directions={{ left: { color: "#d64545", label: "No" } }}
      />,
    );

    let turned = true;
    await act(async () => {
      turned = await ref.current!.turn("right");
    });

    expect(turned).toBe(false);
    expect(getCurrentFace(container)).toHaveClass(styles.front);
  });

  it("keeps all directions available without labels by default", () => {
    const { container } = render(<Card text="Should I do it?" />);
    const card = getCard(container);

    drag(card, 0, -130);

    expect(screen.queryByText("Yes")).not.toBeInTheDocument();
    expect(container.querySelector('[data-direction="up"]')).toBeInTheDocument();
  });

  it("renders an active label with its configured color", () => {
    const { container } = render(
      <Card
        text="Should I do it?"
        directions={{ right: { color: "#123456", label: "Yes" } }}
      />,
    );
    const card = getCard(container);

    expect(
      container.querySelector('[data-direction="right"]')?.getAttribute("style"),
    ).toContain("--card-color: #123456");

    drag(card, 30, 0);

    const label = screen.getByText("Yes");

    expect(label).toBeInTheDocument();
    expect(label).toHaveAttribute("data-direction", "right");
    expect(label).toHaveStyle({ opacity: "1" });
    expect(label.getAttribute("style")).toContain(
      "--card-color: #123456",
    );

    fireEvent.pointerMove(card, { clientX: 130, clientY: 0 });
    fireEvent.pointerUp(card, { clientX: 130, clientY: 0 });

    expect(screen.queryByText("Yes")).not.toBeInTheDocument();

    return waitFor(() => {
      expect(getCurrentFace(container)).toHaveClass(styles.back);
      expect(getCurrentFace(container).style.getPropertyValue("--card-color")).toBe("#123456");
    });
  });

  it("falls back each omitted appearance property independently", async () => {
    const { container } = render(
      <Card
        text="Should I do it?"
        directions={{ right: { color: "#123456" } }}
      />,
    );
    const card = getCard(container);

    drag(card, 30, 0);

    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("Yes").getAttribute("style")).toContain(
      "--card-color: #123456",
    );

    fireEvent.pointerUp(card, { clientX: 30, clientY: 0 });
    await waitFor(() => expect(getCurrentFace(container)).toHaveClass(styles.front));
  });

  it("hides the label immediately when a partial drag returns to the front", async () => {
    const { container } = render(
      <Card
        text="Should I do it?"
        directions={{ right: { color: "#1f9d55", label: "Yes" } }}
      />,
    );
    const card = getCard(container);

    drag(card, 30, 0);

    expect(screen.getByText("Yes")).toBeInTheDocument();

    fireEvent.pointerUp(card, { clientX: 30, clientY: 0 });

    expect(screen.queryByText("Yes")).not.toBeInTheDocument();
    await waitFor(() => expect(getCurrentFace(container)).toHaveClass(styles.front));
  });

  it("does not preview or complete a direction that is not configured", async () => {
    const { container } = render(
      <Card
        text="Should I do it?"
        directions={{ left: { color: "#d64545", label: "No" } }}
      />,
    );
    const card = getCard(container);

    drag(card, 130, 0);

    expect(screen.queryByText("No")).not.toBeInTheDocument();

    fireEvent.pointerUp(card, { clientX: 130, clientY: 0 });

    await waitFor(() => expect(getCurrentFace(container)).toHaveClass(styles.front));
  });

  it("treats an empty direction map as no front choices", async () => {
    const { container } = render(<Card text="Should I do it?" directions={{}} />);
    const card = getCard(container);

    drag(card, 0, -130);

    expect(container.querySelector('[data-direction="up"]')).not.toBeInTheDocument();

    fireEvent.pointerUp(card, { clientX: 0, clientY: -130 });

    await waitFor(() => expect(getCurrentFace(container)).toHaveClass(styles.front));
  });

  it("allows any direction when returning from the back face", async () => {
    const { container } = render(
      <Card
        text="Should I do it?"
        directions={{ left: { color: "#d64545", label: "No" } }}
      />,
    );
    const card = getCard(container);

    drag(card, -130, 0);
    fireEvent.pointerUp(card, { clientX: -130, clientY: 0 });

    await waitFor(() => expect(getCurrentFace(container)).toHaveClass(styles.back));

    drag(card, 130, 0);

    expect(screen.queryByText("No")).not.toBeInTheDocument();
    expect(container.querySelector('[data-axis="horizontal"]')).toHaveAttribute(
      "data-direction",
      "left",
    );

    fireEvent.pointerUp(card, { clientX: 130, clientY: 0 });

    await waitFor(() => expect(getCurrentFace(container)).toHaveClass(styles.front));
  });

  it("keeps the locked axis when the dominant movement changes", async () => {
    const { container } = render(<Card text="Should I do it?" />);
    const card = getCard(container);

    fireEvent.pointerDown(card, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(card, { clientX: 30, clientY: 0 });
    expect(container.querySelector('[data-axis="horizontal"]')).toBeInTheDocument();

    fireEvent.pointerMove(card, { clientX: 4, clientY: 100 });

    expect(container.querySelector('[data-axis="horizontal"]')).toBeInTheDocument();
    expect(container.querySelector('[data-axis="vertical"]')).not.toBeInTheDocument();

    fireEvent.pointerUp(card, { clientX: 4, clientY: 100 });
    await waitFor(() => expect(getCurrentFace(container)).toHaveClass(styles.front));
  });

  it("allows the direction to cross the origin without changing axis", async () => {
    const { container } = render(
      <Card
        text="Should I do it?"
        directions={{
          right: { color: "#1f9d55", label: "Yes" },
          left: { color: "#d64545", label: "No" },
        }}
      />,
    );
    const card = getCard(container);

    fireEvent.pointerDown(card, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(card, { clientX: 30, clientY: 0 });
    expect(screen.getByText("Yes")).toBeInTheDocument();

    fireEvent.pointerMove(card, { clientX: -30, clientY: 0 });

    expect(screen.getByText("No")).toBeInTheDocument();
    expect(screen.queryByText("Yes")).not.toBeInTheDocument();
    expect(container.querySelector('[data-axis="horizontal"]')).toHaveAttribute(
      "data-direction",
      "left",
    );

    fireEvent.pointerUp(card, { clientX: -30, clientY: 0 });
    await waitFor(() => expect(getCurrentFace(container)).toHaveClass(styles.front));
  });

  it("allows a new axis to be selected after release", async () => {
    const { container } = render(<Card text="Should I do it?" />);
    const card = getCard(container);

    fireEvent.pointerDown(card, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(card, { clientX: 30, clientY: 0 });
    fireEvent.pointerUp(card, { clientX: 30, clientY: 0 });

    await waitFor(() => expect(getCurrentFace(container)).toHaveClass(styles.front));

    fireEvent.pointerDown(card, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(card, { clientX: 0, clientY: 30 });

    expect(container.querySelector('[data-axis="vertical"]')).toBeInTheDocument();
  });
});
