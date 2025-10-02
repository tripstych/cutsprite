// Types for the CutSprite application

export interface Anchor {
  x: number; // 0.0 to 1.0 (left to right)
  y: number; // 0.0 to 1.0 (top to bottom)
}

export interface Groups {
  name: string;
  color: string;
  default_anchor: Anchor;
  slices: Slices[];
}

export interface Slices {
  id: number;
  group: Groups | null;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  selected: boolean;
  anchor?: Anchor; // Individual slice anchor, inherits from group if not set
}

// Common anchor presets
export const ANCHOR_PRESETS = {
  TOP_LEFT: { x: 0, y: 0 },
  TOP_CENTER: { x: 0.5, y: 0 },
  TOP_RIGHT: { x: 1, y: 0 },
  CENTER_LEFT: { x: 0, y: 0.5 },
  CENTER: { x: 0.5, y: 0.5 },
  CENTER_RIGHT: { x: 1, y: 0.5 },
  BOTTOM_LEFT: { x: 0, y: 1 },
  BOTTOM_CENTER: { x: 0.5, y: 1 },
  BOTTOM_RIGHT: { x: 1, y: 1 }
} as const;

export type AnchorPresetKey = keyof typeof ANCHOR_PRESETS;