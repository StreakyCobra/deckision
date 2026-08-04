import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import styles from "./Card.module.css";
import { Card } from "./Card";

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

  it("keeps all directions available without labels by default", () => {
    const { container } = render(<Card />);
    const card = getCard(container);

    drag(card, 0, -130);

    expect(screen.queryByText("Yes")).not.toBeInTheDocument();
    expect(container.querySelector('[data-direction="up"]')).toBeInTheDocument();
  });

  it("renders an active label with its configured color", () => {
    const { container } = render(
      <Card directions={{ right: { color: "#123456", label: "Yes" } }} />,
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

  it("hides the label immediately when a partial drag returns to the front", async () => {
    const { container } = render(
      <Card directions={{ right: { color: "#1f9d55", label: "Yes" } }} />,
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
      <Card directions={{ left: { color: "#d64545", label: "No" } }} />,
    );
    const card = getCard(container);

    drag(card, 130, 0);

    expect(screen.queryByText("No")).not.toBeInTheDocument();

    fireEvent.pointerUp(card, { clientX: 130, clientY: 0 });

    await waitFor(() => expect(getCurrentFace(container)).toHaveClass(styles.front));
  });

  it("treats an empty direction map as no front choices", async () => {
    const { container } = render(<Card directions={{}} />);
    const card = getCard(container);

    drag(card, 0, -130);

    expect(container.querySelector('[data-direction="up"]')).not.toBeInTheDocument();

    fireEvent.pointerUp(card, { clientX: 0, clientY: -130 });

    await waitFor(() => expect(getCurrentFace(container)).toHaveClass(styles.front));
  });

  it("allows any direction when returning from the back face", async () => {
    const { container } = render(
      <Card directions={{ left: { color: "#d64545", label: "No" } }} />,
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
    const { container } = render(<Card />);
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
    const { container } = render(<Card />);
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
