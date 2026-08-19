import { z } from 'zod';

const rexistroFlexible = z.record(z.string(), z.unknown()).or(z.object({}).loose());
const listaFlexible = z.array(rexistroFlexible);

export const ensaiosIndexSchema = z.object({
  ok: z.literal(true),
  version: z.literal(2),
  perfil: rexistroFlexible.optional(),
  ensaios: listaFlexible,
  persoas: listaFlexible,
  asistencias: listaFlexible.optional().default([]),
  ensaiosRepertorio: listaFlexible.optional().default([]),
  repertorio: listaFlexible.optional().default([]),
  concertos: listaFlexible.optional().default([]),
  seguimento: rexistroFlexible.optional(),
  xeradoEn: z.string().optional()
}).loose();

export const concertosPrivadosIndexSchema = z.object({
  ok: z.literal(true),
  concertos: listaFlexible,
  xeradoEn: z.string().optional(),
  version: z.union([z.string(), z.number()]).optional()
}).loose();

export const fotosRevisionIndexSchema = z.object({
  ok: z.literal(true),
  fotos: listaFlexible,
  xeradoEn: z.string().optional(),
  version: z.union([z.string(), z.number()]).optional()
}).loose();

export const repertorioIndexSchema = z.object({
  ok: z.literal(true).optional(),
  obras: listaFlexible.optional(),
  repertorio: listaFlexible.optional(),
  datos: listaFlexible.optional(),
  xeradoEn: z.string().optional(),
  version: z.union([z.string(), z.number()]).optional()
}).loose().superRefine((value, ctx) => {
  if (!Array.isArray(value.obras) && !Array.isArray(value.repertorio) && !Array.isArray(value.datos)) {
    ctx.addIssue({
      code: 'custom',
      message: 'O índice de repertorio debe conter obras, repertorio ou datos.'
    });
  }
});

export const persoasIndexSchema = z.object({
  ok: z.literal(true).optional(),
  persoas: listaFlexible,
  xeradoEn: z.string().optional(),
  version: z.union([z.string(), z.number()]).optional()
}).loose();

export function validarIndice(schema, value) {
  return schema.safeParse(value);
}

export function indiceValido(schema, value) {
  return validarIndice(schema, value).success;
}

export function resumirErroIndice(result) {
  if (result?.success !== false) return '';
  return result.error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join('.') || 'raíz'}: ${issue.message}`)
    .join('; ');
}
