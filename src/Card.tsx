import { animate, motion, useMotionValue, useTransform, type PanInfo } from "motion/react";
import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import styles from "./Card.module.css";

type CardFace = "front" | "back";
type TurnAxis = "horizontal" | "vertical";

export type TurnDirection = "left" | "right" | "up" | "down";

export interface TurnDirectionConfig {
  color: string;
  label: string;
}

export interface CardProps {
  text: string;
  directions?: Partial<Record<TurnDirection, TurnDirectionConfig>>;
  disabledDirections?: readonly TurnDirection[];
  initialTurn?: TurnDirection;
  onTurn?: (direction: TurnDirection) => void;
}

export interface CardHandle {
  turn(direction: TurnDirection): Promise<boolean>;
}

type CardColorStyle = CSSProperties & {
  "--card-color": string;
};

const AXIS_LOCK_DISTANCE = 12;
const TURN_VELOCITY = 500;
const DEGREES_PER_PIXEL = 0.75;
const MAX_DRAG_ANGLE = 160;
const REVEAL_ANGLE = 90;
const COMPLETE_TURN_ANGLE = 180;

const DEFAULT_DIRECTION_CONFIGS: Record<TurnDirection, TurnDirectionConfig> = {
  right: { color: "#1f9d55", label: "Yes" },
  left: { color: "#d64545", label: "No" },
  up: { color: "#2563eb", label: "Skip" },
  down: { color: "#d9a400", label: "Back" },
};

function getAxis(offset: PanInfo["offset"]): TurnAxis {
  return Math.abs(offset.x) >= Math.abs(offset.y) ? "horizontal" : "vertical";
}

function getDirection(axis: TurnAxis, offset: number): TurnDirection {
  if (axis === "horizontal") {
    return offset >= 0 ? "right" : "left";
  }

  return offset >= 0 ? "down" : "up";
}

function getAxisForDirection(direction: TurnDirection): TurnAxis {
  return direction === "left" || direction === "right" ? "horizontal" : "vertical";
}

function getRotation(direction: TurnDirection, angle: number) {
  switch (direction) {
    case "right":
      return { rotateX: 0, rotateY: angle };
    case "left":
      return { rotateX: 0, rotateY: -angle };
    case "up":
      return { rotateX: angle, rotateY: 0 };
    case "down":
      return { rotateX: -angle, rotateY: 0 };
  }
}

function getDirectionColor(
  direction: TurnDirection,
  directions: Partial<Record<TurnDirection, TurnDirectionConfig>>,
) {
  return directions[direction]?.color ?? DEFAULT_DIRECTION_CONFIGS[direction].color;
}

function getColorStyle(color: string): CardColorStyle {
  return { "--card-color": color };
}

