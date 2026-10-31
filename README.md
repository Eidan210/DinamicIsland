# Notch

Isla dinámica estilo iPhone para **Windows 11**. En reposo es una mini-muesca negra con dos ojos verdes, pegada al borde superior de la pantalla. Cuando pasa algo (un Pomodoro, una canción), se convierte en una píldora con información en vivo, como la isla dinámica de Apple. Con **Ctrl + Alt + T** se despliega en un panel con fecha, hora, música, Pomodoro y tus links.

Hecha con **Electron + HTML/CSS/JS sin frameworks**, más un pequeño helper en **C#** para leer la música de Windows. Código comentado en español.

## Estado

| Fase | Contenido | Estado |
| --- | --- | --- |
| 1 | El notch: ventana, animación, reloj, pestañas, clics que atraviesan | ✅ Hecha |
| 2 | Focus (Pomodoro) y links, tarjetas de Home y animaciones | ✅ Hecha |
| 3 | Música (sesión multimedia de Windows, helper en C#), mini-muesca y actividades en vivo | ✅ Hecha |
| 4 | Letras sincronizadas (LRCLIB) | ⏳ Pendiente |
| 5 | Claude Code en vivo (hooks → servidor local) | ⏳ Pendiente |

## Requisitos

- **Windows 11** (en Windows 10 también debería funcionar).
- **Node.js 22.12 o superior.** Electron 44 no arranca con versiones más antiguas. Descárgalo en <https://nodejs.org> (la versión LTS) y comprueba con `node --version`.
- **.NET 8 SDK**, para compilar el helper de música. Descárgalo en <https://dotnet.microsoft.com/download/dotnet/8.0> y comprueba con `dotnet --list-sdks` (debe aparecer una versión 8.x).
- **Git.**

## Instalar

```bash
git clone https://github.com/Eidan210/DinamicIsland.git
cd DinamicIsland
npm install
npm run build:helper
```

`npm run build:helper` compila el helper de música y deja `MediaHelper.exe` en `helpers/MediaHelper/publish/`. Solo hay que repetirlo si cambias el código C#.

> La **primera vez** que arranques, Electron descarga su ejecutable (unos 100 MB), así que tarda un poco más. Las siguientes veces arranca enseguida.

## Correr

```bash
npm start
```

Modo desarrollo: abre las DevTools en una ventana aparte, y el panel **no** se cierra al hacer clic fuera, para que puedas inspeccionar el CSS con calma:

```bash
npm run dev
```

Para cerrar Notch: **clic derecho sobre la isla → «Salir de Notch»**. Si lo arrancaste desde una terminal, también vale `Ctrl + C` en esa terminal.

## Cómo se usa

La isla cambia de forma según lo que pasa:

| Forma | Cuándo |
| --- | --- |
| **Mini-muesca** | En reposo. Es pequeña, está pegada al borde de arriba y deja pasar los clics: no molesta a las pestañas del navegador. |
| **Píldora** | Al dejar el ratón un instante sobre la mini-muesca (y 2 segundos al arrancar). Si te alejas, vuelve a encogerse. |
| **Actividad en vivo** | Mientras hay un Pomodoro en marcha (anillo y cuenta atrás) o suena música (carátula y ecualizador). Si están las dos, manda el Pomodoro. |
| **Aviso** | Cuando empieza una canción nueva: «Ahora suena», con carátula, título y artista, durante 4 segundos. |
| **Panel** | Con `Ctrl + Alt + T` o al hacer clic en la isla. Si haces clic en una actividad, el panel se abre en su pestaña. |

| Acción | Resultado |
| --- | --- |
| `Ctrl + Alt + T` | Abre o cierra el panel, desde cualquier app |
| Clic en la isla | Abre el panel |
| `Esc` | Cierra el panel y devuelve el foco a la app que estabas usando |
| Clic fuera del panel | Cierra el panel |
| `←` `→` con el panel abierto | Cambian de pestaña |
| Clic derecho en la isla | Menú: abrir/cerrar, Pomodoro, pausar/reanudar música y **Salir de Notch** |
| `Alt + F4` con el panel abierto | Solo cierra el panel (no sale de la app) |

### Pestañas

- **Home**: cuatro tarjetas resumen (Claude, Música, Focus y Links). Cada tarjeta te lleva a su pestaña. Desde ellas puedes pausar la música o el Pomodoro, y abrir tus links.
- **Música**: lo que suena en **cualquier app** que se integre con Windows (Apple Music, Spotify, el navegador…).
  - Carátula, título, artista, app de origen, barra de progreso y controles (anterior, reproducir/pausar, siguiente).
  - Haz clic en la barra para saltar a ese punto, si la app lo permite.
  - Los colores (barra, ecualizador, brillo) se sacan de la carátula.
- **Focus**: el **Pomodoro** y todos tus **links**.
  - **Iniciar / Pausar / Seguir** y **↺ Reiniciar**.
  - `−` / `+` cambian la duración de 5 en 5 minutos (con el Pomodoro parado). La duración se guarda en `settings.json`.
  - Al terminar, recibes una **notificación de Windows** y la isla lo celebra con los ojos felices.
  - Si el portátil se suspende, el Pomodoro se pausa solo.
- **Claude**: llega en la fase 5.

## Configuración

Todo está en la carpeta `config/`. **Al guardar un archivo, Notch lo aplica al momento**: no hace falta reiniciar. Si un archivo tiene un error de sintaxis, Notch usa los valores por defecto y lo avisa en la terminal. Si falta una clave, también se usa su valor por defecto.

### `config/settings.json`

```json
{
  "shortcut": "Control+Alt+T",
  "locale": "es-ES",
  "hour12": false,
  "autoHide": true,
  "revealOnHover": true,
  "pomodoroMinutes": 25,
  "musicActivity": true
}
```

| Clave | Por defecto | Qué hace |
| --- | --- | --- |
| `shortcut` | `"Control+Alt+T"` | Atajo global para abrir y cerrar. Usa el [formato de atajos de Electron](https://www.electronjs.org/docs/latest/api/accelerator), por ejemplo `"Control+Shift+Space"` o `"Alt+N"`. |
| `locale` | `"es-ES"` | Idioma de la fecha: `"es-MX"`, `"es-CO"`, `"en-US"`… |
| `hour12` | `false` | `true` muestra el reloj en formato de 12 horas (a. m./p. m.). |
| `autoHide` | `true` | `true`: en reposo se encoge a la mini-muesca. `false`: la píldora siempre está a la vista. |
| `revealOnHover` | `true` | `true`: pasar el ratón por la mini-muesca la despierta. `false`: solo se abre con el atajo. |
| `pomodoroMinutes` | `25` | Duración del Pomodoro, entre 1 y 180 minutos. También la cambian los botones `−` / `+`. |
| `musicActivity` | `true` | `true`: mientras suena música, la isla la muestra y avisa al cambiar de canción. `false`: la música solo aparece en el panel. |

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

Compila el helper y crea la carpeta `dist\win-unpacked\` con `Notch.exe`. Es rápido y sirve para probar la versión empaquetada.

```bash
npm run dist
```

Compila el helper y crea el instalador `dist\Notch Setup <versión>.exe`: se instala solo para tu usuario, sin pedir permisos de administrador, y crea un acceso directo en el menú Inicio.

En la versión empaquetada, la carpeta `config` y el helper están en `resources\`, junto a `Notch.exe` (con el instalador: `%LOCALAPPDATA%\Programs\notch\resources\`). Edita los archivos de `resources\config`.

El helper usa el .NET 8 instalado en el PC. En tu equipo ya lo tienes (viene con el SDK). Si instalas Notch en otro PC, ese PC necesita el **.NET 8 Runtime** (<https://dotnet.microsoft.com/download/dotnet/8.0>).

## Estructura del proyecto

```text
main.js                  Proceso principal: ventana, atajo, clics, foco, configuración,
                         Pomodoro, links y el helper de música
preload.js               Puente seguro (contextBridge) entre main y la página
renderer/
  index.html             Estructura: isla, actividad, aviso, panel, tarjetas y pestañas
  styles.css             Aspecto y animaciones (aquí se cambian colores, tamaños y tiempos)
  app.js                 Lógica de la interfaz: formas de la isla, reloj, pestañas, ojos,
                         Pomodoro, música y links
helpers/MediaHelper/
  MediaHelper.csproj     Proyecto C# (.NET 8, Windows 10 2004 o superior)
  Program.cs             Lee la sesión multimedia de Windows y habla con Notch
config/
  settings.json          Tu configuración
  links.json             Tus links
assets/
  icon.png               Icono de la app (notificaciones e instalador)
```

## Cómo funciona

- **Una ventana fija y transparente.** Mide 820 × 318 px, siempre lo mismo: lo que ocupa el panel abierto más un margen para la sombra. Todas las formas de la isla son transiciones CSS dentro de esa ventana, porque mover o redimensionar ventanas transparentes en Windows produce parpadeos. Al crecer, la isla rebota un poco; al encogerse, no.
- **Siempre encima, pero discreta.** No tiene marco, está siempre por encima del resto, no aparece en la barra de tareas ni en `Alt + Tab` y se coloca centrada arriba del **monitor principal**. Si cambias de monitor, de resolución o de escala, se recoloca sola.
- **Clics que atraviesan.** La ventana ignora el ratón con `setIgnoreMouseEvents(true, { forward: true })`, así que los clics pasan a lo que hay debajo. Gracias a `forward`, la página sigue recibiendo los movimientos del ratón dentro de su zona. Así sabe cuándo dejas el ratón sobre la mini-muesca, para despertarla, y cuándo entras en la isla, para que `main.js` vuelva a aceptar clics. La mini-muesca nunca atrapa clics.
- **Foco.** Al abrirse, el notch toma el foco para recibir `Esc` y para saber, con el evento `blur`, cuándo haces clic fuera. Al cerrarse con `Esc` o con el atajo, devuelve el foco a la app que estabas usando.
- **Música con un helper en C#.** `MediaHelper.exe` usa `GlobalSystemMediaTransportControlsSessionManager` de Windows: la misma sesión que ves en el panel de volumen. Por eso funciona con cualquier app, sin conectarse a ninguna en concreto.
  - Electron lo lanza como proceso hijo. El helper escribe en su salida estándar (stdout) **una línea JSON por cada cambio**: título, artista, álbum, estado, posición, duración, app y carátula. Recibe órdenes por su entrada estándar (stdin): `play`, `pause`, `toggle`, `next`, `previous`, `seek` y `refresh`.
  - Funciona solo por avisos de Windows: no comprueba nada periódicamente.
  - La carátula se reduce a 300 px en JPEG y **solo viaja cuando cambia**.
  - Si el helper se cierra, Electron lo reinicia esperando cada vez más (2 s, 4 s… hasta 1 minuto). Al salir de Notch, el helper se cierra con él.
- **Posición interpolada.** Las apps solo actualizan la posición de vez en cuando. El helper la ajusta al momento exacto en que la mide (Windows indica cuándo fue su última actualización). Notch guarda esa posición y la hora de la medición, y mientras suena calcula la posición actual por su cuenta: posición + tiempo transcurrido.
- **Pomodoro en `main.js`.** Chromium frena los temporizadores de las páginas que no se ven, así que el temporizador vive en el proceso principal. Es un único `setTimeout` que salta justo al terminar.
- **Links seguros.** La página nunca recibe las URLs: para abrir un link, pide su número y `main.js` lo abre con `shell.openExternal`.
- **Seguridad.** La página no tiene acceso a Node (`contextIsolation`, `sandbox`, sin `nodeIntegration`). Solo puede usar las funciones que `preload.js` expone en `window.notch`, y su Content-Security-Policy le impide cargar nada externo. Las órdenes al helper pasan por una lista blanca.
- **Bajo consumo.** No hay sondeo periódico (polling) en ninguna parte.
  - El reloj y la barra de la música solo se actualizan con el panel abierto, una vez por segundo.
  - La cuenta atrás del Pomodoro solo se dibuja cuando se ve.
  - Las animaciones son cortas y se lanzan por eventos.
  - La **única animación continua** es el ecualizador, y solo corre mientras suena música y se ve en pantalla.

## Privacidad

Sin telemetría ni analíticas, y Notch no se conecta a **ningún** servidor. El corrector ortográfico que trae Electron descargaba diccionarios de Google al arrancar, aunque Notch no lo usa: ahora está desactivado y esa descarga se redirige a tu propio PC. La única conexión externa del proyecto llegará en la Fase 4: LRCLIB, para descargar letras.

## Solución de problemas

- **Al arrancar salen errores `Unable to move the cache: Acceso denegado`.** Ya tenías Notch abierto. La copia nueva no puede usar la caché de la que ya está funcionando, le pide que abra su panel y se cierra sola (en la terminal aparece `[notch] Notch ya estaba abierto…`). Es inofensivo.
- **La pestaña Música dice «Falta el helper de música».** Ejecuta `npm run build:helper` (necesitas el .NET 8 SDK) y reinicia Notch.
- **`npm run build:helper` dice que `dotnet` no se reconoce.** Instala el .NET 8 SDK y abre una terminal nueva.
- **La terminal dice «You must install or update .NET to run this application».** Falta el .NET 8 Runtime en ese PC: instálalo desde <https://dotnet.microsoft.com/download/dotnet/8.0>.
- **No aparece la música.** La app tiene que integrarse con los controles multimedia de Windows (si al subir el volumen ves la canción en el panel de Windows, Notch también la ve). Si suenan varias apps, Notch muestra la que Windows considera actual: la última que empezó a sonar.
- **La barra de progreso no avanza o no se puede saltar.** Algunas apps no le cuentan a Windows la posición o la duración, o no permiten saltar. En ese caso no hay barra o no se puede pulsar.
- **No veo el notch.** En reposo es una mini-muesca pegada al borde superior, en el centro del monitor **principal**. Lo eliges en *Configuración → Sistema → Pantalla* con «Convertir en la pantalla principal». Si la prefieres siempre en grande, pon `"autoHide": false`.
- **Se despierta cuando no quiero.** Pon `"revealOnHover": false` y solo se abrirá con el atajo. Si lo que te molesta es la música en la isla, pon `"musicActivity": false`.
- **El atajo no hace nada.** Otra app ya usa esa combinación. Mira la terminal: aparece el aviso `[atajo] No se pudo registrar…`. Cambia `shortcut` en `config/settings.json` (se aplica al guardar).
- **No llega la notificación del Pomodoro.** Revisa que «No molestar» esté desactivado (*Configuración → Sistema → Notificaciones*). Windows también silencia las notificaciones mientras juegas a pantalla completa. Con `npm start`, la notificación aparece con un nombre técnico (`com.eidancuadros.notch`); en la versión instalada, como «Notch».
- **Un link no aparece.** Mira la terminal: dice qué link se ignoró y por qué.
- **No sale encima de un juego.** Los juegos en pantalla completa exclusiva tapan todas las ventanas. En modo «ventana sin bordes», el notch sí se ve.
- **`npm run dist` falla con «Cannot create symbolic link».** Activa el modo de desarrollador de Windows (*Configuración → Sistema → Para programadores*) o ejecuta la terminal como administrador y vuelve a intentarlo.
- **`npm start` dice que la versión de Node no es compatible.** Actualiza Node.js a 22.12 o superior.
