export const THUMB_SIZES = [80, 200, 400] as const;
export type ThumbSize = (typeof THUMB_SIZES)[number];
