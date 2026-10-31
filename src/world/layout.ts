import { z } from 'zod';

/** Schema for content/world/*.json. Validated at load time and in unit tests. */
const vec2 = z.tuple([z.number(), z.number()]);
const surface = z.enum(['grass', 'dry', 'dirt', 'road', 'track', 'rock', 'sand', 'mud', 'paving']);

export const LayoutSchema = z.object({
  id: z.string(),
  nameKey: z.string(),
  seed: z.number(),
  bounds: z.object({ minX: z.number(), maxX: z.number(), minZ: z.number(), maxZ: z.number() }),
  cellSize: z.number().positive(),
  terrain: z.object({
    noiseAmp: z.number(),
    noiseScale: z.number(),
    slopeX: z.number(),
    slopeZ: z.number(),
    base: z.number(),
  }),
  spawn: z.object({ x: z.number(), z: z.number(), heading: z.number() }),
  hills: z.array(z.object({ id: z.string(), x: z.number(), z: z.number(), radius: z.number(), height: z.number(), rocky: z.number() })),
  rivers: z.array(
    z.object({
      id: z.string(),
      points: z.array(vec2).min(2),
      width: z.number(),
      depth: z.number(),
      bank: z.number(),
      waterLevelOffset: z.number(),
    }),
  ),
  channels: z.array(z.object({ id: z.string(), points: z.array(vec2).min(2), width: z.number(), depth: z.number() })),
  paths: z.array(z.object({ id: z.string(), surface, width: z.number(), points: z.array(vec2).min(2) })),
  flats: z.array(
    z.object({
      id: z.string(),
      x: z.number(),
      z: z.number(),
      hw: z.number(),
      hd: z.number(),
      rot: z.number().optional(),
      margin: z.number(),
      surface,
      height: z.number().optional(),
    }),
  ),
  zones: z.array(
    z.object({
      id: z.string(),
      nameKey: z.string(),
      center: vec2,
      radius: z.number(),
      music: z.string(),
      ambience: z.string(),
      canopy: z.boolean().optional(),
    }),
  ),
  backdrop: z
    .object({
      acropolis: z.object({ x: z.number(), z: z.number(), radius: z.number(), height: z.number() }).optional(),
      lycabettus: z.object({ x: z.number(), z: z.number(), radius: z.number(), height: z.number() }).optional(),
      ranges: z.array(z.object({ id: z.string(), points: z.array(vec2), height: z.number(), width: z.number() })),
      sea: z.object({ x: z.number(), z: z.number(), radius: z.number() }).optional(),
    })
    .optional(),
});

export type Layout = z.infer<typeof LayoutSchema>;
export type Surface = z.infer<typeof surface>;

export function parseLayout(data: unknown): Layout {
  const result = LayoutSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Invalid world layout: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}
