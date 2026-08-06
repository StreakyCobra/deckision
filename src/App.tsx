import { useEffect, useRef } from "react";
import { parse } from "yaml";

import { type TurnDirection } from "./Card";
import styles from "./App.module.css";
import {
  Deck,
  normalizeDeckConfig,
  type DeckConfig,
  type DeckHandle,
} from "./Deck";
import demoDeckYaml from "./demoDeck.yaml?raw";

const KEYBOARD_DIRECTIONS: Record<string, TurnDirection> = {
  ArrowRight: "right",
  ArrowLeft: "left",
  ArrowUp: "up",
  ArrowDown: "down",
};

const demoDeck = normalizeDeckConfig(parse(demoDeckYaml) as DeckConfig);

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
      <Deck ref={deckRef} deck={demoDeck} />
    </main>
  );
}
