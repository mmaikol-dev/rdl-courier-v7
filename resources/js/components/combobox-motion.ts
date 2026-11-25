export const EASE = "cubic-bezier(0.16,1,0.3,1)";

type Seen = { x: number; y: number; w: number; el: HTMLElement };
export type Snapshot = Map<string, Seen>;

/** Layout offsets (transforms ignored) of every element carrying the attribute, by its value. */
export function snapshot(root: HTMLElement | null, attr: string): Snapshot {
  const out: Snapshot = new Map();
  root?.querySelectorAll<HTMLElement>(`[${attr}]`).forEach((el) => out.set(el.getAttribute(attr)!, { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, el }));
  return out;
}

/**
 * After a render: glide what moved, raise what's new, and fade what left in `ghosts` (a layer React never renders into).
 * `enter` decides what new elements do; pass null to let them simply appear.
 */
export function play(
  root: HTMLElement | null,
  attr: string,
  before: Snapshot,
  ghosts: HTMLElement | null,
  { enter = "rise", duration = 300 }: { enter?: "rise" | "pop" | null; duration?: number } = {},
) {
  if (!root) return;
  const present = new Set<string>();
  let order = 0;
  root.querySelectorAll<HTMLElement>(`[${attr}]`).forEach((el) => {
    const key = el.getAttribute(attr)!;
    present.add(key);
    const was = before.get(key);
    if (was) {
      const dx = was.x - el.offsetLeft;
      const dy = was.y - el.offsetTop;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5)
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0px, 0px)" }], { duration, easing: EASE, composite: "add" });
    } else if (enter === "rise") {
      el.animate(
        [
          { opacity: 0, transform: "translateY(4px)", filter: "blur(3px)" },
          { opacity: 1, transform: "none", filter: "blur(0px)" },
        ],
        { duration: 280, delay: Math.min(order++ * 14, 140), easing: EASE, fill: "backwards" },
      );
    } else if (enter === "pop") {
      el.animate(
        [
          { opacity: 0, transform: "scale(0.9)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 260, easing: EASE, fill: "backwards" },
      );
    }
  });
  if (!ghosts) return;
  before.forEach((was, key) => {
    if (present.has(key) || was.el.isConnected) return;
    const el = was.el;
    el.removeAttribute("id");
    el.removeAttribute(attr);
    el.setAttribute("aria-hidden", "true");
    el.style.position = "absolute";
    el.style.margin = "0";
    el.style.left = `${was.x}px`;
    el.style.top = `${was.y}px`;
    el.style.width = `${was.w}px`;
    el.style.pointerEvents = "none";
    ghosts.appendChild(el);
    el.animate(
      [
        { opacity: 1, transform: "none", filter: "blur(0px)" },
        { opacity: 0, transform: "scale(0.94)", filter: "blur(2px)" },
      ],
      { duration: 180, easing: EASE, fill: "forwards" },
    ).onfinish = () => el.remove();
  });
}

/** The box of an element's letters (not its padding), so a copy can land letter on letter. */
export function textRect(el: HTMLElement): DOMRect {
  const range = document.createRange();
  range.selectNodeContents(el);
  const r = range.getBoundingClientRect();
  return r.width ? r : el.getBoundingClientRect();
}

/**
 * Carries a copy of `from` (a row's label) onto `to` (the chip's label), which stays hidden until it lands.
 * The copy lives on the page's body with the label's own type and colour, so nothing clips it on the way.
 */
export function fly(from: { rect: DOMRect; style: Partial<CSSStyleDeclaration>; text: string }, to: HTMLElement, duration = 460) {
  const target = textRect(to);
  if (!target.width) return;
  const copy = document.createElement("span");
  copy.textContent = from.text;
  copy.setAttribute("aria-hidden", "true");
  Object.assign(copy.style, from.style, {
    position: "fixed",
    left: `${from.rect.left}px`,
    top: `${from.rect.top}px`,
    margin: "0",
    // The copy's box is exactly its letters' box, so it starts and lands letter on letter.
    lineHeight: `${from.rect.height}px`,
    whiteSpace: "nowrap",
    pointerEvents: "none",
    zIndex: "70",
    transformOrigin: "0 0",
  });
  document.body.appendChild(copy);
  to.style.opacity = "0";
  const flight = copy.animate(
    [
      { transform: "none", opacity: 1 },
      { transform: `translate(${target.left - from.rect.left}px, ${target.top - from.rect.top}px)`, opacity: 1 },
    ],
    { duration, easing: EASE, fill: "forwards" },
  );
  const land = () => {
    to.style.opacity = "";
    copy.remove();
  };
  flight.onfinish = land;
  flight.oncancel = land;
}
