import { motion } from "motion/react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import {
  Card,
  type CardHandle,
  type TurnDirection,
  type TurnDirectionConfig,
} from "./Card";
import styles from "./Deck.module.css";

const WINDOW_RADIUS = 1;
const CARD_PEEK_RATIO = 0.1;
const DEFAULT_PITCH = 600;

const SLOT_TRANSITION = {
  type: "tween",
  duration: 0.42,
  ease: [0.22, 1, 0.36, 1],
} as const;

const IMMEDIATE_TRANSITION = { duration: 0 } as const;

export interface DeckCard {
  id: string;
  text: string;
}

export interface DeckProps {
  cards: readonly DeckCard[];
  directions?: Partial<Record<TurnDirection, TurnDirectionConfig>>;
}

export interface DeckHandle {
  turn(direction: TurnDirection): Promise<boolean>;
}

type NavigationDelta = -1 | 0 | 1;
type TurnHistory = Record<string, TurnDirection>;
type CardVersions = Record<string, number>;
type PendingNavigation = {
  delta: Exclude<NavigationDelta, 0>;
  outgoingId: string;
  targetId: string;
};

function getNavigationDelta(direction: TurnDirection): Exclude<NavigationDelta, 0> {
  return direction === "down" ? -1 : 1;
}

function getInitialPitch() {
  const basePitch =
    typeof window === "undefined"
      ? DEFAULT_PITCH
      : Math.max(DEFAULT_PITCH, window.innerHeight * 0.75);

  return basePitch;
}

function getCardOffset(cardIndex: number, layoutIndex: number, pitch: number) {
  return (cardIndex - layoutIndex) * pitch;
}

function getWindowBounds(activeIndex: number, cardCount: number) {
  if (cardCount === 0) {
    return { start: 0, end: -1 };
  }

  const lastIndex = cardCount - 1;
  const start = Math.max(0, Math.min(activeIndex - WINDOW_RADIUS, lastIndex - WINDOW_RADIUS * 2));

  return {
    start,
    end: Math.min(lastIndex, start + WINDOW_RADIUS * 2),
  };
}

function getDisabledDirections(activeIndex: number, cardCount: number): TurnDirection[] {
  if (cardCount === 0) {
    return ["left", "right", "up", "down"];
  }

  const disabled: TurnDirection[] = [];

  if (activeIndex === 0) {
    disabled.push("down");
  }

  if (activeIndex === cardCount - 1) {
    disabled.push("left", "right", "up");
  }

  return disabled;
}

function bumpVersion(versions: CardVersions, cardId: string): CardVersions {
  return { ...versions, [cardId]: (versions[cardId] ?? 0) + 1 };
}

function pruneByCardId<T>(values: Record<string, T>, cards: readonly DeckCard[]) {
  const cardIds = new Set(cards.map((card) => card.id));
  const pruned = Object.fromEntries(
    Object.entries(values).filter(([cardId]) => cardIds.has(cardId)),
  ) as Record<string, T>;

  return Object.keys(pruned).length === Object.keys(values).length ? values : pruned;
}

