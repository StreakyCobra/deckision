import { Card } from "./Card";
import styles from "./App.module.css";

const cardDirections = {
  right: { color: "#16804b", label: "Yes" },
  left: { color: "#c43d4a", label: "No" },
  up: { color: "#315bcf", label: "Skip" },
  down: { color: "#b8860b", label: "Back" },
} as const;

export function App() {
  return (
    <main className={styles.screen}>
      <Card directions={cardDirections} />
    </main>
  );
}
