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
import {
  DECK_DIRECTIONS,
  getCard,
  getTransition,
  isTerminalCard,
  type DeckCard,
  type DeckDefinition,
  type DeckDirection,
} from "./deckGraph";
import styles from "./Deck.module.css";

export {
  normalizeDeckConfig,
  type DeckCard,
  type DeckConfig,
  type DeckDefinition,
  type DeckDirection,
  type DeckDirectionAlias,
  type DeckDirectionKey,
  type DeckTransition,
  type DirectionAppearance,
} from "./deckGraph";

const WINDOW_RADIUS = 1;
const CARD_PEEK_RATIO = 0.1;
const DEFAULT_PITCH = 600;

const SLOT_TRANSITION = {
  type: "tween",
  duration: 0.42,
  ease: [0.22, 1, 0.36, 1],
} as const;

const IMMEDIATE_TRANSITION = { duration: 0 } as const;

export interface DeckProps {
  deck: DeckDefinition;
}

export interface DeckHandle {
  turn(direction: TurnDirection): Promise<boolean>;
}

type NavigationDelta = -1 | 0 | 1;
type CardVersions = Record<number, number>;
type CardVisit = {
  visitId: number;
  cardId: string;
  direction?: DeckDirection;
};
type PendingNavigation = {
  delta: Exclude<NavigationDelta, 0>;
  outgoing: CardVisit;
  target: CardVisit;
  direction?: DeckDirection;
};
type PendingReturn = {
  visitId: number;
  direction: DeckDirection;
};

function getInitialPitch() {
  const basePitch =
    typeof window === "undefined"
      ? DEFAULT_PITCH
      : Math.max(DEFAULT_PITCH, window.innerHeight * 0.75);

  return basePitch;
}

function getCardOffset(slotIndex: number, layoutIndex: number, pitch: number) {
  return (slotIndex - layoutIndex) * pitch;
}

function bumpVersion(versions: CardVersions, visitId: number): CardVersions {
  return { ...versions, [visitId]: (versions[visitId] ?? 0) + 1 };
}

function getOppositeDirection(direction: DeckDirection): DeckDirection {
  switch (direction) {
    case "left":
      return "right";
    case "right":
      return "left";
    case "up":
      return "down";
    case "down":
      return "up";
  }
}

function getCardDirections(
  deck: DeckDefinition,
  card: DeckCard,
  canGoBack: boolean,
): Partial<Record<TurnDirection, TurnDirectionConfig>> {
  return Object.fromEntries(
    DECK_DIRECTIONS.flatMap((direction) => {
      const transition = getTransition(card, direction);
      const hasValidTarget = Boolean(
        transition && getCard(deck, transition.targetCardId),
      );
      const isImplicitBack = direction === "down" && !transition && canGoBack;

      if (!hasValidTarget && !isImplicitBack) {
        return [];
      }

      const defaults = deck.directionDefaults?.[direction];
      return [[direction, {
        color: transition?.color ?? defaults?.color,
        label: transition?.label ?? defaults?.label,
      }]];
    }),
  );
}

