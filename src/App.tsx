import { useEffect, useRef } from "react";

import { Card, type CardHandle, type TurnDirection } from "./Card";
import styles from "./App.module.css";

const cardDirections = {
  right: { color: "#16804b", label: "Yes" },
  left: { color: "#c43d4a", label: "No" },
  up: { color: "#315bcf", label: "Skip" },
  down: { color: "#b8860b", label: "Back" },
} as const;

const KEYBOARD_DIRECTIONS: Record<string, TurnDirection> = {
  ArrowRight: "right",
  ArrowLeft: "left",
  ArrowUp: "up",
  ArrowDown: "down",
};

function isTextEntryTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

export function App() {
  const activeCardRef = useRef<CardHandle>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const direction = KEYBOARD_DIRECTIONS[event.key];

      if (
        !direction ||
        event.defaultPrevented ||
        isTextEntryTarget(event.target) ||
        !activeCardRef.current
      ) {
        return;
      }

      event.preventDefault();
      void activeCardRef.current.turn(direction);
    }

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <main className={styles.screen}>
      <Card
        ref={activeCardRef}
        text="Do you want to turn me around?"
        directions={cardDirections}
      />
    </main>
  );
}
