# Notch

Isla dinámica estilo iPhone para **Windows 11**: una píldora negra con dos ojos verdes que vive escondida en el borde superior de la pantalla. Aparece cuando llevas el ratón arriba al centro, o con **Ctrl + Alt + T**, y se despliega en un panel con fecha, hora, Pomodoro, tus links y más.

Hecha con **Electron + HTML/CSS/JS sin frameworks**. Código comentado en español.

## Estado

| Fase | Contenido | Estado |
| --- | --- | --- |
| 1 | El notch: ventana, animación, reloj, pestañas, clics que atraviesan | ✅ Hecha |
| 2 | Focus (Pomodoro) y links, tarjetas de Home, auto-ocultar y animaciones | ✅ Hecha |
| 3 | Música (sesión multimedia de Windows, helper en C#) | ⏳ Pendiente |
| 4 | Letras sincronizadas (LRCLIB) | ⏳ Pendiente |
| 5 | Claude Code en vivo (hooks → servidor local) | ⏳ Pendiente |

## Requisitos

- **Windows 11** (en Windows 10 también debería funcionar).
- **Node.js 22.12 o superior.** Electron 44 no arranca con versiones más antiguas. Descárgalo en <https://nodejs.org> (la versión LTS) y comprueba con `node --version`.
- **Git.**
- A partir de la Fase 3: **.NET 8 SDK** (para compilar el helper de música).

## Instalar

```bash
git clone https://github.com/Eidan210/DinamicIsland.git
cd DinamicIsland
npm install
```

> La **primera vez** que arranques, Electron descarga su ejecutable (unos 100 MB), así que tarda un poco más. Las siguientes veces arranca enseguida.

## Correr

```bash
npm start
```

Modo desarrollo: abre las DevTools en una ventana aparte, y el panel **no** se cierra al hacer clic fuera, para que puedas inspeccionar el CSS con calma:

```bash
npm run dev
```

Para cerrar Notch: **clic derecho sobre el notch → «Salir de Notch»**. Si lo arrancaste desde una terminal, también vale `Ctrl + C` en esa terminal.

## Cómo se usa

Al arrancar, el notch se asoma un par de segundos para avisarte de que está funcionando y luego se esconde por encima del borde de la pantalla, así no tapa las pestañas del navegador.

| Acción | Resultado |
| --- | --- |
| Dejar el ratón en el **borde superior, en el centro** | Aparece la píldora (si te alejas, se vuelve a esconder) |
| `Ctrl + Alt + T` | Abre o cierra el panel, desde cualquier app |
| Clic en la píldora | Abre el panel |
| `Esc` | Cierra el panel y devuelve el foco a la app que estabas usando |
| Clic fuera del panel | Cierra el panel |
| `←` `→` con el panel abierto | Cambian de pestaña |
| Clic derecho en el notch | Menú: abrir/cerrar, iniciar/pausar Pomodoro y **Salir de Notch** |
| `Alt + F4` con el panel abierto | Solo cierra el panel (no sale de la app) |

Los clics **fuera** de la píldora llegan a las ventanas de debajo, como si el notch no estuviera ahí.

### Pestañas

- **Home**: cuatro tarjetas resumen (Claude, Música, Focus y Links). Cada tarjeta te lleva a su pestaña. En la de Focus puedes iniciar o pausar el Pomodoro, y en la de Links abrir tus links directamente.
- **Focus**: el **Pomodoro** y todos tus **links**.
  - **Iniciar / Pausar / Seguir** y **↺ Reiniciar**.
  - `−` / `+` cambian la duración de 5 en 5 minutos (con el Pomodoro parado). La duración se guarda en `settings.json`.
  - El anillo se va llenando según avanza la sesión. Al terminar, recibes una **notificación de Windows**, los ojos se ponen felices y la píldora se asoma para avisarte.
  - Con un Pomodoro en marcha, cuando la píldora asoma muestra la cuenta atrás.
  - Si el portátil se suspende, el Pomodoro se pausa solo.
- **Música** y **Claude**: llegan en las fases 3, 4 y 5.

## Configuración

Todo está en la carpeta `config/`. **Al guardar un archivo, Notch lo aplica al momento**: no hace falta reiniciar. Si un archivo tiene un error de sintaxis, Notch usa los valores por defecto y lo avisa en la terminal.

### `config/settings.json`

```json
{
  "shortcut": "Control+Alt+T",
  "locale": "es-ES",
  "hour12": false,
  "autoHide": true,
  "revealOnHover": true,
  "pomodoroMinutes": 25
}
```

| Clave | Por defecto | Qué hace |
| --- | --- | --- |
| `shortcut` | `"Control+Alt+T"` | Atajo global para abrir y cerrar. Usa el [formato de atajos de Electron](https://www.electronjs.org/docs/latest/api/accelerator), por ejemplo `"Control+Shift+Space"` o `"Alt+N"`. |
| `locale` | `"es-ES"` | Idioma de la fecha: `"es-MX"`, `"es-CO"`, `"en-US"`… |
| `hour12` | `false` | `true` muestra el reloj en formato de 12 horas (a. m./p. m.). |
| `autoHide` | `true` | `true`: el notch se esconde cuando no lo usas. `false`: la píldora está siempre visible. |
| `revealOnHover` | `true` | Con `autoHide`: aparece al dejar el ratón en el borde superior, en el centro. Con `false`, solo aparece con el atajo. |
| `pomodoroMinutes` | `25` | Duración del Pomodoro, entre 1 y 180 minutos. También la cambian los botones `−` / `+`. |

### `config/links.json`

Una lista de links. Cada uno es un botón redondo con su inicial y su color:

```json
[
  { "name": "GitHub", "url": "https://github.com", "color": "#8b5cf6" },
  { "name": "Correo", "url": "mailto:yo@ejemplo.com" },
  { "name": "Mi web", "url": "https://ejemplo.com", "color": "#ffd43b", "initial": "🌐" }
]
```

| Campo | Obligatorio | Qué hace |
| --- | --- | --- |
| `name` | Sí | Nombre que se ve debajo del botón. Su primera letra es la inicial. |
| `url` | Sí | Dirección que se abre en tu navegador. Por seguridad, solo se aceptan `http://`, `https://` y `mailto:`. |
| `color` | No | Color del círculo en formato `#rrggbb` o `#rgb`. Si no lo pones, se elige uno automáticamente. El texto se pone blanco o negro según el color, para que siempre se lea. |
| `initial` | No | Lo que se ve dentro del círculo en lugar de la inicial: hasta 2 caracteres, emojis incluidos. |

En Focus caben 10 links sin scroll, y en la tarjeta de Home se ven los 6 primeros. Los links con errores se ignoran y el motivo aparece en la terminal.

## Compilar (crear el `.exe`)

```bash
npm run pack
```

Crea la carpeta `dist\win-unpacked\` con `Notch.exe`. Es rápido y sirve para probar la versión empaquetada.

```bash
npm run dist
```

Crea el instalador `dist\Notch Setup <versión>.exe`: se instala solo para tu usuario, sin pedir permisos de administrador, y crea un acceso directo en el menú Inicio.

En la versión empaquetada, la carpeta `config` está en `resources\config`, junto a `Notch.exe` (con el instalador: `%LOCALAPPDATA%\Programs\notch\resources\config`). Edita los archivos de esa carpeta.

## Estructura del proyecto

```text
main.js              Proceso principal: ventana, atajo, clics, foco, configuración,
                     Pomodoro (temporizador y notificación) y links
preload.js           Puente seguro (contextBridge) entre main y la página
renderer/
  index.html         Estructura del notch (píldora, panel, tarjetas y pestañas)
  styles.css         Aspecto y animaciones (aquí se cambian colores, tamaños y tiempos)
  app.js             Lógica de la interfaz: auto-ocultar, reloj, pestañas, ojos,
                     Pomodoro y links
config/
  settings.json      Tu configuración
  links.json         Tus links
assets/
  icon.png           Icono de la app (notificaciones e instalador)
helpers/MediaHelper/ (Fase 3) Helper en C# que lee la música de Windows
```

## Cómo funciona

- **Una ventana fija y transparente.** Mide 820 × 318 px, siempre lo mismo: lo que ocupa el panel abierto más un margen para la sombra. Esconderse, asomarse y abrirse son animaciones CSS dentro de esa ventana, porque mover o redimensionar ventanas transparentes en Windows produce parpadeos.
- **Siempre encima, pero discreta.** No tiene marco, está siempre por encima del resto, no aparece en la barra de tareas ni en `Alt + Tab` y se coloca centrada arriba del **monitor principal**. Si cambias de monitor, de resolución o de escala, se recoloca sola.
- **Clics que atraviesan.** La ventana ignora el ratón con `setIgnoreMouseEvents(true, { forward: true })`, así que los clics pasan a lo que hay debajo. Gracias a `forward`, la página sigue recibiendo los movimientos del ratón dentro de su zona. Así sabe cuándo tocas el borde superior, para asomarse, y cuándo entras en la píldora, para que `main.js` vuelva a aceptar clics.
- **Auto-ocultar.** Para aparecer, el ratón tiene que quedarse un instante (0,18 s) en una franja de 3 px en el borde superior, cerca del centro. Así, pasar el ratón por las pestañas no la despierta sin querer. Cuando te alejas, se esconde en 0,7 s.
- **Foco.** Al abrirse, el notch toma el foco para recibir `Esc` y para saber, con el evento `blur`, cuándo haces clic fuera. Al cerrarse con `Esc` o con el atajo, devuelve el foco a la app que estabas usando.
- **Pomodoro en `main.js`.** Chromium frena los temporizadores de las páginas que no se ven, así que el temporizador vive en el proceso principal. Es un único `setTimeout` que salta justo al terminar, y la página dibuja la cuenta atrás a partir de la hora de fin (`endsAt`).
- **Links seguros.** La página nunca recibe las URLs: para abrir un link, pide su número y `main.js` lo abre con `shell.openExternal`.
- **Seguridad.** La página no tiene acceso a Node (`contextIsolation`, `sandbox`, sin `nodeIntegration`). Solo puede usar las funciones que `preload.js` expone en `window.notch`, y su Content-Security-Policy le impide cargar nada externo.
- **Bajo consumo.** No hay ningún sondeo periódico (polling). El reloj solo funciona con el panel abierto, y la cuenta atrás del Pomodoro solo se dibuja cuando se ve. Las animaciones son cortas y se lanzan por eventos: parpadeos, miradas, la entrada en cascada… Ninguna se repite en bucle infinito.

## Privacidad

Sin telemetría ni analíticas. Hasta la Fase 2, Notch no hace **ninguna** conexión de red. La única conexión externa del proyecto llegará en la Fase 4: LRCLIB, para descargar letras.

## Solución de problemas

- **No veo el notch.** Está escondido: lleva el ratón al borde superior, en el centro, y déjalo quieto un instante. También puedes pulsar `Ctrl + Alt + T`. Si lo quieres siempre visible, pon `"autoHide": false`. Aparece en el monitor **principal**: lo eliges en *Configuración → Sistema → Pantalla* con «Convertir en la pantalla principal».
- **Aparece cuando no quiero.** Pon `"revealOnHover": false` y solo aparecerá con el atajo.
- **El atajo no hace nada.** Otra app ya usa esa combinación. Mira la terminal: aparece el aviso `[atajo] No se pudo registrar…`. Cambia `shortcut` en `config/settings.json` (se aplica al guardar).
- **No llega la notificación del Pomodoro.** Revisa que «No molestar» esté desactivado (*Configuración → Sistema → Notificaciones*). Windows también silencia las notificaciones mientras juegas a pantalla completa. Con `npm start`, la notificación aparece con un nombre técnico (`com.eidancuadros.notch`); en la versión instalada (`npm run dist`), aparece como «Notch» con su icono.
- **Un link no aparece.** Mira la terminal: dice qué link se ignoró y por qué (falta `name`, la `url` no es válida o no empieza por `http://`, `https://` o `mailto:`).
- **No sale encima de un juego.** Los juegos en pantalla completa exclusiva tapan todas las ventanas. En modo «ventana sin bordes», el notch sí se ve.
- **`npm run dist` falla con «Cannot create symbolic link».** Activa el modo de desarrollador de Windows (*Configuración → Sistema → Para programadores*) o ejecuta la terminal como administrador y vuelve a intentarlo.
- **`npm start` dice que la versión de Node no es compatible.** Actualiza Node.js a 22.12 o superior.