export const Card = forwardRef<CardHandle, CardProps>(function Card(
  {
    text,
    directions,
    disabledDirections,
    initialTurn,
    onTurn,
  },
  ref,
) {
  const directionConfigs = directions ?? DEFAULT_DIRECTION_CONFIGS;
  const [face, setFace] = useState<CardFace>(initialTurn ? "back" : "front");
  const [axis, setAxis] = useState<TurnAxis | null>(null);
  const [backDirection, setBackDirection] = useState<TurnDirection>(initialTurn ?? "right");
  const [previewDirection, setPreviewDirection] = useState<TurnDirection | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const axisRef = useRef<TurnAxis | null>(null);
  const isSettlingRef = useRef(false);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const hintOpacity = useTransform(() =>
    Math.min(1, (Math.abs(rotateX.get()) + Math.abs(rotateY.get())) / 90),
  );
  const labelOpacity = useTransform(() =>
    Math.abs(rotateX.get()) + Math.abs(rotateY.get()) < REVEAL_ANGLE ? 1 : 0,
  );

  function isDirectionAvailable(direction: TurnDirection) {
    return !disabledDirections?.includes(direction) && Boolean(directionConfigs[direction]);
  }

  function resetAxis() {
    axisRef.current = null;
    setAxis(null);
    setPreviewDirection(null);
    setIsDragging(false);
  }

  function onPanStart() {
    if (isSettlingRef.current) {
      return;
    }

    resetAxis();
    setIsDragging(true);
  }

  function onPan(_: PointerEvent, info: PanInfo) {
    if (isSettlingRef.current) {
      return;
    }

    let activeAxis = axisRef.current;

    if (!activeAxis && Math.max(Math.abs(info.offset.x), Math.abs(info.offset.y)) >= AXIS_LOCK_DISTANCE) {
      activeAxis = getAxis(info.offset);
      axisRef.current = activeAxis;
      setAxis(activeAxis);
    }

    if (!activeAxis) {
      return;
    }

    const offset = activeAxis === "horizontal" ? info.offset.x : info.offset.y;
    const direction = getDirection(activeAxis, offset);

    if (face === "front" && !isDirectionAvailable(direction)) {
      setPreviewDirection(null);
      setIsDragging(false);
      rotateX.set(0);
      rotateY.set(0);
      return;
    }

    const angle = Math.min(Math.abs(offset) * DEGREES_PER_PIXEL, MAX_DRAG_ANGLE);
    const rotation = getRotation(direction, angle);

    setPreviewDirection(face === "front" ? direction : null);
    setIsDragging(face === "front");
    rotateX.set(rotation.rotateX);
    rotateY.set(rotation.rotateY);
  }

  async function settleTurn(
    direction: TurnDirection,
    activeAxis: TurnAxis,
    shouldTurn: boolean,
  ): Promise<boolean> {
    const rotationValue = activeAxis === "horizontal" ? rotateY : rotateX;
    const rotation = getRotation(direction, shouldTurn ? COMPLETE_TURN_ANGLE : 0);
    const rotationTarget = activeAxis === "horizontal" ? rotation.rotateY : rotation.rotateX;

    try {
      await animate(rotationValue, rotationTarget, {
        type: "tween",
        duration: 0.42,
        ease: [0.22, 1, 0.36, 1],
      });

      if (shouldTurn) {
        if (face === "front") {
          setBackDirection(direction);
          setFace("back");
        } else {
          setFace("front");
        }

        onTurn?.(direction);
      }

      return shouldTurn;
    } finally {
      rotateX.set(0);
      rotateY.set(0);
      resetAxis();
      isSettlingRef.current = false;
    }
  }

  async function turn(direction: TurnDirection): Promise<boolean> {
    if (isSettlingRef.current || (face === "front" && !isDirectionAvailable(direction))) {
      return false;
    }

    const activeAxis = getAxisForDirection(direction);
    axisRef.current = activeAxis;
    setAxis(activeAxis);
    if (face === "front") {
      setBackDirection(direction);
    }
    setPreviewDirection(null);
    setIsDragging(false);
    isSettlingRef.current = true;

    return settleTurn(direction, activeAxis, true);
  }

  async function onPanEnd(_: PointerEvent, info: PanInfo) {
    if (isSettlingRef.current) {
      return;
    }

    const activeAxis = axisRef.current;

    if (!activeAxis) {
      setIsDragging(false);
      return;
    }

    setIsDragging(false);
    isSettlingRef.current = true;

    const offset = activeAxis === "horizontal" ? info.offset.x : info.offset.y;
    const velocity = activeAxis === "horizontal" ? info.velocity.x : info.velocity.y;
    const direction = getDirection(activeAxis, offset);
    const rotationValue = activeAxis === "horizontal" ? rotateY : rotateX;
    const isBackRevealed = Math.abs(rotationValue.get()) > REVEAL_ANGLE;
    const isAllowed = face === "back" || isDirectionAvailable(direction);
    const shouldTurn =
      isAllowed &&
      (isBackRevealed || (Math.abs(velocity) >= TURN_VELOCITY && velocity * offset > 0));
    await settleTurn(direction, activeAxis, shouldTurn);
  }

  useImperativeHandle(ref, () => ({ turn }), [directions, disabledDirections, face, onTurn]);

  const targetFace: CardFace = face === "front" ? "back" : "front";
  const targetDirection = previewDirection ?? backDirection;
  const targetColor = getDirectionColor(targetDirection, directionConfigs);
  const backColor = getDirectionColor(backDirection, directionConfigs);
  const previewConfig = previewDirection ? directionConfigs[previewDirection] : undefined;

  return (
    <div className={styles.scene} data-card-scene="true">
      <motion.div
        className={styles.card}
        style={{ rotateX, rotateY }}
        onPanStart={onPanStart}
        onPan={onPan}
        onPanEnd={onPanEnd}
      >
        <div
          className={`${styles.face} ${face === "front" ? styles.front : styles.back}`}
          data-direction={backDirection}
          style={getColorStyle(backColor)}
        >
          {face === "front" && previewDirection && previewConfig && (
            <>
              <motion.div
                aria-hidden="true"
                className={styles.hint}
                data-direction={previewDirection}
                style={{ ...getColorStyle(previewConfig.color), opacity: hintOpacity }}
              />
              {isDragging && previewConfig.label && (
                <motion.span
                  aria-hidden="true"
                  className={styles.hintLabel}
                  data-direction={previewDirection}
                  style={{ ...getColorStyle(previewConfig.color), opacity: labelOpacity }}
                >
                  {previewConfig.label}
                </motion.span>
              )}
            </>
          )}
          <span>{face === "front" ? text : "!"}</span>
        </div>
        <div
          className={`${styles.face} ${styles.target} ${
            targetFace === "front" ? styles.front : styles.back
          }`}
          data-axis={axis ?? "horizontal"}
          data-direction={targetDirection}
          style={getColorStyle(targetColor)}
        >
          <span>{targetFace === "front" ? text : "!"}</span>
        </div>
      </motion.div>
    </div>
  );
});
