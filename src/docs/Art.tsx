// Custom line-art for PotKit. Paths use pathLength=1 so CSS can "draw" them on hover (.lx-draw).

/** Receipt: invoice ticket with torn bottom edge, barcode and an NFT hex mark. */
export const ReceiptArt = () => (
  <svg viewBox="0 0 200 140" className="lx-logo-art" aria-hidden>
    <g className="ga">
      <path pathLength={1} className="lx-draw c" d="M64 18h72v86l-6 6-6-6-6 6-6-6-6 6-6-6-6 6-6-6-6 6-6-6-6 6-6-6z" />
      <path pathLength={1} className="lx-draw dim" d="M76 34h34M76 44h48M76 54h26" />
      {[0, 3, 5, 9, 11, 14, 18, 20, 23, 27, 30, 32, 36, 39, 42, 45].map((x, i) => <path key={i} className="lx-bar" d={`M${78 + x} 70v${i % 3 ? 16 : 20}`} />)}
    </g>
    <g className="gb">
      <path pathLength={1} className="lx-draw m" d="M150 40l14 8v16l-14 8-14-8V48z" />
      <text x="150" y="60" className="lx-nft">NFT</text>
    </g>
  </svg>
);

/** Vault: round vault door with lock dial, surrounded by share slices. */
export const VaultArt = () => {
  const slices = Array.from({ length: 8 }, (_, i) => {
    const a0 = (i / 8) * Math.PI * 2 + 0.06, a1 = ((i + 1) / 8) * Math.PI * 2 - 0.06, r0 = 46, r1 = 58;
    const p = (r: number, a: number) => `${100 + Math.cos(a) * r} ${70 + Math.sin(a) * r}`;
    return `M${p(r0, a0)} L${p(r1, a0)} A${r1} ${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 0 0 ${p(r0, a0)}z`;
  });
  return (
    <svg viewBox="0 0 200 140" className="lx-logo-art" aria-hidden>
      <g className="lx-slices">{slices.map((d, i) => <path key={i} pathLength={1} className={`lx-draw ${i % 2 ? "m" : "c"} sl`} d={d} style={{ transitionDelay: `${i * 40}ms` }} />)}</g>
      <circle pathLength={1} cx="100" cy="70" r="38" className="lx-draw c" />
      <g className="lx-dial">
        <circle pathLength={1} cx="100" cy="70" r="16" className="lx-draw dim" />
        <path pathLength={1} className="lx-draw c" d="M100 50v8M100 82v8M80 70h8M112 70h8" />
        <path className="lx-draw m" pathLength={1} d="M100 70l9-9" />
      </g>
      <rect x="60" y="62" width="4" height="16" className="lx-hinge" />
    </svg>
  );
};

/** Market: order book (bids/asks) with exchange arrows between them. */
export const MarketArt = () => (
  <svg viewBox="0 0 200 140" className="lx-logo-art" aria-hidden>
    <g>
      {[40, 30, 22, 14].map((w, i) => <rect key={`a${i}`} x={74 - w} y={30 + i * 11} width={w} height="6" className="lx-ask" style={{ animationDelay: `${i * -0.7}s` }} />)}
      {[16, 26, 34, 44].map((w, i) => <rect key={`b${i}`} x="126" y={30 + i * 11} width={w} height="6" className="lx-bid" style={{ animationDelay: `${i * -0.6}s` }} />)}
    </g>
    <path pathLength={1} className="lx-draw c" d="M84 56h32l-8-8M116 56" />
    <path pathLength={1} className="lx-draw m" d="M116 74H84l8 8" />
    <path pathLength={1} className="lx-draw dim" d="M30 108h140M100 22v96" />
    <path pathLength={1} className="lx-draw c spark" d="M34 104l18-10 14 4 18-14 16 6 18-12 16 4 18-10 16 2" />
  </svg>
);

/** Small 24px line icons for steps and security items. */
const I: Record<string, string> = {
  mint: "M7 3h10v18l-2.5-2-2.5 2-2.5-2L7 21zM10 8h4M10 12h4",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3M12 14.5v2.5",
  trade: "M4 8h13l-3-3M20 16H7l3 3",
  settle: "M12 3v18M16.5 7.5c-.8-1.3-2.4-2-4.5-2-2.5 0-4 1.2-4 3s1.6 2.6 4 3 4 1.3 4 3.2-1.7 3.3-4.3 3.3c-2.1 0-3.7-.8-4.5-2.2",
  escrow: "M4 7l8-4 8 4v6c0 4-3.4 7-8 8-4.6-1-8-4-8-8z M9 12h6",
  guard: "M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6zM8.5 12l2.5 2.5 4.5-5",
  tests: "M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3M7.5 15h9",
};
export const Ico = ({ n }: { n: keyof typeof I | string }) => (
  <svg viewBox="0 0 24 24" className="lx-i" aria-hidden><path d={I[n]} /></svg>
);
