export const DECK_DIRECTIONS = ["left", "down", "up", "right"] as const;

export type DeckDirection = (typeof DECK_DIRECTIONS)[number];
export type DeckDirectionAlias = "yes" | "no" | "skip" | "back";
export type DeckDirectionKey = DeckDirection | DeckDirectionAlias;

export interface DirectionAppearance {
  color?: string;
  label?: string;
}

export interface DeckTransition extends DirectionAppearance {
  targetCardId: string;
}

export interface DeckCard {
  id: string;
  text: string;
  transitions?: Partial<Record<DeckDirection, DeckTransition>>;
}

export interface DeckDefinition {
  startCardId: string;
  directionDefaults?: Partial<Record<DeckDirection, DirectionAppearance>>;
  cards: readonly DeckCard[];
}

export interface DeckCardConfig {
  id: string;
  text: string;
  transitions?: Partial<Record<DeckDirectionKey, DeckTransition>>;
}

export interface DeckConfig {
  startCardId: string;
  directionDefaults?: Partial<Record<DeckDirectionKey, DirectionAppearance>>;
  cards: readonly DeckCardConfig[];
}

const DIRECTION_ALIASES: Record<DeckDirectionAlias, DeckDirection> = {
  yes: "right",
  no: "left",
  skip: "up",
  back: "down",
};

function normalizeDirection(direction: string): DeckDirection {
  if (direction in DIRECTION_ALIASES) {
    return DIRECTION_ALIASES[direction as DeckDirectionAlias];
  }

  if ((DECK_DIRECTIONS as readonly string[]).includes(direction)) {
    return direction as DeckDirection;
  }

  throw new Error(`Unsupported deck direction ${JSON.stringify(direction)}`);
}

function normalizeDirectionMap<T>(
  values: Partial<Record<DeckDirectionKey, T>> | undefined,
  location: string,
) {
  if (!values) {
    return undefined;
  }

  const normalized: Partial<Record<DeckDirection, T>> = {};

  for (const [key, value] of Object.entries(values) as [DeckDirectionKey, T][]) {
    const direction = normalizeDirection(key);

    if (Object.hasOwn(normalized, direction)) {
      throw new Error(`${location} defines multiple keys for the ${direction} direction`);
    }

    normalized[direction] = value;
  }

  return normalized;
}

export function normalizeDeckConfig(config: DeckConfig): DeckDefinition {
  return {
    startCardId: config.startCardId,
    directionDefaults: normalizeDirectionMap(
      config.directionDefaults,
      "directionDefaults",
    ),
    cards: config.cards.map((card) => ({
      id: card.id,
      text: card.text,
      transitions: normalizeDirectionMap(
        card.transitions,
        `card ${JSON.stringify(card.id)} transitions`,
      ),
    })),
  };
}

export function getCard(deck: DeckDefinition, cardId: string) {
  return deck.cards.find((card) => card.id === cardId);
}

export function getTransition(card: DeckCard | undefined, direction: DeckDirection) {
  return card?.transitions?.[direction];
}

export function isTerminalCard(card: DeckCard | undefined) {
  if (!card) {
    return false;
  }

  return !DECK_DIRECTIONS.some((direction) => Boolean(getTransition(card, direction)));
}
