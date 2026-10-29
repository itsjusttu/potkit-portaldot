// Line art for the doc pages. Same drawing language as the landing's explore cards (classes .s .f .a .ab .dash live in
// landing-pk.css under .pl-xart): violet outlines, one accent fill, no data. Always rendered inside <div className="pl-xart">.
const V = { viewBox: "0 0 280 150", focusable: "false" as const };

/** Receipt: invoice ticket with a torn edge, barcode and an NFT hexagon. */
export const ReceiptArt = () => (
  <svg {...V} aria-hidden>
    <path className="f" d="M84 14h96v108l-8 8-8-8-8 8-8-8-8 8-8-8-8 8-8-8-8 8-8-8-8 8-8-8z" />
    <rect className="a" x="96" y="28" width="34" height="7" rx="2" />
    <path className="s" d="M96 48h66M96 60h48M96 72h58" />
    <path className="s" d="M96 90v18M102 90v18M108 90v18M116 90v18M122 90v18M126 90v18M134 90v18M140 90v18M148 90v18M156 90v18M162 90v18" />
    <path className="f" d="M226 36l22 12v26l-22 12-22-12V48z" />
    <path className="s dash" d="M182 56l18-4" />
    <path className="ab" d="M216 62l7 7 13-14" />
  </svg>
);

/** Vault: a round vault door ringed by share dots. */
export const VaultArt = () => (
  <svg {...V} aria-hidden>
    <circle className="f" cx="140" cy="75" r="46" />
    <circle className="s" cx="140" cy="75" r="31" />
    <circle className="a" cx="140" cy="75" r="7" />
    <path className="s" d="M140 46v9M140 95v9M111 75h9M160 75h9" />
    <path className="ab" d="M140 75l15-15" />
    <circle className="f" cx="140" cy="14" r="5" /><circle className="a" cx="181" cy="31" r="5" /><circle className="f" cx="198" cy="75" r="5" /><circle className="f" cx="181" cy="119" r="5" />
    <circle className="a" cx="140" cy="136" r="5" /><circle className="f" cx="99" cy="119" r="5" /><circle className="f" cx="82" cy="75" r="5" /><circle className="f" cx="99" cy="31" r="5" />
  </svg>
);

/** Market: an order book on each side of an exchange arrow, with a price line underneath. */
export const MarketArt = () => (
  <svg {...V} aria-hidden>
    <rect className="f" x="54" y="26" width="46" height="9" rx="2" /><rect className="f" x="66" y="40" width="34" height="9" rx="2" /><rect className="f" x="74" y="54" width="26" height="9" rx="2" /><rect className="f" x="82" y="68" width="18" height="9" rx="2" />
    <rect className="f" x="180" y="26" width="18" height="9" rx="2" /><rect className="f" x="180" y="40" width="30" height="9" rx="2" /><rect className="a" x="180" y="54" width="40" height="9" rx="2" /><rect className="f" x="180" y="68" width="52" height="9" rx="2" />
    <path className="s" d="M116 46h48l-9-9M164 62h-48l9 9" />
    <path className="s" d="M40 126h200" />
    <path className="ab" d="M44 120l24-12 18 4 24-16 22 6 24-14 22 4 24-12 22 2" />
  </svg>
);

/** One drawing per lifecycle step of the How it works page. */
export function StepArt({ n }: { n: string }) {
  switch (n) {
    case "mint": return (
      <svg {...V} aria-hidden>
        <rect className="f soft" x="78" y="26" width="92" height="104" rx="6" />
        <rect className="f" x="88" y="14" width="92" height="104" rx="6" />
        <rect className="a" x="99" y="27" width="34" height="7" rx="2" />
        <path className="s" d="M99 50h68M99 61h54M99 72h62M99 83h40" />
        <circle className="f" cx="218" cy="48" r="20" />
        <path className="ab" d="M218 38v20M208 48h20" />
      </svg>);
    case "lock": return (
      <svg {...V} aria-hidden>
        <path className="s" d="M112 68V52a28 28 0 0 1 56 0v16" />
        <rect className="f" x="100" y="68" width="80" height="58" rx="9" />
        <circle className="a" cx="140" cy="92" r="6" />
        <path className="s" d="M140 98v12" />
        <circle className="f" cx="208" cy="38" r="12" /><circle className="f" cx="226" cy="74" r="12" /><circle className="f" cx="208" cy="110" r="12" />
        <path className="s dash" d="M182 80l16-34M184 96l16 8M184 74l28 0" />
      </svg>);
    case "trade": return (
      <svg {...V} aria-hidden>
        <rect className="f" x="36" y="44" width="74" height="62" rx="8" />
        <rect className="a" x="46" y="54" width="26" height="6" rx="2" />
        <path className="s" d="M46 74h54M46 86h40" />
        <rect className="f" x="170" y="44" width="74" height="62" rx="8" />
        <circle className="a" cx="207" cy="75" r="9" />
        <path className="s" d="M120 62h40l-9-9M160 88h-40l9 9" />
      </svg>);
    case "settle": return (
      <svg {...V} aria-hidden>
        <circle className="f" cx="140" cy="36" r="20" />
        <circle className="a" cx="140" cy="36" r="6" />
        <path className="s dash" d="M140 58v32" />
        <path className="s" d="M133 82l7 8 7-8" />
        <rect className="f" x="64" y="96" width="152" height="38" rx="10" />
        <path className="ab" d="M76 116c10-8 18-8 28 0s18 8 28 0 18-8 28 0 18 8 28 0" />
      </svg>);
    case "claim": return (
      <svg {...V} aria-hidden>
        <circle className="f" cx="104" cy="75" r="42" />
        <path className="s" d="M104 75V33M104 75l36 21M104 75L68 96" />
        <path className="a" d="M104 75V43a32 32 0 0 1 28 16z" />
        <path className="s dash" d="M152 60h30M152 76h38M152 92h30" />
        <circle className="f" cx="204" cy="60" r="11" /><circle className="a" cx="214" cy="76" r="11" /><circle className="f" cx="204" cy="92" r="11" />
      </svg>);
    default: return (
      <svg {...V} aria-hidden>
        <rect className="f soft" x="38" y="38" width="54" height="76" rx="5" />
        <path className="s" d="M48 54h34M48 65h26M48 76h32M48 87h20" />
        <path className="f" d="M150 18l40 14v34c0 22-17 38-40 48-23-10-40-26-40-48V32z" />
        <path className="ab thick" d="M130 68l14 14 26-30" />
        <path className="s dash" d="M96 74h10" />
        <circle className="f" cx="236" cy="62" r="16" /><circle className="a" cx="236" cy="62" r="4" />
        <path className="s dash" d="M194 68l26-4" />
      </svg>);
  }
}
