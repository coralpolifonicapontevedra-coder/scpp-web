# Gestor de Arquivos SCPP

## Finalidade

Servizo común para inventariar, migrar, verificar, sincronizar e auditar os ficheiros utilizados pola plataforma.

Non será un conxunto de scripts independentes por módulo. Haberá un motor común e configuracións específicas.

## Fonte de verdade

- **R2:** copia operativa servida pola web.
- **Sheets:** catálogo e metadatos.
- **Drive:** zona de entrada e respaldo cando o proceso do módulo o requira.

Unha modificación en Drive non se considera publicada ata que o xestor a verifique en R2 e actualice a Sheet.

## Modos

### `plan`

Non modifica nada. Informa das operacións previstas, referencias rotas, duplicados e conflitos.

### `upload`

Sube a R2 os ficheiros pendentes e non modifica os que xa coinciden.

### `verify`

Comproba existencia, tamaño, MIME, ETag e SHA-256 cando estea dispoñible.

### `sync`

Actualiza na Sheet os metadatos verificados de R2.

### `audit`

Xera unha visión completa: sincronizados, pendentes, erros, claves duplicadas, obxectos orfos e referencias sen ficheiro.

## Columnas estándar

Cada módulo terá un prefixo propio, pero conservará o mesmo esquema:

```text
<Prefixo>R2Key
<Prefixo>R2ETag
<Prefixo>R2SHA256
<Prefixo>R2Size
<Prefixo>R2MimeType
<Prefixo>R2Estado
<Prefixo>R2Actualizada
<Prefixo>R2Erro
```

Estados previstos:

- `PENDENTE`
- `SINCRONIZADO`
- `ERRO`
- `NON_LOCALIZADO`
- `CONFLITO`
- `INACTIVO`

## Claves R2

As claves deben ser deterministas e basearse no ID estable, non no número de fila.

Exemplos:

```text
persoas/fichas/37-joaquin-cuinas-rodriguez.pdf
documentacion/documentos/DOC-123-estatutos.pdf
documentacion/actas/ACTA-2026-03-26-xunta-directiva.pdf
repertorio/partituras/OBRA-123-tenor.pdf
repertorio/audios/OBRA-123/tenor/ensaio.mp3
fotos/orixinais/FOTO-123.jpg
```

## Regras de seguridade

1. `plan` será o modo por defecto.
2. Ningunha operación destrutiva se executará por inferencia.
3. Non se sobrescribirá un obxecto con SHA diferente sen rexistrar conflito.
4. As claves privadas só se servirán tras validar permisos.
5. Os informes non deben expoñer secretos nin tokens.
6. As operacións deben ser idempotentes: repetir unha execución correcta non debe duplicar nin corromper datos.

## Integración de fotografías

O módulo existente de subida de fotografías formarase como unha interface especializada do mesmo sistema:

```text
Subida de fotografía
  → R2
  → rexistro de metadatos
  → estado pendente de revisión
  → revisión administrativa
  → publicación pública ou privada
```

A interface pode ser distinta, pero o catálogo, os estados, a verificación e a auditoría deben usar o mesmo núcleo.

## Primeiros casos de uso

1. Persoas: xa migrado; servirá como referencia.
2. Documentación.
3. Actas.
4. Fotografías.
5. Partituras.
6. Audios.
7. Cartaces e programas de man.
