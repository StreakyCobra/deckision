import { useEffect, useRef } from "react";

import { type TurnDirection } from "./Card";
import styles from "./App.module.css";
import { Deck, type DeckCard, type DeckHandle } from "./Deck";

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

const demoDeck: DeckCard[] = [
  { id: "card-1", text: "Should we ship this idea today?" },
  { id: "card-2", text: "Would a smaller first step help?" },
  { id: "card-3", text: "Is this worth another hour of focus?" },
  { id: "card-4", text: "Could we make this simpler?" },
  { id: "card-5", text: "Should we ask for another opinion?" },
  { id: "card-6", text: "Is this the right trade-off?" },
  { id: "card-7", text: "Would a short experiment answer this?" },
  { id: "card-8", text: "Can we remove one more step?" },
  { id: "card-9", text: "Is this ready to share?" },
  { id: "card-10", text: "What should we decide next?" },
];

function isTextEntryTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

export function App() {
  const deckRef = useRef<DeckHandle>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const direction = KEYBOARD_DIRECTIONS[event.key];

      if (
        !direction ||
        event.defaultPrevented ||
        isTextEntryTarget(event.target) ||
        !deckRef.current
      ) {
        return;
      }

      event.preventDefault();
      void deckRef.current.turn(direction);
    }

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <main className={styles.screen}>
      <Deck ref={deckRef} cards={demoDeck} directions={cardDirections} />
    </main>
  );
}
