import { z } from 'zod';

const rexistroFlexible = z.record(z.string(), z.unknown()).or(z.object({}).loose());
const listaFlexible = z.array(rexistroFlexible);
const textoOpcional = z.string().optional();
const booleanoFlexibleOpcional = z.union([z.boolean(), z.string(), z.number()]).optional();

export const persoaSchema = z.object({
  id: textoOpcional,
  Id: textoOpcional,
  nome: textoOpcional,
  Nome: textoOpcional,
  apelidos: textoOpcional,
  Apelidos: textoOpcional,
  email: textoOpcional,
  Email: textoOpcional,
  voz: textoOpcional,
  Voz: textoOpcional,
  cargo: textoOpcional,
  Cargo: textoOpcional,
  tipoSocio: textoOpcional,
  'Tipo de socio': textoOpcional,
  dataIncorporacion: textoOpcional,
  DataIncorporacion: textoOpcional,
  activo: booleanoFlexibleOpcional
}).loose();

export const obraRepertorioSchema = z.object({
  id: textoOpcional,
  idRepertorio: textoOpcional,
  Id_Repertorio: textoOpcional,
  nome: textoOpcional,
  nomeObra: textoOpcional,
  obra: textoOpcional,
  titulo: textoOpcional,
  autor: textoOpcional,
  compositor: textoOpcional,
  partitura: z.unknown().optional(),
  partituras: z.array(z.unknown()).optional(),
  audios: z.array(z.unknown()).optional(),
  audiosR2: z.array(z.unknown()).optional()
}).loose();

const listaRepertorio = z.array(obraRepertorioSchema);

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
  obras: listaRepertorio.optional(),
  repertorio: listaRepertorio.optional(),
  datos: listaRepertorio.optional(),
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
  persoas: z.array(persoaSchema),
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
