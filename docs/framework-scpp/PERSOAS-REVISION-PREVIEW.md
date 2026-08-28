# Revisión de datos persoais — Preview

## Estado

Fase de proba. Non existe envío automático de correo nin notificación externa.

## Fluxo

1. Un usuario con nivel Administración abre `/portal/administracion/persoas-revision/`.
2. Selecciona unha persoa activa.
3. O Worker verifica Firebase e os permisos reais contra `listarPersoasAdministracion`.
4. Xérase un token aleatorio de 256 bits, gardado en `R2_PRIVADO` baixo `persoas/revisions/` cunha caducidade de 7 días.
5. A ligazón abre `/revision-datos/?token=...` e só expón a ficha asociada ao token.
6. A persoa pode revisar identificación, contacto, domicilio, emerxencia e preferencias de privacidade.
7. Voz, tipo de socio, cargo, estado e data de incorporación móstranse só como contexto e non se envían como campos editables.
8. Ao confirmar, o Worker valida de novo o token e chama internamente a `actualizarPersoaAdministracion` co administrador que creou a ligazón e exclusivamente cos campos persoais permitidos.
9. O token queda marcado como `COMPLETADA` en R2 e non se pode reutilizar.

## Seguridade

- `WEB_WRITE_TOKEN` nunca sae do Worker.
- O token de revisión é dun único uso e caduca automaticamente.
- Non se xeran ligazóns para persoas en baixa.
- Non hai acción de envío de correo en Preview.
- A fase legal (`TextosLegais`, `Aceptación` e PDF de evidencia) queda fóra desta fase e integrarase despois de validar o formulario.
