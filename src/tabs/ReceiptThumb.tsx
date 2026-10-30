/**
 * Small drawn invoice for lists and cards: a folded sheet, ruled lines, the receipt number and a status stamp.
 * It only repeats what the row already says (id and status), so it is hidden from assistive tech.
 */
export function ReceiptThumb({ id, status }: { id: number; status: string }) {
  return (
    <svg className="rthumb" data-status={status} viewBox="0 0 40 50" width="34" height="42" aria-hidden="true" focusable="false">
      <path className="rthumb-sheet" d="M4 1.5h24l8.5 8.5v38H4z" />
      <path className="rthumb-fold" d="M28 1.5V10h8.5" />
      <path className="rthumb-lines" d="M9 15h14M9 20h19M9 25h11" />
      <path className="rthumb-total" d="M9 32h22" />
      <circle className="rthumb-stamp" cx="29" cy="41" r="4.6" />
      <text className="rthumb-id" x="7.5" y="44.5">#{id}</text>
    </svg>
  );
}

/**
 * The large drawing at the top of an invoice card: one sheet with its number, kind and face value,
 * and a stamp in the status colour. Every word in it comes from the receipt itself.
 */
export function ReceiptArt({ id, kind, face, status }: { id: number; kind: string; face: string; status: string }) {
  return (
    <svg className="rart" data-status={status} viewBox="0 0 320 150" role="img" aria-label={`Invoice ${id}, ${kind}, face value ${face}, ${status}`} preserveAspectRatio="xMidYMid meet">
      <path className="rart-rule" d="M0 140h320M0 22h320" />
      <g transform="translate(118 32) rotate(-3)">
        <path className="rart-sheet" d="M0 0h104l20 20v88H0z" />
        <path className="rart-fold" d="M104 0v20h20" />
        <text className="rart-k" x="12" y="22">{kind.toUpperCase()}</text>
        <text className="rart-id" x="12" y="40">#{id}</text>
        <path className="rart-lines" d="M12 54h62M12 63h84M12 72h48" />
        <path className="rart-total" d="M12 86h100" />
        <text className="rart-face" x="12" y="101">{face}</text>
      </g>
      <g className="rart-stamp" transform="translate(258 96) rotate(-12)">
        <circle r="30" />
        <circle r="25" className="rart-stamp-in" />
        <text y="4" textAnchor="middle">{status.toUpperCase()}</text>
      </g>
    </svg>
  );
}
