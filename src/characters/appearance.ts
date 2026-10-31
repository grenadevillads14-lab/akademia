import { z } from 'zod';

/**
 * Character appearance, loaded from content/characters/*.json (and the player's customisation).
 * Clothing follows docs/RESEARCH.md §9: chiton (knee-length for active men, ankle-length for older or formal),
 * himation over one shoulder, exomis for labour, chlamys + petasos for travellers. Colours were bright.
 */
export const AppearanceSchema = z.object({
  height: z.number().min(1.3).max(2.0).default(1.72),
  build: z.number().min(0).max(1).default(0.5), // slim .. broad
  sex: z.enum(['m', 'f']).default('m'),
  age: z.enum(['youth', 'adult', 'old']).default('adult'),
  skin: z.string().default('#c99872'),
  hair: z.object({ style: z.enum(['cropped', 'short', 'curly', 'long', 'bun', 'bald', 'wild']), color: z.string() }).default({ style: 'short', color: '#2b1d14' }),
  beard: z.object({ style: z.enum(['none', 'stubble', 'trimmed', 'full', 'long', 'ragged']), color: z.string() }).default({ style: 'none', color: '#2b1d14' }),
  chiton: z.object({ color: z.string(), length: z.enum(['short', 'knee', 'ankle']), border: z.string().optional() }).default({ color: '#e8dfca', length: 'knee' }),
  himation: z.object({ color: z.string(), border: z.string().optional() }).nullable().default(null),
  exomis: z.boolean().default(false),
  loincloth: z.boolean().default(false),
  chlamys: z.string().nullable().default(null),
  petasos: z.boolean().default(false),
  rings: z.boolean().default(false),
  /** Props held: attached to the hands at runtime. */
  props: z.array(z.enum(['scroll', 'staff', 'lamp', 'stick', 'tablet', 'torch', 'strigil', 'lyre', 'basket', 'amphora'])).default([]),
});

export type Appearance = z.infer<typeof AppearanceSchema>;
export type AppearanceInput = z.input<typeof AppearanceSchema>;

export function parseAppearance(data: unknown): Appearance {
  return AppearanceSchema.parse(data);
}
