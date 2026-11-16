# Mods de Diego para Claude Code

Seis mods en español para Claude Code. Cada uno se instala solo y se oculta con su propio comando, así que puedes quedarte con los que te sirvan.

Necesitas Claude Code 2.1.287 o posterior. Funcionan en la terminal, en la pestaña Code de Claude Desktop y en VS Code.

## Instalar

En una sesión de Claude Code, escribe la línea del mod que quieras:

```
/plugin install prompt-enhancer --marketplace diegomurilloy/claude-mods
/plugin install modelo-justo --marketplace diegomurilloy/claude-mods
/plugin install medidor-uso --marketplace diegomurilloy/claude-mods
/plugin install cafeina --marketplace diegomurilloy/claude-mods
/plugin install barra-contexto --marketplace diegomurilloy/claude-mods
/plugin install fondos --marketplace diegomurilloy/claude-mods
```

La primera vez te pregunta si agregas el marketplace: contesta `y`. Desde una terminal normal también sirve `claude plugin install <mod> --marketplace diegomurilloy/claude-mods`.

## Qué hace cada uno

| Mod | Qué hace | Comando |
|---|---|---|
| prompt-enhancer | Botones Enhance y Send arriba del prompt. Enhance convierte una idea corta en un prompt completo: tarea, contexto, skills, restricciones, preguntas antes de empezar, cómo verificar y resultado esperado. | `/enhance`, `/enhance-botones on` u `off` |
| modelo-justo | Clasifica cada petición. En modo modelo usa Haiku, Sonnet u Opus según lo que pidas; en modo esfuerzo se queda con tu modelo y cambia el esfuerzo (low, medium, high). | `/modelo-justo on`, `off`, `modo modelo`, `modo esfuerzo` |
| medidor-uso | El uso de tu plan (sesión de 5 horas y semana) en barritas arriba del prompt, con la cuenta regresiva al reinicio y un aviso al 90 %. | `/uso on` u `off` |
| cafeina | Mantiene la compu y la pantalla despiertas el tiempo que digas, aunque Claude ya haya terminado. macOS y Linux. | `/cafeina 3h`, `/cafeina 90m`, `/cafeina off` |
| barra-contexto | Tu ventana de contexto como barra de colores por categoría, con los tokens y dónde compacta. | `/barra-contexto on` u `off` |
| fondos | Fondos animados para Claude Desktop: acuarela, ascii con mariposas monarca hechas de caracteres y Laponia con aurora boreal. Cambia también los colores de la app. | `/fondo acuarela`, `/fondo ascii`, `/fondo laponia`, `/fondo ninguno` |

## Créditos

medidor-uso y barra-contexto son versiones en español de usage-meter y context-bar, y fondos usa la técnica de gotham-night, todos de [claude-code-mods](https://github.com/hamzafer/claude-code-mods) de Hamza Zafar (MIT). Lo demás es de Diego Murillo, también con licencia MIT.
