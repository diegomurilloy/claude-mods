# explica-guia

Arma una guía muy visual de lo que Claude hizo, para que una persona no técnica entienda qué se hizo y por qué: título, resumen en 3 líneas, pasos con los archivos y comandos importantes, decisiones con su porqué, cómo comprobarlo y qué sigue. Sale como HTML y, si tu compu tiene Chrome o Chromium, también como PDF listo para imprimir.

## Instalación

```
/plugin install explica-guia --marketplace diegomurilloy/claude-mods
```

## Uso

| Comando | Qué hace |
|---|---|
| `/explica` | Guía de la última tarea |
| `/explica sesion` | Guía de toda la sesión |
| `/explica abrir` | Además abre el resultado al terminar (se combina: `/explica sesion abrir`) |
| `/explica ocultar` / `mostrar` | Esconde o muestra el botón de arriba del prompt |

También hay un botón arriba del prompt (aparece después de tu primera petición). Al terminar sale un aviso con la ruta del archivo.

## Dónde queda

En la carpeta del proyecto: `explicaciones/explica-<fecha-hora>.html` (y `.pdf` al lado). Después de generar el HTML, el mod busca Google Chrome o Chromium en las rutas comunes de macOS, Linux y Windows y lo convierte con `--headless --print-to-pdf`. Si no hay ninguno, deja solo el HTML: ábrelo y usa Imprimir, Guardar como PDF.

## Cómo funciona

- Mientras trabajas anota en la sesión los archivos que Claude escribe o edita y los comandos que corre (los comandos se recortan y se les quitan tokens y contraseñas evidentes).
- Para redactar, le pide a la propia sesión de Claude que lea la conversación. No hay llamadas a internet de parte del mod, y solo abre el archivo si pones `abrir`.
- Si Claude no contesta en el formato esperado, deja una guía básica con solo el registro y lo avisa en la guía.
- El registro empieza cuando carga el mod y se borra con `/clear`; en una sesión retomada, la explicación sale de la conversación.

Autor: Diego Murillo · Licencia MIT