export const Deck = forwardRef<DeckHandle, DeckProps>(function Deck(
  { deck },
  ref,
) {
  const nextVisitIdRef = useRef(1);
  const [visits, setVisits] = useState<CardVisit[]>(() => [
    { visitId: 0, cardId: deck.startCardId },
  ]);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);
  const [pendingReturn, setPendingReturn] = useState<PendingReturn | null>(null);
  const [pitch, setPitch] = useState(getInitialPitch);
  const [cardVersions, setCardVersions] = useState<CardVersions>({});
  const activeCardRef = useRef<CardHandle>(null);
  const isNavigatingRef = useRef(false);
  const pendingNavigationRef = useRef<PendingNavigation | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const activeVisit = visits.at(-1);
  const activeCard = activeVisit ? getCard(deck, activeVisit.cardId) : undefined;
  const isNavigating = pendingNavigation !== null;
  const navigationDelta: NavigationDelta = pendingNavigation?.delta ?? 0;

  useEffect(() => {
    if (!getCard(deck, deck.startCardId)) {
      isNavigatingRef.current = false;
      pendingNavigationRef.current = null;
      setPendingNavigation(null);
      setPendingReturn(null);
      setVisits((currentVisits) => (currentVisits.length === 0 ? currentVisits : []));
      return;
    }

    if (!activeVisit || !getCard(deck, activeVisit.cardId)) {
      const startVisit = { visitId: nextVisitIdRef.current++, cardId: deck.startCardId };
      isNavigatingRef.current = false;
      pendingNavigationRef.current = null;
      setPendingNavigation(null);
      setPendingReturn(null);
      setVisits([startVisit]);
    }
  }, [activeVisit, deck]);

  useEffect(() => {
    if (!pendingReturn || activeVisit?.visitId !== pendingReturn.visitId) {
      return;
    }

    let cancelled = false;
    const currentReturn = pendingReturn;

    async function finishReturn() {
      const turned = await activeCardRef.current?.turn(currentReturn.direction);

      if (cancelled) {
        return;
      }

      if (!turned) {
        setCardVersions((currentVersions) =>
          bumpVersion(currentVersions, currentReturn.visitId),
        );
      }

      isNavigatingRef.current = false;
      setPendingReturn(null);
    }

    void finishReturn();

    return () => {
      cancelled = true;
    };
  }, [activeVisit?.visitId, pendingReturn]);

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
  }, [activeVisit?.visitId]);

  function finishNavigation() {
    const pendingNavigation = pendingNavigationRef.current;

    if (!pendingNavigation || !isNavigatingRef.current) {
      return;
    }

    if (!getCard(deck, pendingNavigation.target.cardId)) {
      setCardVersions((currentVersions) =>
        bumpVersion(currentVersions, pendingNavigation.outgoing.visitId),
      );
      pendingNavigationRef.current = null;
      isNavigatingRef.current = false;
      setPendingNavigation(null);
      return;
    }

    if (pendingNavigation.delta < 0) {
      setVisits((currentVisits) => {
        if (
          currentVisits.at(-1)?.visitId !== pendingNavigation.outgoing.visitId ||
          currentVisits.at(-2)?.visitId !== pendingNavigation.target.visitId
        ) {
          return currentVisits;
        }

        return currentVisits.slice(0, -1);
      });

      pendingNavigationRef.current = null;
      setPendingNavigation(null);

      if (pendingNavigation.target.direction) {
        setPendingReturn({
          visitId: pendingNavigation.target.visitId,
          direction: getOppositeDirection(pendingNavigation.target.direction),
        });
      } else {
        setCardVersions((currentVersions) =>
          bumpVersion(currentVersions, pendingNavigation.target.visitId),
        );
        isNavigatingRef.current = false;
      }

      return;
    } else {
      setVisits((currentVisits) => {
        if (currentVisits.at(-1)?.visitId !== pendingNavigation.outgoing.visitId) {
          return currentVisits;
        }

        const outgoing = {
          ...pendingNavigation.outgoing,
          direction: pendingNavigation.direction,
        };
        return [...currentVisits.slice(0, -1), outgoing, pendingNavigation.target];
      });
    }

    pendingNavigationRef.current = null;
    isNavigatingRef.current = false;
    setPendingNavigation(null);
  }

  function onCardTurn(direction: TurnDirection, visitId: number) {
    if (
      !activeVisit ||
      visitId !== activeVisit.visitId ||
      isNavigatingRef.current ||
      !activeCard
    ) {
      return;
    }

    let pending: PendingNavigation | null = null;

    const transition = getTransition(activeCard, direction);

    if (transition) {
      if (!getCard(deck, transition.targetCardId)) {
        setCardVersions((currentVersions) =>
          bumpVersion(currentVersions, activeVisit.visitId),
        );
        return;
      }

      pending = {
        delta: 1,
        outgoing: activeVisit,
        target: {
          visitId: nextVisitIdRef.current++,
          cardId: transition.targetCardId,
        },
        direction,
      };
    } else if (direction === "down") {
      const target = visits.at(-2);

      if (!target) {
        return;
      }

      pending = {
        delta: -1,
        outgoing: activeVisit,
        target,
      };
    } else {
      setCardVersions((currentVersions) =>
        bumpVersion(currentVersions, activeVisit.visitId),
      );
      return;
    }

    isNavigatingRef.current = true;
    pendingNavigationRef.current = pending;
    setPendingNavigation(pending);
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

  const visibleVisits = isNavigating
    ? pendingNavigation?.delta === 1
      ? [...visits.slice(Math.max(0, visits.length - WINDOW_RADIUS * 2)), pendingNavigation.target]
      : visits.slice(Math.max(0, visits.length - (WINDOW_RADIUS * 2 + 1)))
    : visits.slice(Math.max(0, visits.length - (WINDOW_RADIUS + 1)));
  const pendingForwardCard =
    pendingNavigation?.delta === 1
      ? getCard(deck, pendingNavigation.target.cardId)
      : undefined;
  const pendingForwardVisitId =
    pendingNavigation?.delta === 1 ? pendingNavigation.target.visitId : undefined;
  const showBottomPeek = pendingForwardCard
    ? !isTerminalCard(pendingForwardCard)
    : !isNavigating && !isTerminalCard(activeCard);

  return (
    <div
      ref={viewportRef}
      className={styles.viewport}
      data-navigation={navigationDelta}
      draggable={false}
      onDragStartCapture={(event) => event.preventDefault()}
    >
      <div className={styles.track}>
        {visibleVisits.map((visit) => {
          const card = getCard(deck, visit.cardId);

          if (!card) {
            return null;
          }

          const isActive = visit.visitId === activeVisit?.visitId;
          const isEntering = visit.visitId === pendingNavigation?.target.visitId;
          const isOutgoing = visit.visitId === pendingNavigationRef.current?.outgoing.visitId;
          const pathIndex = visits.findIndex((currentVisit) => currentVisit.visitId === visit.visitId);
          const initialSlotIndex = isEntering
            ? pendingNavigation?.delta ?? 0
            : pathIndex - (visits.length - 1);
          const targetSlotIndex = !isNavigating
            ? initialSlotIndex
            : isEntering
              ? 0
              : pendingNavigation?.delta === 1
                ? initialSlotIndex - 1
                : initialSlotIndex + 1;
          const initialTurn = isActive || isEntering ? undefined : visit.direction;
          const cardDirections = getCardDirections(deck, card, pathIndex > 0);
          const slotStyle = {
            zIndex: isOutgoing ? 3 : isActive || isEntering ? 2 : 1,
          } satisfies CSSProperties;

          return (
            <motion.div
              key={visit.visitId}
              className={styles.slot}
              data-active-card={isActive ? "true" : undefined}
              data-card-index={pathIndex >= 0 ? pathIndex : visits.length}
              data-card-id={card.id}
              data-terminal-card={isTerminalCard(card) ? "true" : undefined}
              data-visit-id={visit.visitId}
              aria-hidden={!isActive}
              animate={{ y: getCardOffset(targetSlotIndex, 0, pitch) }}
              initial={
                isNavigating
                  ? { y: getCardOffset(initialSlotIndex, 0, pitch) }
                  : false
              }
              onAnimationComplete={isOutgoing ? finishNavigation : undefined}
              style={slotStyle}
              transition={isNavigating ? SLOT_TRANSITION : IMMEDIATE_TRANSITION}
            >
              <Card
                key={`${visit.visitId}-${cardVersions[visit.visitId] ?? 0}`}
                ref={isActive ? activeCardRef : undefined}
                text={card.text}
                directions={cardDirections}
                initialTurn={initialTurn}
                onTurn={(direction) => onCardTurn(direction, visit.visitId)}
              />
            </motion.div>
          );
        })}
        {showBottomPeek && (
          <motion.div
            key={pendingForwardVisitId ? `bottom-peek-${pendingForwardVisitId}` : "bottom-peek"}
            className={styles.slot}
            data-bottom-peek="true"
            data-card-id="bottom-peek"
            aria-hidden="true"
            animate={{ y: pitch }}
            initial={pendingForwardCard ? { y: pitch * 2 } : false}
            style={{ zIndex: 1 }}
            transition={pendingForwardCard ? SLOT_TRANSITION : IMMEDIATE_TRANSITION}
          >
            <Card
              text=""
              directions={{}}
              disabledDirections={DECK_DIRECTIONS}
            />
          </motion.div>
        )}
      </div>
    </div>
  );
});
