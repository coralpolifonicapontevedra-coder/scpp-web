# Preview · ponte do texto legal de Persoas

Corrección illada para `DATOS_PERSOA_SCPP`.

- O listado normal de Persoas non cambia.
- Só cando `listarPersoasAdministracion` recibe `incluirTextoLegalPersoas=true`, o deployment de Apps Script Preview engade `textoLegalPersoas` á resposta.
- O texto léese da folla `TextosLegais` e debe estar activo e vixente.
- A revisión individual e masiva poden así encher a caché R2 xa existente.
- Producción non se toca.
