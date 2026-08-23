type Props = {
  name: string;
  className?: string;
  /** e.g. 'text-base' — Material defaults to 24px */
  size?: string;
};

export function MaterialSymbol({ name, className = '', size }: Props) {
  return (
    <span
      className={`material-symbols-outlined align-middle ${size ?? ''} ${className}`.trim()}
      aria-hidden
    >
      {name}
    </span>
  );
}
