/**
 * The FloodSense logo icon on a white tile. The icon's navy pin disappears on the dark
 * sidebar and sign-in card, so it always sits on white.
 */
export function BrandMark({ size = 56, className = '' }: { size?: number; className?: string }) {
  return (
    <div
      className={`shrink-0 flex items-center justify-center bg-white ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        boxShadow: '0 8px 20px rgba(46, 196, 182, 0.35), inset 0 0 0 1px rgba(11, 60, 93, 0.06)',
      }}
    >
      <img src="/floodsense-logo.svg" alt="FloodSense" style={{ width: size * 0.7, height: size * 0.7 }} draggable={false} />
    </div>
  );
}
