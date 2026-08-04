import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { turn } = vi.hoisted(() => ({
  turn: vi.fn().mockResolvedValue(true),
}));

vi.mock("./Card", async () => {
  const React = await import("react");

  type MockCardHandle = {
    turn(direction: string): Promise<boolean>;
  };

  return {
    Card: React.forwardRef<MockCardHandle, { text: string }>(function MockCard(
      { text },
      ref,
    ) {
      React.useImperativeHandle(ref, () => ({ turn }), []);

      return React.createElement("div", { "data-testid": "card" }, text);
    }),
  };
});

import { App } from "./App";

describe("App", () => {
  beforeEach(() => {
    turn.mockClear();
  });

  it("routes arrow keys to the active card", () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowUp" });
    fireEvent.keyDown(window, { key: "ArrowDown" });

    expect(turn).toHaveBeenCalledTimes(4);
    expect(turn).toHaveBeenNthCalledWith(1, "right");
    expect(turn).toHaveBeenNthCalledWith(2, "left");
    expect(turn).toHaveBeenNthCalledWith(3, "up");
    expect(turn).toHaveBeenNthCalledWith(4, "down");
  });

  it("does not capture arrows from text entry fields", () => {
    render(<App />);
    const input = document.createElement("input");
    document.body.append(input);

    fireEvent.keyDown(input, { key: "ArrowRight" });

    expect(turn).not.toHaveBeenCalled();
    input.remove();
  });
});
