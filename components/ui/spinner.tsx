import styles from "./spinner.module.css";

type SpinnerSize = "sm" | "md" | "lg";

interface SpinnerProps {
  /** Visual size of the spinner */
  size?: SpinnerSize;
  /** Override colour via inline style */
  color?: string;
  /** Accessible label (hidden visually) */
  label?: string;
}

/**
 * Pure-CSS loading spinner.
 * Inherits colour from parent by default; override with `color` prop.
 */
export function Spinner({
  size = "md",
  color,
  label = "載入中",
}: SpinnerProps) {
  return (
    <span
      className={`${styles.spinner} ${styles[size]}`}
      style={color ? { borderColor: color, borderTopColor: "transparent" } : undefined}
      role="status"
      aria-label={label}
    />
  );
}