export const Deck = forwardRef<DeckHandle, DeckProps>(function Deck(
  { cards, directions },
  ref,
) {
  const [activeCardId, setActiveCardId] = useState<string | null>(cards[0]?.id ?? null);
  const [navigationTargetId, setNavigationTargetId] = useState<string | null>(null);
  const [pitch, setPitch] = useState(getInitialPitch);
  const [turnHistory, setTurnHistory] = useState<TurnHistory>({});
  const [cardVersions, setCardVersions] = useState<CardVersions>({});
  const activeCardRef = useRef<CardHandle>(null);
  const isNavigatingRef = useRef(false);
  const pendingNavigationRef = useRef<PendingNavigation | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const storedActiveIndex = cards.findIndex((card) => card.id === activeCardId);
  const activeIndex = storedActiveIndex >= 0 ? storedActiveIndex : cards.length > 0 ? 0 : -1;
  const activeId = cards[activeIndex]?.id ?? null;
  const targetIndex = navigationTargetId
    ? cards.findIndex((card) => card.id === navigationTargetId)
    : -1;
  const isNavigating = targetIndex >= 0 && activeIndex >= 0;
  const layoutIndex = isNavigating ? targetIndex : Math.max(0, activeIndex);
  const navigationDelta: NavigationDelta = isNavigating
    ? targetIndex > activeIndex
      ? 1
      : -1
    : 0;

  useEffect(() => {
    const activeCardIsValid = activeCardId === null || cards.some((card) => card.id === activeCardId);
    const targetCardIsValid =
      navigationTargetId === null || cards.some((card) => card.id === navigationTargetId);

    if (!activeCardIsValid) {
      isNavigatingRef.current = false;
      pendingNavigationRef.current = null;
      setNavigationTargetId(null);
      setActiveCardId(cards[0]?.id ?? null);
    } else if (!targetCardIsValid) {
      isNavigatingRef.current = false;
      pendingNavigationRef.current = null;
      setNavigationTargetId(null);
    }

    setTurnHistory((currentHistory) => pruneByCardId(currentHistory, cards));
    setCardVersions((currentVersions) => pruneByCardId(currentVersions, cards));
  }, [activeCardId, cards, navigationTargetId]);

  useLayoutEffect(() => {
    function measurePitch() {
      const viewport = viewportRef.current;

      if (!viewport) {
        return;
      }

      const activeScene = viewport.querySelector<HTMLElement>(
        '[data-active-card="true"] [data-card-scene="true"]',
      );
      const viewportHeight = viewport.getBoundingClientRect().height || window.innerHeight;
      const cardHeight = activeScene?.getBoundingClientRect().height ?? 0;
      const nextPitch =
        cardHeight > 0
          ? Math.max(
              1,
              (viewportHeight + cardHeight) / 2 - cardHeight * CARD_PEEK_RATIO,
            )
          : getInitialPitch();

      setPitch((currentPitch) =>
        Math.abs(currentPitch - nextPitch) < 0.5
          ? currentPitch
          : nextPitch,
      );
    }

    measurePitch();
    window.addEventListener("resize", measurePitch);

    return () => window.removeEventListener("resize", measurePitch);
  }, [activeId, cards.length]);

  function finishNavigation() {
    const pendingNavigation = pendingNavigationRef.current;

    if (!pendingNavigation || !isNavigatingRef.current) {
      return;
    }

    if (!cards.some((card) => card.id === pendingNavigation.targetId)) {
      pendingNavigationRef.current = null;
      isNavigatingRef.current = false;
      setNavigationTargetId(null);
      return;
    }

    if (pendingNavigation.delta < 0) {
      setTurnHistory((currentHistory) => {
        const nextHistory = { ...currentHistory };
        delete nextHistory[pendingNavigation.outgoingId];
        return nextHistory;
      });
      setCardVersions((currentVersions) =>
        bumpVersion(currentVersions, pendingNavigation.outgoingId),
      );
    }

    pendingNavigationRef.current = null;
    isNavigatingRef.current = false;
    setActiveCardId(pendingNavigation.targetId);
    setNavigationTargetId(null);
  }

  function onCardTurn(direction: TurnDirection, cardId: string) {
    if (cardId !== activeId || isNavigatingRef.current || activeIndex < 0) {
      return;
    }

    const delta = getNavigationDelta(direction);
    const nextIndex = activeIndex + delta;
    const targetCard = cards[nextIndex];

    if (!targetCard) {
      return;
    }

    isNavigatingRef.current = true;
    pendingNavigationRef.current = {
      delta,
      outgoingId: cardId,
      targetId: targetCard.id,
    };
    setCardVersions((currentVersions) => bumpVersion(currentVersions, targetCard.id));

    if (delta > 0) {
      setTurnHistory((currentHistory) => ({
        ...currentHistory,
        [cardId]: direction,
      }));
    }

    setNavigationTargetId(targetCard.id);
  }

  useImperativeHandle(
    ref,
    () => ({
      turn(direction) {
        if (isNavigatingRef.current || !activeCardRef.current) {
          return Promise.resolve(false);
        }

        return activeCardRef.current.turn(direction);
      },
    }),
    [],
  );

  const activeBounds = getWindowBounds(Math.max(0, activeIndex), cards.length);
  const targetBounds = isNavigating
    ? getWindowBounds(targetIndex, cards.length)
    : activeBounds;
  const start = Math.min(activeBounds.start, targetBounds.start);
  const end = Math.max(activeBounds.end, targetBounds.end);
  const disabledDirections = getDisabledDirections(activeIndex, cards.length);
  const visibleCards = cards.slice(start, end + 1);

  return (
    <div
      ref={viewportRef}
      className={styles.viewport}
      data-navigation={navigationDelta}
      draggable={false}
      onDragStartCapture={(event) => event.preventDefault()}
    >
      <div className={styles.track}>
        {visibleCards.map((card, offset) => {
          const cardIndex = start + offset;
          const isActive = card.id === activeId;
          const isEntering = card.id === navigationTargetId;
          const isOutgoing = card.id === pendingNavigationRef.current?.outgoingId;
          const initialTurn = isActive || isEntering ? undefined : turnHistory[card.id];
          const slotStyle = {
            zIndex: isOutgoing ? 3 : isActive || isEntering ? 2 : 1,
          } satisfies CSSProperties;

          return (
            <motion.div
              key={card.id}
              className={styles.slot}
              data-active-card={isActive ? "true" : undefined}
              data-card-index={cardIndex}
              data-card-id={card.id}
              aria-hidden={!isActive}
              animate={{ y: getCardOffset(cardIndex, layoutIndex, pitch) }}
              initial={
                isNavigating
                  ? { y: getCardOffset(cardIndex, activeIndex, pitch) }
                  : false
              }
              onAnimationComplete={isOutgoing ? finishNavigation : undefined}
              style={slotStyle}
              transition={isNavigating ? SLOT_TRANSITION : IMMEDIATE_TRANSITION}
            >
              <Card
                key={`${card.id}-${cardVersions[card.id] ?? 0}`}
                ref={isActive ? activeCardRef : undefined}
                text={card.text}
                directions={directions}
                disabledDirections={disabledDirections}
                initialTurn={initialTurn}
                onTurn={(direction) => onCardTurn(direction, card.id)}
              />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
});
