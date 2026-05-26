import { useControls } from "leva";

/** Single source of truth for the stable/crisis node colors. Earlier
 *  revisions exposed three independent leva color pairs (one per
 *  consumer — Scene's bulge tint, Nodes' sphere body, ParticleField's
 *  wisp tint) with three different defaults; changing "the crisis
 *  color" required editing it in up to three places, and the three
 *  pairs visibly disagreed.
 *
 *  One Theme panel now drives all three. Defaults are the former
 *  sphere colors, which were the brightest of the three pairs and
 *  read clearest at zoom. */
export function useThemeColors(): { stableColor: string; crisisColor: string } {
  return useControls("Theme", {
    stableColor: { value: "#8CD0FF", label: "stable" },
    crisisColor: { value: "#FFB060", label: "crisis" },
  });
}
