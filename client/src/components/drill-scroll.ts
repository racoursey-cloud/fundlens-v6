/**
 * FundLens — The drill-in scroll anchor (H4)
 *
 * THE BUG THIS EXISTS TO KILL. Every holding list in the app except the
 * search results lives inside a fixed-height scrolling window — the Holdings
 * tab's 420px box, the exposure panel's 300px drill window, My Mix's 360px
 * across-the-mix list. A card opens as the next sibling of the clicked row,
 * which is correct, and then nothing moves the window: React inserts the node
 * and the scroll position stays exactly where it was. Click a row near the
 * bottom of the window and the card opens below the fold, leaving one pixel
 * of its top border showing — the thin gray line Robert saw, which reads as a
 * broken app rather than as a card two hundred pixels down.
 *
 * Search was never reported broken, and search is the one list with no
 * window. That is the control case that proves the mechanism.
 *
 * THE CURE, as prescribed: when a row expands, move ITS OWN scrolling window
 * so that row sits at the top — the whole rest of the window is then the
 * card's. Deliberately NOT scrollIntoView: that walks every scrollable
 * ancestor including the document, and on the Funds page a holding row sits
 * inside a fund detail inside a table cell inside the page, so asking the
 * browser to "show this" can move the entire screen. Here exactly one
 * element scrolls, by exactly the distance measured, or nothing scrolls at
 * all.
 *
 * WHAT IT DELIBERATELY DOESN'T DO: it never scrolls the page. If a list has
 * no scrolling window of its own — the search results — the walk finds
 * nothing and the hook is a no-op, which is why search behaves after this
 * change exactly as it behaved before it.
 *
 * Destination: client/src/components/drill-scroll.ts
 */

import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * The nearest ancestor that actually scrolls vertically, or null.
 *
 * BOTH conditions are required. A computed overflow-y of auto or scroll is
 * not enough on its own: CSS promotes overflow-y to auto whenever overflow-x
 * is auto, so the Funds grid's horizontal-scroll wrapper and My Mix's editor
 * table wrapper both LOOK vertically scrollable while having nothing to
 * scroll. Scrolling one of those would move a row for no reason. Requiring
 * real overflow — content taller than the box — keeps this to the windows
 * that genuinely clip.
 */
function scrollingAncestor(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    const overflowY = window.getComputedStyle(node).overflowY;
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Keep the expanded row at the top of its scrolling window.
 *
 * Usage, one call per LIST (not per row — a list renders its rows in a map,
 * where a hook cannot be called):
 *
 *   const anchorRow = useDrillScroll(expandedKey);
 *   ...
 *   <div ref={anchorRow(rowKey)} onClick={...}>
 *
 * Every row registers its element under its own key; when `expandedKey`
 * changes the hook looks up that one element and moves its window. Passing
 * null (nothing open) does nothing at all.
 *
 * useLayoutEffect, not useEffect: the card mounts in the same commit, so the
 * measurement and the scroll both happen before the browser paints. The
 * member never sees the unscrolled frame.
 */
export function useDrillScroll(expandedKey: string | null) {
  const rows = useRef(new Map<string, HTMLElement>());

  const anchorRow = useCallback(
    (key: string) => (el: HTMLElement | null) => {
      if (el) rows.current.set(key, el);
      else rows.current.delete(key);
    },
    [],
  );

  useLayoutEffect(() => {
    if (expandedKey === null) return;
    const row = rows.current.get(expandedKey);
    if (!row) return;
    const scroller = scrollingAncestor(row);
    if (!scroller) return; // an unconstrained list needs no help — search
    const delta = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    if (delta !== 0) scroller.scrollTop += delta;
  }, [expandedKey]);

  return anchorRow;
}
