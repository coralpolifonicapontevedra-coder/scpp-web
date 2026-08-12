# Navegación privada do Portal do Coralista

## Obxectivo

A navegación privada debe manter unha única fonte de verdade para evitar diferenzas entre a portada do portal, o menú lateral e as páxinas internas.

## Fonte única de navegación

A definición oficial dos módulos está en:

`src/data/portal-navigation.ts`

Cada módulo debe definirse mediante unha clave interna estable (`id`) e, como mínimo, os campos de ruta, estado e orde. A etiqueta visible pode cambiar sen afectar á lóxica de navegación.

A portada do portal e o menú lateral deben consumir sempre esta definición compartida. Non se deben duplicar listas de módulos noutros ficheiros.

## Claves oficiais actuais

| id | Ruta oficial | Uso |
|---|---|---|
| `inicio` | `/portal/` | Inicio do portal |
| `subir` | `/portal/fotos/` | Subir fotografías |
| `revisar` | `/portal/revision-fotos/` | Revisar fotografías |
| `repertorio` | `/portal/repertorio/` | Repertorio |
| `concertos` | `/portal/concertos/` | Concertos |
| `ensaios` | `/portal/ensaios/` | Ensaios |
| `galeria` | `/portal/galeria/` | Galería privada |
| `documentacion` | `/portal/documentacion/` | Documentación |
| `perfil` | `/portal/perfil/` | O meu perfil |
| `administracion` | `/portal/administracion/persoas/` | Administración |

## Regras de mantemento

1. Unha páxina privada que use `PortalSidebar` debe indicar en `active` unha das claves oficiais anteriores.
2. A lóxica non debe depender do texto visible das etiquetas. Para identificación interna deben usarse os `id`.
3. Un novo módulo debe darse de alta primeiro en `src/data/portal-navigation.ts` e despois reutilizarse desde as superficies correspondentes (`sidebar` e/ou `home`).
4. Non se debe crear unha segunda lista manual de módulos na portada ou no Sidebar.
5. Os módulos con permisos especiais deben manter a comprobación de acceso correspondente; a presenza no mapa de navegación non substitúe a autorización.
6. Se se cambia unha ruta, debe declararse unha única ruta oficial e conservar unha redirección explícita desde a ruta anterior mentres sexa necesario.
7. As rutas de proba ou alternativas (`*-novo`, `*-prueba`, etc.) non deben converterse en rutas oficiais sen unha decisión expresa.
8. Calquera cambio de navegación debe manter o comportamento correcto en escritorio e móbil, incluído o peche con `Escape` do menú móbil.

## Ensaios

`Ensaios` é actualmente un módulo activo. Non debe tratarse como módulo pendente nin mostrarse como `Próximamente` mentres a súa ruta oficial siga habilitada no mapa de navegación.

## Comprobación automática

A coherencia básica está cuberta por:

`tests/portal-navigation-coherence.test.ts`

Este test comproba, entre outras cousas, que as claves internas son únicas, que as claves `active` usadas polas páxinas privadas existen e que Sidebar e portada consumen o mapa compartido.

## Pendentes controlados

Quedan fóra dunha modificación automática as rutas legacy ou de proba existentes. Antes de eliminar ou redirixir unha delas hai que comprobar que non se utilice en enlaces, probas ou fluxos internos.

Tamén debe facerse QA manual en escritorio e móbil despois de cambios estruturais de navegación.
