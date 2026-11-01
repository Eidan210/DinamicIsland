# Notch

Isla dinámica estilo iPhone para **Windows 11**. En reposo es una mini-muesca negra con dos ojos verdes, pegada al borde superior de la pantalla. Cuando pasa algo (un Pomodoro, una canción, cambias el volumen, se acaba la batería), se convierte en una píldora con información en vivo, como la isla dinámica de Apple; si pasan dos cosas a la vez, la segunda sale en una burbuja a su lado. Con **Ctrl + Alt + T** se despliega en un panel con 6 páginas (Home, Música, IA, Focus, Portapapeles y Nota), y con **Ctrl + Alt + 1…6** vas directo a cada una. En la página Música ves la **letra sincronizada**, los colores de la carátula y puedes cambiar la **salida de audio**; para pasar de canción basta con **deslizar** a los lados.

Hecha con **Electron + HTML/CSS/JS sin frameworks**, más un pequeño helper en **C#** (WinHelper) que habla con Windows: la música, el volumen y las salidas de audio. Código comentado en español.

## Estado

**Versión 1** (hecha):

| Fase | Contenido | Estado |
| --- | --- | --- |
| 1 | El notch: ventana, animación, reloj, pestañas, clics que atraviesan | ✅ Hecha |
| 2 | Focus (Pomodoro) y links, tarjetas de Home y animaciones | ✅ Hecha |
| 3 | Música (sesión multimedia de Windows, helper en C#), mini-muesca y actividades en vivo | ✅ Hecha |

**Versión 2** (en marcha):

| Fase | Contenido | Estado |
| --- | --- | --- |
| 0 | Cimientos: código repartido en módulos y helper renombrado a WinHelper | ✅ Hecha |
| 1 | Base: 6 páginas, atajos Ctrl+Alt+1…6, varias actividades, tema, volumen, batería, avisos y nota rápida | ✅ Hecha |
| 2 | Música completa: letras (LRCLIB), degradado de la portada, swipe y salida de audio | ✅ Hecha |
| 3 | IA: Claude Code y Antigravity en vivo (permisos, preguntas y planes desde la isla) y chat con Claude/Gemini | ⏳ Pendiente |
| 4 | Glow: colores que avisan de lo que pasa | ⏳ Pendiente |
| 5 | Clawd, la mascota, en la isla | ⏳ Pendiente |
| 6 | Home con widgets editables | ⏳ Pendiente |
| 7 | Portapapeles y bandeja de archivos | ⏳ Pendiente |
| 8 | «Casa de Clawd»: ventana de ajustes e historial | ⏳ Pendiente |

## Requisitos

- **Windows 11** (en Windows 10 también debería funcionar).
- **Node.js 22.12 o superior.** Electron 44 no arranca con versiones más antiguas. Descárgalo en <https://nodejs.org> (la versión LTS) y comprueba con `node --version`.
- **.NET 8 SDK**, para compilar el helper de Windows (WinHelper). Descárgalo en <https://dotnet.microsoft.com/download/dotnet/8.0> y comprueba con `dotnet --list-sdks` (debe aparecer una versión 8.x).
- **Git.**

## Instalar

```bash
git clone https://github.com/Eidan210/DinamicIsland.git
cd DinamicIsland
npm install
npm run build:helper
```

`npm run build:helper` compila el helper de Windows y deja `WinHelper.exe` en `helpers/WinHelper/publish/`. Hay que repetirlo cada vez que cambia el código C# (por ejemplo, al actualizar a una fase que añade algo al helper, como el volumen de la Fase 1).

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
| **Mini-muesca** | En reposo. Es pequeña, está pegada al borde de arriba y deja pasar los clics: no molesta a las pestañas del navegador. Un **punto azul** a la izquierda indica que hay avisos sin ver, y a la derecha aparece la **pila** cuando queda poca batería. |
| **Píldora** | Al dejar el ratón un instante sobre la mini-muesca (y 2 segundos al arrancar). Si te alejas, vuelve a encogerse. |
| **Actividad en vivo** | Mientras hay un Pomodoro en marcha (anillo y cuenta atrás) o suena música (carátula y ecualizador, con la isla teñida de los colores de la carátula). Puede haber hasta 3 a la vez: la más importante en la isla y las demás en **burbujas** a su derecha, como en el iPhone. Hoy manda el Pomodoro; con él en marcha, la música pasa a una burbuja con su carátula. |
| **Volumen** | Al cambiar el volumen de Windows: una barra con el nivel durante 1,5 segundos (con el panel abierto, sale en lugar de la fecha). |
| **Aviso** | Cuando empieza una canción nueva: «Ahora suena», con carátula, título y artista, durante 4 segundos. |
| **Aviso importante** | Batería baja (20 % y 10 %), un error en `settings.json`, un atajo que no funciona, el helper que falta… Si lo pulsas, se abre el panel con la lista de avisos. |
| **Panel** | Con `Ctrl + Alt + T`, con `Ctrl + Alt + 1…6` o al hacer clic en la isla. Si haces clic en una actividad o en una burbuja, el panel se abre en su página. |

| Acción | Resultado |
| --- | --- |
| `Ctrl + Alt + T` | Abre o cierra el panel, desde cualquier app |
| `Ctrl + Alt + 1` … `6` | Abre el panel directamente en Home, Música, IA, Focus, Portapapeles o Nota. Si esa página ya se ve, cierra el panel. |
| Clic en la isla | Abre el panel |
| `Esc` | Cierra el panel (o antes, la lista de avisos) y devuelve el foco a la app que estabas usando |
| Clic fuera del panel | Cierra el panel |
| `←` `→` con el panel abierto | Cambian de página (no mientras escribes en la nota) |
| Deslizar sobre la música | Con dos dedos en el touchpad, o arrastrando con el ratón y soltando, sobre la isla (con la música), su burbuja o la carátula de la página Música: hacia la izquierda, **siguiente canción**; hacia la derecha, **anterior** |
| Clic derecho en la isla | Menú: abrir/cerrar, Pomodoro, pausar/reanudar música, **Música en la isla** (sí/no) y **Salir de Notch** |
| Clic derecho en la nota | Cortar, copiar, pegar… |
| `Alt + F4` con el panel abierto | Solo cierra el panel (no sale de la app) |

Con el teclado latinoamericano (Colombia), `AltGr` equivale a `Ctrl + Alt`, pero `AltGr` + número no escribe ningún símbolo, así que estos atajos no te quitan nada. Si alguno choca con otra app, cámbialo en `settings.json` (ver `pageShortcuts`).

En la barra de arriba del panel están la **campana** (con el número de avisos sin ver: púlsala para ver la lista), la **batería** (si no está llena y enchufada) y la hora.

### Páginas

- **Home**: cuatro tarjetas resumen (IA, Música, Focus y Links). Cada tarjeta te lleva a su página. Desde ellas puedes pausar la música o el Pomodoro, y abrir tus links.
- **Música**: lo que suena en **cualquier app** que se integre con Windows (Apple Music, Spotify, el navegador…).
  - Carátula, título, artista, app de origen, barra de progreso y controles (anterior, reproducir/pausar, siguiente).
  - Haz clic en la barra para saltar a ese punto, si la app lo permite.
  - **Letra** a la derecha, de [LRCLIB](https://lrclib.net): la línea que suena va en el centro, resaltada, y la letra avanza sola. Pulsa una línea para saltar a ese momento. Si la letra no tiene tiempos, se ve entera; si no la hay, pone «Sin letra disponible».
  - Los **colores** de la carátula tiñen el fondo de la página (un degradado con sus 3 colores principales), la tarjeta de Home, la isla, la barra y el ecualizador.
  - El botón de la **píldora** decide si la música se muestra en la isla (se guarda en `musicActivity`).
  - El botón del **altavoz** abre la lista de **salidas de audio** (altavoces, auriculares, la tele…): la que eliges pasa a ser la predeterminada de Windows.
- **Focus**: el **Pomodoro** y todos tus **links**.
  - **Iniciar / Pausar / Seguir** y **↺ Reiniciar**.
  - `−` / `+` cambian la duración de 5 en 5 minutos (con el Pomodoro parado). La duración se guarda en `settings.json`.
  - Al terminar, recibes una **notificación de Windows**, la isla lo celebra con los ojos felices y queda en el centro de avisos.
  - Si el portátil se suspende, el Pomodoro se pausa solo.
- **IA**: Claude Code y Antigravity en vivo y el chat con Claude o Gemini. Llega en la Fase 3.
- **Portapapeles**: el historial de lo que copias y la bandeja de archivos. Llega en la Fase 7.
- **Nota**: una nota rápida. Con `Ctrl + Alt + 6` se abre con el cursor listo para escribir.
  - Se guarda sola medio segundo después de que dejes de escribir (y al cerrar el panel o cambiar de página). Abajo ves «Guardado» y cuántas palabras llevas.
  - Vive en `%APPDATA%\Notch\nota.md`, un archivo de texto normal (Markdown) que puedes abrir con cualquier editor.

## Configuración

Todo está en la carpeta `config/`. **Al guardar un archivo, Notch lo aplica al momento**: no hace falta reiniciar. Si un archivo tiene un error de sintaxis, Notch usa los valores por defecto y te lo dice con un aviso en la isla (y en la terminal). En cuanto lo arreglas, el aviso desaparece. Si falta una clave, también se usa su valor por defecto.

### `config/settings.json`

```json
{
  "shortcut": "Control+Alt+T",
  "pageShortcuts": {
    "home": "Control+Alt+1",
    "music": "Control+Alt+2",
    "ai": "Control+Alt+3",
    "focus": "Control+Alt+4",
    "clipboard": "Control+Alt+5",
    "note": "Control+Alt+6"
  },
  "theme": "auto",
  "locale": "es-ES",
  "hour12": false,
  "autoHide": true,
  "revealOnHover": true,
  "pomodoroMinutes": 25,
  "musicActivity": true,
  "lyrics": true,
  "volumeIndicator": true
}
```

No hace falta copiar todo: basta con las claves que quieras cambiar.

| Clave | Por defecto | Qué hace |
| --- | --- | --- |
| `shortcut` | `"Control+Alt+T"` | Atajo global para abrir y cerrar. Usa el [formato de atajos de Electron](https://www.electronjs.org/docs/latest/api/accelerator), por ejemplo `"Control+Shift+Space"` o `"Alt+N"`. |
| `pageShortcuts` | `Ctrl+Alt+1…6` | Un atajo por página (`home`, `music`, `ai`, `focus`, `clipboard`, `note`). Solo pon las que quieras cambiar, p. ej. `{ "note": "Control+Alt+N" }`; `""` deja esa página sin atajo. |
| `theme` | `"auto"` | Tema del panel abierto: `"auto"` (como el modo de las apps de Windows), `"light"` (claro) o `"dark"` (oscuro). La isla compacta siempre es negra. |
| `locale` | `"es-ES"` | Idioma de la fecha: `"es-MX"`, `"es-CO"`, `"en-US"`… |
| `hour12` | `false` | `true` muestra el reloj en formato de 12 horas (a. m./p. m.). |
| `autoHide` | `true` | `true`: en reposo se encoge a la mini-muesca. `false`: la píldora siempre está a la vista. |
| `revealOnHover` | `true` | `true`: pasar el ratón por la mini-muesca la despierta. `false`: solo se abre con el atajo. |
| `pomodoroMinutes` | `25` | Duración del Pomodoro, entre 1 y 180 minutos. También la cambian los botones `−` / `+`. |
| `musicActivity` | `true` | `true`: mientras suena música, la isla la muestra y avisa al cambiar de canción. `false`: la música solo aparece en el panel. También lo cambia el botón de la píldora de la página Música. |
| `lyrics` | `true` | `true`: busca las letras en LRCLIB (la única conexión a internet de Notch). `false`: sin letras y sin ninguna conexión. |
| `volumeIndicator` | `true` | `true`: al cambiar el volumen, la isla enseña una barra 1,5 s. `false`: solo se ve el indicador de Windows. |

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
main.js                  Punto de entrada: arranca la app y conecta los módulos de main/
main/                    Proceso principal (Node.js), un archivo por tema:
  state.js               estado compartido (la ventana, la configuración...)
  bridge.js              hablar con la página (IPC)
  notices.js             los avisos de Notch (centro de avisos)
  config.js              config/settings.json y su recarga automática
  theme.js               tema claro u oscuro del panel
  window.js              la ventana: posición, abrir/cerrar, foco, clics, menús
  shortcuts.js           atajos de teclado globales (abrir/cerrar y uno por página)
  pomodoro.js            el temporizador Pomodoro y su notificación
  links.js               config/links.json
  helper.js              lanza WinHelper.exe y reparte sus mensajes
  music.js               la música que suena en Windows
  lrc.js                 leer letras sincronizadas (formato LRC) y elegir la mejor
  lyrics.js              las letras: LRCLIB y su caché
  audio.js               las salidas de audio
  volume.js              el volumen de Windows
  note.js                la nota rápida (nota.md)
  ipc.js                 TODO lo que la página puede pedir (una lista)
preload.js               Puente seguro (contextBridge) entre main y la página
renderer/
  index.html             Estructura: isla, actividad, volumen, avisos, burbujas, panel y páginas
  styles.css             Aspecto y animaciones (aquí se cambian colores, tamaños y tiempos)
  modules/               La lógica de la interfaz, en módulos ES:
    main.js              arranque: pone en marcha los demás módulos
    state.js             estado compartido de la interfaz
    island.js            formas de la isla, actividades y burbujas, clics que atraviesan
    panel.js             abrir y cerrar el panel
    tabs.js              las 6 páginas
    volume.js            la barra de volumen
    notices.js           el centro de avisos (y los avisos en la isla)
    battery.js           la batería
    note.js              la nota rápida
    theme.js             tema claro u oscuro
    lyrics.js            la letra sincronizada
    colors.js            los colores de la carátula (k-means)
    swipe.js             deslizar para cambiar de canción
    outputs.js           la lista de salidas de audio
    clock.js, eyes.js, pomodoro.js, music.js, links.js, utils.js
helpers/WinHelper/
  WinHelper.csproj       Proyecto C# (.NET 8, Windows 10 2004 o superior)
  Program.cs             Arranca los módulos y habla con Notch (stdin/stdout)
  MediaModule.cs         La música (sesión multimedia de Windows)
  VolumeModule.cs        El volumen (Core Audio)
  AudioDevicesModule.cs  Las salidas de audio y cambiar la predeterminada
  CoreAudio.cs           Las declaraciones de Core Audio (y de IPolicyConfig)
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
- **Música con un helper en C#.** `WinHelper.exe` usa `GlobalSystemMediaTransportControlsSessionManager` de Windows: la misma sesión que ves en el panel de volumen. Por eso funciona con cualquier app, sin conectarse a ninguna en concreto.
  - Electron lo lanza como proceso hijo. El helper escribe en su salida estándar (stdout) **una línea JSON por cada cambio**, con un campo `type` que dice de qué trata (`media`, `volume`, `audio-devices` o `audio-output-result`), y `main/helper.js` la reparte al módulo que corresponde. Para la música trae título, artista, álbum, estado, posición, duración, app y carátula. Recibe órdenes por su entrada estándar (stdin): `play`, `pause`, `toggle`, `next`, `previous`, `seek`, `refresh`, `audio-devices` y `set-output`.
  - Apple Music manda «Artista — Álbum» juntos en el artista: Notch los separa.
  - Funciona solo por avisos de Windows: no comprueba nada periódicamente.
  - La carátula se reduce a 300 px en JPEG y **solo viaja cuando cambia**.
  - Si el helper se cierra, Electron lo reinicia esperando cada vez más (2 s, 4 s… hasta 1 minuto). Al salir de Notch, el helper se cierra con él.
- **Volumen con Core Audio.** El mismo helper escucha el volumen de tu salida de audio con las interfaces COM de Windows (`IAudioEndpointVolumeCallback` y, para cuando cambias de altavoces a auriculares, `IMMNotificationClient`). Windows le avisa en cada cambio; al arrastrar el control llegan decenas de avisos seguidos y los junta en uno cada 40 ms. Windows 11 no deja ocultar su propio indicador de volumen, así que se ven los dos (o pon `"volumeIndicator": false`).
- **Letras de LRCLIB.** Al cambiar de canción, `main/lyrics.js` mira primero su caché (`%APPDATA%\Notch\lyrics\`, un archivo por canción). Si no la tiene, espera 1,5 s (por si estás pasando canciones) y pregunta a LRCLIB: primero la búsqueda exacta (`/api/get`, con título, artista, álbum y duración) y, si no la encuentra, la aproximada (`/api/search`, quitando cosas como «(feat. …)» o «- Remastered»). Guarda la respuesta, también el «no hay letra» (lo vuelve a intentar a los 7 días). Si LRCLIB no contesta en 10 s o no hay internet, la página ofrece «Reintentar». Sin artista (un vídeo cualquiera) no busca, para no traer la letra de otra canción.
- **La línea que suena, sin sondeos.** La página calcula en qué línea vas con la posición interpolada y programa **un solo temporizador** para el instante exacto de la siguiente; si pausas, saltas o cambias de canción, lo recalcula. Solo funciona con la página Música a la vista.
- **Colores con k-means.** La carátula se reduce a 16 × 16 píxeles y se agrupan los píxeles parecidos en 3 grupos; el color medio de cada uno pinta los degradados y el más vivo es el color de acento. Son variables CSS registradas con `@property`, así que cambian de una canción a otra con una transición suave.
- **Salida de audio.** El helper lista las salidas con Core Audio (`IMMDeviceEnumerator`) y se entera de los cambios por avisos de Windows. Para cambiar la predeterminada usa `IPolicyConfig`, la interfaz que usa la propia configuración de sonido de Windows. ⚠️ Microsoft no la documenta: funciona de Windows 7 a Windows 11, pero si algún día cambia, Notch solo mostrará el aviso «No se pudo cambiar la salida de audio».
- **Batería por eventos.** La página usa la API de batería de Chromium (`navigator.getBattery()`), que avisa cuando cambia el nivel o enchufas el cargador. Avisa una vez al bajar del 20 % y otra del 10 %, y vuelve a avisar tras cargarlo.
- **Centro de avisos.** Solo los de Notch (Pomodoro, batería, errores de configuración, atajos, helper; más adelante, la IA). Viven en memoria: al cerrar Notch se olvidan. Notch no puede leer las notificaciones de otras apps (Windows solo lo permite a las instaladas desde la Microsoft Store).
- **Tema.** `main/theme.js` aplica `theme` con `nativeTheme` (así el menú del clic derecho también cambia) y le dice a la página qué tema toca; la página lo pone en `<html data-theme>`. Con `"auto"`, si cambias el modo de Windows, el panel cambia solo.
- **Nota rápida.** Se escribe primero en un archivo temporal y luego se renombra: si se apaga el PC a mitad, la nota anterior sigue entera. Si `nota.md` no se puede leer, la página queda en solo lectura para no pisarla nunca.
- **Posición interpolada.** Las apps solo actualizan la posición de vez en cuando. El helper la ajusta al momento exacto en que la mide (Windows indica cuándo fue su última actualización). Notch guarda esa posición y la hora de la medición, y mientras suena calcula la posición actual por su cuenta: posición + tiempo transcurrido.
- **Pomodoro en `main.js`.** Chromium frena los temporizadores de las páginas que no se ven, así que el temporizador vive en el proceso principal. Es un único `setTimeout` que salta justo al terminar.
- **Links seguros.** La página nunca recibe las URLs: para abrir un link, pide su número y `main.js` lo abre con `shell.openExternal`.
- **Seguridad.** La página no tiene acceso a Node (`contextIsolation`, `sandbox`, sin `nodeIntegration`). Solo puede usar las funciones que `preload.js` expone en `window.notch`, y su Content-Security-Policy le impide cargar nada externo. Las órdenes al helper pasan por una lista blanca.
- **Bajo consumo.** No hay sondeo periódico (polling) en ninguna parte.
  - El reloj y la barra de la música solo se actualizan con el panel abierto, una vez por segundo.
  - El volumen, la batería, el tema y los atajos funcionan por avisos del sistema.
  - La cuenta atrás del Pomodoro solo se dibuja cuando se ve.
  - Las animaciones son cortas y se lanzan por eventos.
  - La **única animación continua** es el ecualizador, y solo corre mientras suena música y se ve en pantalla.

## Privacidad

Sin telemetría ni analíticas. La **única** conexión a internet de Notch es **LRCLIB** (<https://lrclib.net>), una base de datos libre de letras: por cada canción nueva le manda el **título, el artista, el álbum y la duración** (nada más: ni quién eres ni qué más haces), y solo si no tenía ya la letra guardada. Con `"lyrics": false` en `settings.json` no hay ninguna conexión.

El corrector ortográfico que trae Electron descargaba diccionarios de Google al arrancar: está desactivado (la nota no lo usa) y esa descarga se redirige a tu propio PC. Tu nota, tus avisos, tu configuración y la caché de letras (`%APPDATA%\Notch\lyrics\`, se puede borrar cuando quieras) se quedan en tu PC.

## Solución de problemas

- **Al arrancar salen errores `Unable to move the cache: Acceso denegado`.** Ya tenías Notch abierto. La copia nueva no puede usar la caché de la que ya está funcionando, le pide que abra su panel y se cierra sola (en la terminal aparece `[notch] Notch ya estaba abierto…`). Es inofensivo.
- **La isla avisa «Falta el helper de Windows».** Ejecuta `npm run build:helper` (necesitas el .NET 8 SDK) y reinicia Notch. Sin el helper no hay música ni volumen; lo demás funciona igual.
- **`npm run build:helper` dice que `dotnet` no se reconoce.** Instala el .NET 8 SDK y abre una terminal nueva.
- **La terminal dice «You must install or update .NET to run this application».** Falta el .NET 8 Runtime en ese PC: instálalo desde <https://dotnet.microsoft.com/download/dotnet/8.0>.
- **No aparece la música.** La app tiene que integrarse con los controles multimedia de Windows (si al subir el volumen ves la canción en el panel de Windows, Notch también la ve). Si suenan varias apps, Notch muestra la que Windows considera actual: la última que empezó a sonar.
- **La barra de progreso no avanza o no se puede saltar.** Algunas apps no le cuentan a Windows la posición o la duración, o no permiten saltar. En ese caso no hay barra o no se puede pulsar.
- **No veo el notch.** En reposo es una mini-muesca pegada al borde superior, en el centro del monitor **principal**. Lo eliges en *Configuración → Sistema → Pantalla* con «Convertir en la pantalla principal». Si la prefieres siempre en grande, pon `"autoHide": false`.
- **Se despierta cuando no quiero.** Pon `"revealOnHover": false` y solo se abrirá con el atajo. Si lo que te molesta es la música en la isla, pon `"musicActivity": false`.
- **Un atajo no hace nada.** Otra app ya usa esa combinación (o está repetida en `settings.json`). Notch te lo dice con el aviso «Un atajo no funciona» en la isla y en la campana. Cambia `shortcut` o `pageShortcuts` en `config/settings.json` (se aplica al guardar).
- **Salen dos indicadores de volumen.** El de Windows 11 no se puede ocultar. Si prefieres solo ese, pon `"volumeIndicator": false`.
- **No aparece la barra de volumen.** Vuelve a compilar el helper (`npm run build:helper`) y reinicia Notch: el volumen es nuevo en la Fase 1.
- **El panel se ve claro (u oscuro) y no lo quiero así.** Con `"theme": "auto"` sigue el modo de las apps de Windows (*Configuración → Personalización → Colores*). Pon `"theme": "dark"` o `"light"` para fijarlo.
- **No sale la letra.** LRCLIB no tiene todas las canciones (sobre todo las muy nuevas o poco conocidas): entonces pone «Sin letra disponible». Si pone «No se pudo buscar la letra», no hay internet o LRCLIB no contesta: pulsa «Reintentar». Si pusiste `"lyrics": false`, la columna de la letra no aparece.
- **La letra va adelantada o atrasada.** Depende de la posición que la app le cuenta a Windows: si al saltar con la barra la canción va al sitio correcto, la letra también debería. Algunas letras de LRCLIB tienen los tiempos un poco desfasados.
- **No aparece el botón de la salida de audio.** Vuelve a compilar el helper (`npm run build:helper`) y reinicia Notch: las salidas de audio son nuevas en la Fase 2.
- **No se pudo cambiar la salida de audio.** Windows no lo permitió (la interfaz que usa Notch no está documentada). Cámbiala en *Configuración → Sistema → Sonido*; la lista de Notch se actualiza sola.
- **Deslizar con el touchpad va al revés.** Depende de la dirección de desplazamiento de Windows (*Configuración → Bluetooth y dispositivos → Panel táctil → Desplazar y hacer zoom*). Con el ratón (arrastrar y soltar) siempre es: izquierda = siguiente.
- **No veo la batería.** Solo sale si el equipo tiene batería y no está llena y enchufada a la vez. En la mini-muesca, solo cuando queda poca (20 % o menos) y no está cargando.
- **No llega la notificación del Pomodoro.** Revisa que «No molestar» esté desactivado (*Configuración → Sistema → Notificaciones*). Windows también silencia las notificaciones mientras juegas a pantalla completa. Con `npm start`, la notificación aparece con un nombre técnico (`com.eidancuadros.notch`); en la versión instalada, como «Notch».
- **Un link no aparece.** Mira la terminal: dice qué link se ignoró y por qué.
- **No sale encima de un juego.** Los juegos en pantalla completa exclusiva tapan todas las ventanas. En modo «ventana sin bordes», el notch sí se ve.
- **`npm run dist` falla con «Cannot create symbolic link».** Activa el modo de desarrollador de Windows (*Configuración → Sistema → Para programadores*) o ejecuta la terminal como administrador y vuelve a intentarlo.
- **`npm start` dice que la versión de Node no es compatible.** Actualiza Node.js a 22.12 o superior.
