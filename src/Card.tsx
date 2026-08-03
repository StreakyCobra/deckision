import { animate, motion, useMotionValue, useTransform, type PanInfo } from "motion/react";
import { useRef, useState } from "react";

import styles from "./Card.module.css";

type CardFace = "front" | "back";
type TurnAxis = "horizontal" | "vertical";
type TurnDirection = "left" | "right" | "up" | "down";

const AXIS_LOCK_DISTANCE = 12;
const AXIS_RESET_DISTANCE = 8;
const TURN_VELOCITY = 500;
const DEGREES_PER_PIXEL = 0.75;
const MAX_DRAG_ANGLE = 160;
const REVEAL_ANGLE = 90;
const COMPLETE_TURN_ANGLE = 180;

function getAxis(offset: PanInfo["offset"]): TurnAxis {
  return Math.abs(offset.x) >= Math.abs(offset.y) ? "horizontal" : "vertical";
}

function getDirection(axis: TurnAxis, offset: number): TurnDirection {
  if (axis === "horizontal") {
    return offset >= 0 ? "right" : "left";
  }

  return offset >= 0 ? "down" : "up";
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

export function Card() {
  const [face, setFace] = useState<CardFace>("front");
  const [axis, setAxis] = useState<TurnAxis | null>(null);
  const [backDirection, setBackDirection] = useState<TurnDirection>("right");
  const [previewDirection, setPreviewDirection] = useState<TurnDirection | null>(null);
  const axisRef = useRef<TurnAxis | null>(null);
  const isSettlingRef = useRef(false);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const hintOpacity = useTransform(() =>
    Math.min(1, (Math.abs(rotateX.get()) + Math.abs(rotateY.get())) / 90),
  );

  function resetAxis() {
    axisRef.current = null;
    setAxis(null);
    setPreviewDirection(null);
  }

  function onPanStart() {
    if (isSettlingRef.current) {
      return;
    }

    resetAxis();
  }

  function onPan(_: PointerEvent, info: PanInfo) {
    if (isSettlingRef.current) {
      return;
    }

    let activeAxis = axisRef.current;

    if (
      activeAxis &&
      Math.abs(activeAxis === "horizontal" ? info.offset.x : info.offset.y) <= AXIS_RESET_DISTANCE
    ) {
      resetAxis();
      rotateX.set(0);
      rotateY.set(0);
      activeAxis = null;
    }

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
    const angle = Math.min(Math.abs(offset) * DEGREES_PER_PIXEL, MAX_DRAG_ANGLE);
    const rotation = getRotation(direction, angle);

    setPreviewDirection(direction);
    rotateX.set(rotation.rotateX);
    rotateY.set(rotation.rotateY);
  }

  async function onPanEnd(_: PointerEvent, info: PanInfo) {
    if (isSettlingRef.current) {
      return;
    }

    const activeAxis = axisRef.current;

    if (!activeAxis) {
      return;
    }

    isSettlingRef.current = true;

    const offset = activeAxis === "horizontal" ? info.offset.x : info.offset.y;
    const velocity = activeAxis === "horizontal" ? info.velocity.x : info.velocity.y;
    const direction = getDirection(activeAxis, offset);
    const rotationValue = activeAxis === "horizontal" ? rotateY : rotateX;
    const isBackRevealed = Math.abs(rotationValue.get()) > REVEAL_ANGLE;
    const shouldTurn =
      isBackRevealed || (Math.abs(velocity) >= TURN_VELOCITY && velocity * offset > 0);
    const rotation = getRotation(direction, shouldTurn ? COMPLETE_TURN_ANGLE : 0);
    const rotationTarget = activeAxis === "horizontal" ? rotation.rotateY : rotation.rotateX;

    await animate(rotationValue, rotationTarget, {
      type: "spring",
      stiffness: 420,
      damping: 34,
    });

    if (shouldTurn) {
      if (face === "front") {
        setBackDirection(direction);
        setFace("back");
      } else {
        setFace("front");
      }
    }

    rotateX.set(0);
    rotateY.set(0);
    resetAxis();
    isSettlingRef.current = false;
  }

  const targetFace: CardFace = face === "front" ? "back" : "front";
  const targetDirection = previewDirection ?? backDirection;

  return (
    <div className={styles.scene}>
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
        >
          {face === "front" && previewDirection && (
            <motion.div
              aria-hidden="true"
              className={styles.hint}
              data-direction={previewDirection}
              style={{ opacity: hintOpacity }}
            />
          )}
          <span>{face === "front" ? "?" : "!"}</span>
        </div>
        <div
          className={`${styles.face} ${styles.target} ${targetFace === "front" ? styles.front : styles.back}`}
          data-axis={axis ?? "horizontal"}
          data-direction={targetDirection}
        >
          <span>{targetFace === "front" ? "?" : "!"}</span>
        </div>
      </motion.div>
    </div>
  );
}
