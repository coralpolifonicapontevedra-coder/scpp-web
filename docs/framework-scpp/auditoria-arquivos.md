# Auditoría de arquivos SCPP

A auditoría global é de só lectura. Non sobe, move nin elimina ficheiros.

## Criterio para Documentación e Actas

A Sheet correspondente é o catálogo oficial. Cada rexistro con ficheiro e ID estable define unha clave R2 esperada.

O informe distingue:

- **Correcto**: o rexistro catalogado ten exactamente un ficheiro fonte en Drive e a súa clave esperada existe en R2.
- **Falta R2**: existe un rexistro oficial con ID e ficheiro, pero non existe a clave R2 esperada.
- **Extra Drive**: ficheiro presente na carpeta de Drive que non figura no catálogo. Trátase como copia ou respaldo e non como migración pendente automática.
- **Extra R2**: obxecto baixo o prefixo xestionado que non corresponde a unha clave esperada do catálogo. Require revisión manual e nunca se elimina automaticamente.
- **Falta Drive / ambiguo**: o catálogo apunta a un ficheiro que non aparece ou aparece máis dunha vez na carpeta fonte.

## Principio de seguridade

As diferenzas de cantidades entre Drive e R2 non se interpretan por si soas como erros. A identidade do rexistro e a clave R2 esperada son a referencia.
