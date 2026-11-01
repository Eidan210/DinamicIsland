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
| 3 | IA: Claude Code y Antigravity en vivo (permisos, preguntas y planes desde la isla) y chat con Claude/Gemini | ✅ Hecha (Antigravity, en prueba) |
| 4 | Glow: colores que avisan de lo que pasa | ✅ Hecha |
| 5 | Clawd, la mascota, en la isla | ✅ Hecha |
| 6 | Home con widgets editables y links con su logo | ✅ Hecha |
| 7 | Portapapeles y bandeja de archivos | ⏳ Pendiente |
| 8 | «Casa de Clawd»: ventana de ajustes e historial | ⏳ Pendiente |

## Requisitos

- **Windows 11** (en Windows 10 también debería funcionar).
- **Node.js 22.12 o superior.** Electron 44 no arranca con versiones más antiguas. Descárgalo en <https://nodejs.org> (la versión LTS) y comprueba con `node --version`.
- **.NET 8 SDK**, para compilar el helper de Windows (WinHelper). Descárgalo en <https://dotnet.microsoft.com/download/dotnet/8.0> y comprueba con `dotnet --list-sdks` (debe aparecer una versión 8.x).
- **Git.**
- **Para la IA (opcional):** [Claude Code](https://code.claude.com) (el comando `claude`) con tu sesión iniciada. Para el chat con Gemini, Antigravity (`agy`) o Gemini CLI (`gemini`).

## Instalar

```bash
git clone https://github.com/Eidan210/DinamicIsland.git
cd DinamicIsland
npm install
npm run build:helper
```

`npm run build:helper` compila el helper de Windows y deja `WinHelper.exe` en `helpers/WinHelper/publish/`. Hay que repetirlo cada vez que cambia el código C# (por ejemplo, al actualizar a una fase que añade algo al helper, como el volumen de la Fase 1).

`npm install` también hay que repetirlo cuando una fase añade un paquete: la Fase 6 trae **Simple Icons** (los logos de los links). Si no lo haces, Notch funciona igual, pero los links salen con su inicial.

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
| **Actividad en vivo** | Mientras Claude Code (o Antigravity) trabaja (su icono con lo que hace, «Editando», «Probando»…, y el cronómetro del turno; al terminar, «Hecho» unos segundos), hay un Pomodoro en marcha (anillo y cuenta atrás) o suena música (carátula y ecualizador, con la isla teñida de los colores de la carátula). Puede haber hasta 3 a la vez: la más importante en la isla y las demás en **burbujas** a su derecha, como en el iPhone. Manda Claude, luego el Pomodoro y luego la música. |
| **Volumen** | Al cambiar el volumen de Windows: una barra con el nivel durante 1,5 segundos (con el panel abierto, sale en lugar de la fecha). |
| **Aviso** | Cuando empieza una canción nueva: «Ahora suena», con carátula, título y artista, durante 4 segundos. |
| **Aviso importante** | Batería baja (20 % y 10 %), un error en `settings.json`, un atajo que no funciona, el helper que falta, Claude que se paró por un error… Si lo pulsas, se abre el panel con la lista de avisos. |
| **Decisión** | Claude Code te pide **permiso** (con el comando exacto), te hace una **pregunta** o tiene un **plan** listo: la isla salta por encima de todo con sus botones (Permitir, Denegar, Permitir siempre; las opciones de la pregunta; Aprobar o Rechazar). Con el panel abierto, sale como tarjeta encima. «En la terminal» deja que te pregunte la terminal, como siempre. |
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

### Clawd

Clawd, el bichito naranja en pixel art, vive en la isla en lugar de los ojos (también en la mini-muesca, en pequeñito). Sus ojos se iluminan con el color de lo que pasa y hace cosas según el momento:

| Qué hace | Cuándo |
| --- | --- |
| **Teclea con las patitas** (ojos ámbar) | Claude (o Antigravity) está trabajando. |
| **Te mira con ojos azules** | Claude te espera. |
| **Se concentra** (ojos entrecerrados) | Hay un Pomodoro en marcha (aunque suene música). |
| **Baila** | Suena música: tiene 4 bailes y cada canción tiene siempre el suyo. |
| **Duerme** (ojos cerrados y unas «z») | Llevas un rato sin tocar el PC (5 minutos; `clawdSleepMinutes`) o lo bloqueaste. Al volver se despierta contento. |
| **Se ve cansado** | Queda poca batería (20 % o menos) y no está cargando. |
| **Parpadea, mira al ratón y alrededor** | Siempre, como hacían los ojos. |

Además, de vez en cuando:

- **Salta contento** cuando Claude termina, y **se sacude enfadado** (ojos rojos) si se paró por un error: se lo toma personal.
- **Celebra** el Pomodoro terminado, con destellos.
- **Se enfada si lo tocas** (con el panel abierto) y, si le das 6 toques seguidos, **se marea**.
- **Da un paseíto** cuando está tranquilo.
- **Se despide** a las 18:00 (`clawdByeTime`): la isla se queda a la vista unos segundos y te saluda con el brazo.
- **Se disfraza**: sombrero de bruja la última semana de octubre y gorro de Papá Noel del 20 al 26 de diciembre (`clawdCostume`).

Si prefieres los ojos de siempre, pon `"clawd": false`. Clawd es la mascota de Claude Code (de Anthropic): este es un dibujo propio inspirado en ella, para tu uso personal. Si algún día publicas la app, conviene cambiarlo.

### El brillo (glow)

Un brillo de color alrededor de la isla te cuenta lo que pasa sin tener que abrirla:

| Color | Cuándo |
| --- | --- |
| **Azul, latiendo** | Claude te espera: un permiso, una pregunta, un plan, la terminal te pregunta algo, o acaba de terminar. También en la mini-muesca, por si no estabas mirando. |
| **Naranja** | Claude (o Antigravity) está trabajando. |
| **Blanco** | Estás cambiando el volumen. |
| **El color de la carátula** | Suena música (con la música en la isla). |
| **Verde** | Ya lo viste: al pasar el ratón por la isla, el azul se pone verde un momento y se desvanece despacio. |

Si hay varios a la vez, gana el azul. El azul se queda hasta que pasas el ratón por la isla o la abres (al abrirla ya cuenta como visto). Con el panel abierto no hay brillo. Los colores están todos juntos en `renderer/styles.css` (sección **1b. Glow**): cámbialos a tu gusto. Para quitarlo, `"glow": false`.

Con el teclado latinoamericano (Colombia), `AltGr` equivale a `Ctrl + Alt`, pero `AltGr` + número no escribe ningún símbolo, así que estos atajos no te quitan nada. Si alguno choca con otra app, cámbialo en `settings.json` (ver `pageShortcuts`).

En la barra de arriba del panel están la **campana** (con el número de avisos sin ver: púlsala para ver la lista), la **batería** (si no está llena y enchufada) y la hora. La batería es como la del iPhone: el porcentaje va dentro de la pila; se pone verde con un rayo al lado si está cargando, amarilla con 20 % o menos y roja con 10 %.

### Páginas

- **Home**: tus widgets (Reloj, Música, Focus, IA, Links, Batería y Nota), en una rejilla que tú eliges. Ver [Home y sus widgets](#home-y-sus-widgets).
- **Música**: lo que suena en **cualquier app** que se integre con Windows (Apple Music, Spotify, el navegador…).
  - Carátula, título, artista, app de origen, barra de progreso y controles (anterior, reproducir/pausar, siguiente).
  - Haz clic en la barra para saltar a ese punto, si la app lo permite.
  - **Letra** a la derecha, de [LRCLIB](https://lrclib.net), animada como en Apple Music: la línea que suena va en el centro y sus palabras se iluminan de izquierda a derecha mientras se canta; al cambiar de línea, las líneas suben en cascada con un pequeño rebote, y las lejanas se ven tenues y algo borrosas. En las pausas instrumentales (y en las intros largas) salen tres puntos que se van encendiendo. Pulsa una línea para saltar a ese momento. Si la letra no tiene tiempos, se ve entera; si no la hay, pone «Sin letra disponible».
  - El **fondo** se mueve despacio con los colores de la carátula y, si el título no cabe, se desplaza de lado a lado.
  - La **barra de progreso** es como la del reproductor de los móviles Samsung: lo que ya sonó es una **ola** que fluye hacia el tirador redondo y se aplana al llegar. Al darle a reproducir, la ola se levanta; al pausar, se calma hasta quedar en una línea recta. Al principio de la canción sigue un poco más allá del tirador, en gris, y se va llenando de color según suena.
  - Los **colores** de la carátula tiñen el fondo de la página (un degradado con sus 3 colores principales), el widget de Home, la isla, la barra y el ecualizador.
  - El botón de la **píldora** decide si la música se muestra en la isla (se guarda en `musicActivity`).
  - El botón de **salida** (ondas sobre un triángulo) abre la lista de **salidas de audio** (altavoces, auriculares, la tele…): la que eliges pasa a ser la predeterminada de Windows.
- **Focus**: el **Pomodoro** y todos tus **links**.
  - **Iniciar / Pausar / Seguir** y **↺ Reiniciar**.
  - `−` / `+` cambian la duración de 5 en 5 minutos (con el Pomodoro parado). La duración se guarda en `settings.json`.
  - Al terminar, recibes una **notificación de Windows**, la isla lo celebra con los ojos felices y queda en el centro de avisos.
  - Si el portátil se suspende, el Pomodoro se pausa solo.
- **IA**: arriba eliges **Sesiones** o **Chat**.
  - **Sesiones**: una tarjeta por cada sesión de Claude Code (o de Antigravity): el proyecto, lo que le pediste, qué hace ahora, el cronómetro del turno y los pasos **Leer → Editar → Probar → Hecho**. Al terminar: su resumen, cuántos archivos cambió, si los tests pasaron y los errores de compilación. Sin sesiones, te explica cómo conectarlo (ver [Conectar Claude Code](#conectar-claude-code)).
  - **Chat**: con **Gemini**, **Claude** (eliges Opus, Sonnet, Haiku o Fable) o **Ambos** a la vez para comparar. La respuesta aparece mientras se escribe; el botón de enviar pasa a ser «parar». `Enter` manda y `Mayús + Enter` hace un salto de línea. El lápiz empieza una conversación nueva. Lo que escribas va **solo** a quien elijas (Claude → Anthropic, Gemini → Google) y la conversación vive en memoria: al cerrar Notch se olvida.
- **Portapapeles**: el historial de lo que copias y la bandeja de archivos. Llega en la Fase 7.
- **Nota**: una nota rápida. Con `Ctrl + Alt + 6` se abre con el cursor listo para escribir.
  - Se guarda sola medio segundo después de que dejes de escribir (y al cerrar el panel o cambiar de página). Abajo ves «Guardado» y cuántas palabras llevas.
  - Vive en `%APPDATA%\Notch\nota.md`, un archivo de texto normal (Markdown) que puedes abrir con cualquier editor.

### Home y sus widgets

Home es una rejilla de **4 × 2 celdas**. Cada widget ocupa **1 celda (1×1)** o **2 seguidas (2×1)**, y en el ancho se ven más cosas:

| Widget | 1×1 | 2×1 (además) | Al tocarlo |
| --- | --- | --- | --- |
| **Reloj** | Esfera con agujas, la hora y la fecha | La fecha completa y cuánto falta para que Clawd se despida | — |
| **Música** | Carátula y canción (play/pausa al pasar el ratón por la carátula) | Anterior / play-pausa / siguiente y la barra de progreso | Abre Música |
| **Focus** | El anillo del Pomodoro, el tiempo y cómo va | Las sesiones de hoy y ↺ reiniciar | **Empieza o pausa el Pomodoro** |
| **IA** | El proyecto y qué hace Claude («Editando home.js») | Los pasos Leer → Editar → Probar → Hecho | Abre IA |
| **Links** | Hasta 8 logos | Hasta 6 logos con su nombre | Cada logo abre su web; fuera de ellos, Focus |
| **Batería** | El nivel, si carga y cuánto queda | (solo 1×1) | — |
| **Nota** | El principio de tu nota | Más ancha | Abre Nota |

**Modo edición: mantén pulsado 0,6 s** sobre cualquier widget (o sobre un hueco). Los widgets tiemblan y abajo, en lugar de las pestañas, aparece la barra de edición:

- **Arrastra** un widget para cambiarlo de sitio (sin soltar tras mantener pulsado, ya lo puedes mover). Los demás se apartan.
- **✕** lo quita y **⤢** cambia su tamaño (1×1 ⇄ 2×1). Si no cabe, te lo dice abajo.
- **Añadir** abre el catálogo con los que no están (o pulsa el **+** de un hueco libre).
- **Diseños**: 3 ya hechos, «Clásico» (el de por defecto), «Trabajo» y «Todo a la vista».
- **Listo** (o `Esc`, cerrar el panel o cambiar de página) termina.

Lo que elijas se guarda en `%APPDATA%\Notch\home.json` (no en `config/`: no hace falta tocarlo a mano).

**Novedades.** Un widget brilla con un borde de luz cuando su módulo tiene algo nuevo que aún no viste: Claude te espera o terminó (IA, en azul), el Pomodoro acabó (Focus), empezó otra canción (Música, con el color de la carátula), queda poca batería (Batería, en amarillo o rojo), cambiaste `links.json` (Links) o la nota no se pudo guardar (Nota, en rojo). Al pasar el ratón por encima, tocarlo o abrir su página, se da por visto.

## Conectar Claude Code

Claude Code puede avisar a otros programas de lo que hace (sus [hooks](https://code.claude.com/docs/en/hooks)). Notch abre un pequeño servidor **solo en tu PC** (`127.0.0.1:47823`) para recibir esos avisos. **Notch no modifica tus archivos**: tú pegas la configuración.

1. Abre Notch, ve a la página **IA** y pulsa **«Copiar para Claude Code»** (o «Copiar configuración» arriba a la derecha). Se copia el bloque de abajo **con tu token** ya puesto.
2. Abre `%USERPROFILE%\.claude\settings.json` (créalo si no existe) y pega el bloque. Si ya tenías una clave `"hooks"`, añade cada evento dentro de la tuya en vez de crear otra.
3. Abre (o reinicia) Claude Code. En la página IA verás «Conectado» en cuanto llegue el primer aviso; con `/hooks` dentro de Claude Code puedes revisar que están.

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "http", "url": "http://127.0.0.1:47823/claude", "headers": { "Authorization": "Bearer TU_TOKEN" }, "timeout": 5 }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "http", "url": "http://127.0.0.1:47823/claude", "headers": { "Authorization": "Bearer TU_TOKEN" }, "timeout": 5 }] }],
    "PreToolUse": [{ "matcher": "*", "hooks": [{ "type": "http", "url": "http://127.0.0.1:47823/claude", "headers": { "Authorization": "Bearer TU_TOKEN" }, "timeout": 600 }] }],
    "PermissionRequest": [{ "matcher": "*", "hooks": [{ "type": "http", "url": "http://127.0.0.1:47823/claude", "headers": { "Authorization": "Bearer TU_TOKEN" }, "timeout": 600, "statusMessage": "Esperando tu respuesta en Notch…" }] }],
    "PostToolUse": [{ "matcher": "*", "hooks": [{ "type": "http", "url": "http://127.0.0.1:47823/claude", "headers": { "Authorization": "Bearer TU_TOKEN" }, "timeout": 5 }] }],
    "PostToolUseFailure": [{ "matcher": "*", "hooks": [{ "type": "http", "url": "http://127.0.0.1:47823/claude", "headers": { "Authorization": "Bearer TU_TOKEN" }, "timeout": 5 }] }],
    "Notification": [{ "hooks": [{ "type": "http", "url": "http://127.0.0.1:47823/claude", "headers": { "Authorization": "Bearer TU_TOKEN" }, "timeout": 5 }] }],
    "Stop": [{ "hooks": [{ "type": "http", "url": "http://127.0.0.1:47823/claude", "headers": { "Authorization": "Bearer TU_TOKEN" }, "timeout": 5 }] }],
    "StopFailure": [{ "hooks": [{ "type": "http", "url": "http://127.0.0.1:47823/claude", "headers": { "Authorization": "Bearer TU_TOKEN" }, "timeout": 5 }] }],
    "SessionEnd": [{ "hooks": [{ "type": "http", "url": "http://127.0.0.1:47823/claude", "headers": { "Authorization": "Bearer TU_TOKEN" }, "timeout": 2 }] }]
  }
}
```

- **`TU_TOKEN`** es una clave secreta que Notch crea la primera vez (`%APPDATA%\Notch\ai-token.txt`). Sin ella, el servidor rechaza todo. El botón de copiar ya la pone; no la compartas.
- **Por qué esos tiempos**: los permisos (`PermissionRequest`) y las preguntas y planes (que llegan por `PreToolUse`) esperan tu respuesta en la isla hasta 10 minutos (600 s). Si no respondes, o pulsas «En la terminal», Claude Code te pregunta en la terminal como siempre. Los demás avisos tienen 5 segundos: si Notch está cerrado, Claude Code sigue sin esperar.
- **Mientras Notch espera tu respuesta**, la terminal enseña «Esperando tu respuesta en Notch…».
- **«Permitir siempre»** guarda la regla que propone el propio Claude Code (la misma que su opción «no volver a preguntar»). Solo aparece cuando Claude Code la propone.
- Si cambias `aiPort` en `settings.json`, cambia también el puerto de las URLs de este bloque.

### Antigravity (en prueba)

Antigravity (`agy`) también tiene hooks, pero todavía no están bien documentados (cada fuente dice una cosa). Por ahora Notch **solo enseña su estado** (qué herramienta usó), nunca decide nada por él. Con «Antigravity (en prueba)» en la página IA se copia esto, para `%USERPROFILE%\.gemini\config\hooks.json`:

```json
{ "PostToolUse": [{ "matcher": ".*", "hooks": [{ "type": "command", "command": "curl.exe -s -m 3 -X POST -H \"Content-Type: application/json\" -H \"Authorization: Bearer TU_TOKEN\" --data-binary @- http://127.0.0.1:47823/agy/PostToolUse" }] }] }
```

Usa `curl.exe` (viene con Windows) y solo el evento de *después* de cada herramienta: así, aunque Notch esté cerrado, agy no se bloquea. Como agy no avisa al terminar, si pasa minuto y medio sin eventos, Notch lo da por terminado. Si algo no encaja con tu versión de agy, cuéntamelo con lo que salga en `/hooks`.

### El chat

No necesita API keys: usa tus programas con su sesión iniciada.

- **Claude**: `claude -p` sin herramientas (no puede tocar tus archivos), sin guardar la conversación (`--no-session-persistence`) y con un prompt de chat sencillo.
- **Gemini**: primero Antigravity (`agy -p`); si no está instalado o falla, Gemini CLI (`gemini`). Lo eliges con `geminiCli`.
- Se ejecutan en una carpeta vacía de Notch (`%APPDATA%\Notch\chat`). Tu texto nunca pasa por la línea de comandos de `cmd.exe`: a Claude y a Gemini CLI se lo da por su entrada estándar, y a `agy.exe` directamente, sin pasar por ningún shell.

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
  "animations": "always",
  "locale": "es-ES",
  "hour12": false,
  "autoHide": true,
  "revealOnHover": true,
  "pomodoroMinutes": 25,
  "musicActivity": true,
  "lyrics": true,
  "volumeIndicator": true,
  "glow": true,
  "clawd": true,
  "clawdSleepMinutes": 5,
  "clawdByeTime": "18:00",
  "clawdCostume": "auto",
  "ai": true,
  "aiPort": 47823,
  "chatProvider": "gemini",
  "claudeModel": "sonnet",
  "geminiModel": "",
  "geminiCli": "auto"
}
```

No hace falta copiar todo: basta con las claves que quieras cambiar.

| Clave | Por defecto | Qué hace |
| --- | --- | --- |
| `shortcut` | `"Control+Alt+T"` | Atajo global para abrir y cerrar. Usa el [formato de atajos de Electron](https://www.electronjs.org/docs/latest/api/accelerator), por ejemplo `"Control+Shift+Space"` o `"Alt+N"`. |
| `pageShortcuts` | `Ctrl+Alt+1…6` | Un atajo por página (`home`, `music`, `ai`, `focus`, `clipboard`, `note`). Solo pon las que quieras cambiar, p. ej. `{ "note": "Control+Alt+N" }`; `""` deja esa página sin atajo. |
| `theme` | `"auto"` | Tema del panel abierto: `"auto"` (como el modo de las apps de Windows), `"light"` (claro) o `"dark"` (oscuro). La isla compacta siempre es negra. |
| `animations` | `"always"` | `"always"`: anima siempre, aunque Windows tenga apagados los «Efectos de animación». `"system"`: hace caso a Windows (con los efectos apagados, no anima). `"off"`: no anima nada. |
| `locale` | `"es-ES"` | Idioma de la fecha: `"es-MX"`, `"es-CO"`, `"en-US"`… |
| `hour12` | `false` | `true` muestra el reloj en formato de 12 horas (a. m./p. m.). |
| `autoHide` | `true` | `true`: en reposo se encoge a la mini-muesca. `false`: la píldora siempre está a la vista. |
| `revealOnHover` | `true` | `true`: pasar el ratón por la mini-muesca la despierta. `false`: solo se abre con el atajo. |
| `pomodoroMinutes` | `25` | Duración del Pomodoro, entre 1 y 180 minutos. También la cambian los botones `−` / `+`. |
| `musicActivity` | `true` | `true`: mientras suena música, la isla la muestra y avisa al cambiar de canción. `false`: la música solo aparece en el panel. También lo cambia el botón de la píldora de la página Música. |
| `lyrics` | `true` | `true`: busca las letras en LRCLIB (la única conexión a internet de Notch). `false`: sin letras y sin ninguna conexión. |
| `volumeIndicator` | `true` | `true`: al cambiar el volumen, la isla enseña una barra 1,5 s. `false`: solo se ve el indicador de Windows. |
| `glow` | `true` | `true`: brillo de color alrededor de la isla (ver [El brillo](#el-brillo-glow)). `false`: sin brillo. Los colores se cambian en `renderer/styles.css`, sección 1b. |
| `clawd` | `true` | `true`: Clawd vive en la isla (ver [Clawd](#clawd)). `false`: los dos ojos verdes de siempre. |
| `clawdSleepMinutes` | `5` | Minutos sin tocar el PC para que Clawd se duerma (de 1 a 240). También se duerme al bloquear el PC. |
| `clawdByeTime` | `"18:00"` | A esta hora Clawd se despide hasta mañana (formato `"HH:MM"`). `""` = nunca. |
| `clawdCostume` | `"auto"` | `"auto"`: disfraz según la fecha (Halloween y Navidad). `"none"`: nunca. `"halloween"` o `"christmas"`: siempre ese. |
| `ai` | `true` | `true`: Notch escucha a Claude Code y Antigravity (servidor solo en tu PC, `127.0.0.1`). `false`: sin servidor. |
| `aiPort` | `47823` | Puerto de ese servidor (de 1024 a 65535). Si lo cambias, cambia también las URLs de tu configuración de Claude Code. |
| `chatProvider` | `"gemini"` | Con quién habla el chat al abrirlo: `"gemini"`, `"claude"` o `"both"` (los dos). También lo cambia el selector de la página IA. |
| `claudeModel` | `"sonnet"` | Modelo de Claude en el chat: `"opus"`, `"sonnet"`, `"haiku"` o `"fable"`. |
| `geminiModel` | `""` | Modelo de Gemini en el chat (`""` = el que use por defecto agy o Gemini CLI), p. ej. `"gemini-2.5-flash"`. |
| `geminiCli` | `"auto"` | `"auto"`: Antigravity y, si falla, Gemini CLI. `"agy"`: solo Antigravity. `"gemini"`: solo Gemini CLI. |

### `config/links.json`

Una lista de links. Cada uno es un botón redondo con el **logo de la web** (o su inicial) sobre su color:

```json
[
  { "name": "GitHub", "url": "https://github.com", "color": "#8b5cf6" },
  { "name": "Spotify", "url": "https://open.spotify.com" },
  { "name": "Presupuesto", "url": "https://docs.google.com/spreadsheets/d/…" },
  { "name": "Mi web", "url": "https://ejemplo.com", "icon": "Google Drive" },
  { "name": "Correo", "url": "mailto:yo@ejemplo.com" },
  { "name": "Casa", "url": "https://ejemplo.com", "color": "#ffd43b", "initial": "🏠" }
]
```

Los logos son de [Simple Icons](https://simpleicons.org) (más de 3000 marcas, licencia CC0) y vienen dentro de Notch: **no se descarga nada**. Notch lo busca solo:

1. Por la web: `mail.google.com` → Gmail, `calendar.google.com` → Google Calendar, `docs.google.com/spreadsheets` → Google Sheets, `music.youtube.com` → YouTube Music…
2. Por el nombre de la web: `github.com` → GitHub, `claude.ai` → Claude, `notion.so` → Notion.
3. Por el nombre del link: «YouTube Music» → YouTube Music.

Si no lo encuentra, la inicial, como siempre. Algunas marcas pidieron salir de Simple Icons (Microsoft, Outlook, LinkedIn, Slack, Amazon…): esas van con la inicial. Los correos (`mailto:`) también, porque se abren con tu programa de correo.

| Campo | Obligatorio | Qué hace |
| --- | --- | --- |
| `name` | Sí | Nombre que se ve debajo del botón. Su primera letra es la inicial. |
| `url` | Sí | Dirección que se abre en tu navegador. Por seguridad, solo se aceptan `http://`, `https://` y `mailto:`. |
| `color` | No | Color del círculo en formato `#rrggbb` o `#rgb`. Si no lo pones, se elige uno automáticamente. El texto se pone blanco o negro según el color, para que siempre se lea. |
| `initial` | No | Lo que se ve dentro del círculo en lugar de la inicial: hasta 2 caracteres, emojis incluidos. Si lo pones (y no pones `icon`), se usa en lugar del logo. |
| `icon` | No | El logo que quieres, con su nombre de [simpleicons.org](https://simpleicons.org): `"spotify"`, `"Google Drive"`… Con `false` o `"none"`, sin logo (la inicial). |

Sin `color`, el círculo toma el color de la marca (el verde de Spotify, el rojo de YouTube…). El logo va en blanco o en negro según el color, para que siempre se vea.

En Focus caben 10 links sin scroll; en el widget de Home, 8 (1×1) o 6 con su nombre (2×1). Los links con errores se ignoran y el motivo aparece en la terminal.

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
  link-logos.js          los logos de los links (Simple Icons, sin conexión)
  home.js                los widgets de Home (home.json en tu carpeta de datos)
  helper.js              lanza WinHelper.exe y reparte sus mensajes
  music.js               la música que suena en Windows
  lrc.js                 leer letras sincronizadas (formato LRC) y elegir la mejor
  lyrics.js              las letras: LRCLIB y su caché
  audio.js               las salidas de audio
  volume.js              el volumen de Windows
  note.js                la nota rápida (nota.md)
  ai-logic.js            qué significa cada evento de Claude Code (lógica pura, sin Electron)
  ai-sessions.js         las sesiones de Claude Code / Antigravity y sus decisiones pendientes
  ai-server.js           el servidor local (127.0.0.1) que recibe sus eventos, y el bloque para pegar
  ai-chat-parse.js       leer lo que escriben los CLI del chat (stream-json)
  ai-chat.js             el chat: lanzar claude / agy / gemini y su conversación en memoria
  idle.js                ¿estás delante del PC? (para que Clawd se duerma)
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
    wave.js              la ola de la barra de progreso
    ai.js                Claude Code y Antigravity: isla, decisiones y página IA
    chat.js              el chat de la página IA
    glow.js              el brillo de color alrededor de la isla
    clawd.js             Clawd: qué hace, sus acciones, bailes y disfraces
    home.js              Home: la rejilla, el modo edición, las novedades y guardarlo
    home-grid.js         dónde cae cada widget en la rejilla de 4×2 (funciones puras)
    clock.js, eyes.js, pomodoro.js, music.js, links.js, utils.js
  widgets/               Un archivo por widget de Home:
    index.js             el catálogo (y los 3 diseños)
    clock.js, music.js, focus.js, ai.js, links.js, battery.js, note.js
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
- **Muelles de verdad.** La isla cambia de forma con curvas de muelle amortiguado (escritas con `linear()` en `styles.css`): al crecer se pasa un poco y se asienta, como en el iPhone; al encoger, se asienta sin rebotar. Al pulsarla se hunde un poco. Al cambiar de forma, lo que se va se desenfoca y lo que llega se enfoca; el contenido del panel entra igual, en cascada.
- **Iconos dibujados a mano.** Son SVG propios al estilo de los de Apple (rellenos y con las puntas redondeadas), definidos una sola vez en `index.html` y reutilizados con `<use>`: no se descarga ninguna fuente de iconos. La ola de la barra la dibuja `wave.js` en dos `<path>` de SVG (lo que ya sonó y lo que falta): para cada punto, altura = envolvente × amplitud × seno; la envolvente la hace nacer y morir plana. Mientras suena, un único `requestAnimationFrame` la hace fluir y avanza la barra, como mucho unas 60-80 veces por segundo, solo con la página Música a la vista; en pausa, en cuanto se calma, se para.
- **Clawd.** Es un SVG dentro de `index.html` (para poder animar sus patas, brazos, ojos y gorros con CSS): 18 × 10 «píxeles», cada uno de 1 px en la mini-muesca y de 2 px en la píldora. `clawd.js` decide qué hace (`data-mode`) y su expresión (`data-eyes`) cada vez que la isla revisa su forma; las animaciones que duran (teclear, bailar, las «z») van a saltos de píxel (`steps()`), como un juego retro, y solo corren mientras se ve. Parpadear, mirar al ratón y alrededor siguen en `eyes.js`, que mueve la cara que toque. Para saber si estás delante, `main/idle.js` pregunta cada 30 s cuánto llevas sin tocar el PC (`powerMonitor.getSystemIdleTime`), cada 3 s mientras duerme para despertarse enseguida, y escucha los avisos de bloquear, desbloquear, suspender y reanudar. La despedida es un único temporizador hasta esa hora.
- **El brillo.** Es un `filter: drop-shadow(...)` sobre la propia isla: sigue su forma (mini, píldora, tarjeta) y no lo recorta el `overflow: hidden`. `glow.js` solo decide el estado (`data-glow`) cuando la isla revisa su forma, al pasar el ratón o al abrir el panel; un único temporizador apaga el verde. El latido es una animación CSS del filtro, que Chromium puede hacer en la tarjeta gráfica. Sin brillo, las sombras son transparentes, y con el panel abierto no hay filtro.
- **Servidor de la IA.** `main/ai-server.js` escucha solo en `127.0.0.1` y exige el token (`Authorization: Bearer …`, comparado en tiempo constante). Rechaza las peticiones de navegadores (con cabecera `Origin`) y las que no van dirigidas a `127.0.0.1` o `localhost` (así una web no puede hablarle), y como mucho acepta 1 MB por petición. Responde al momento salvo cuando algo espera tu respuesta.
- **Decisiones.** Un permiso, una pregunta o un plan dejan la petición de Claude Code abierta: la isla enseña la tarjeta y, cuando eliges, Notch contesta con el JSON que dice la documentación de Claude Code (`decision.behavior` en los permisos; `permissionDecision` con `updatedInput` en las preguntas y los planes). Si Claude Code cuelga antes (respondiste en la terminal o se agotó su tiempo), la tarjeta se va sola. Un temporizador por decisión (590 s) y otro por sesión (se olvida a los 45 minutos sin señales): nada de sondeos.
- **Chat.** `main/ai-chat.js` busca los programas con `where.exe`, prefiere el `.exe` y, si solo hay un `.cmd` (instalado con npm), lo lanza con `cmd.exe` pasándole solo argumentos de Notch: tu texto va por la entrada estándar. Lee su salida línea a línea (`stream-json`) y se la manda a la página a trozos (cada 50 ms). «Parar» cierra el programa con todo lo que haya abierto (`taskkill /T`).
- **Batería por eventos.** La página usa la API de batería de Chromium (`navigator.getBattery()`), que avisa cuando cambia el nivel o enchufas el cargador. Avisa una vez al bajar del 20 % y otra del 10 %, y vuelve a avisar tras cargarlo.
- **Centro de avisos.** Solo los de Notch (Pomodoro, batería, errores de configuración, atajos, helper; más adelante, la IA). Viven en memoria: al cerrar Notch se olvidan. Notch no puede leer las notificaciones de otras apps (Windows solo lo permite a las instaladas desde la Microsoft Store).
- **Tema.** `main/theme.js` aplica `theme` con `nativeTheme` (así el menú del clic derecho también cambia) y le dice a la página qué tema toca; la página lo pone en `<html data-theme>`. Con `"auto"`, si cambias el modo de Windows, el panel cambia solo.
- **Nota rápida.** Se escribe primero en un archivo temporal y luego se renombra: si se apaga el PC a mitad, la nota anterior sigue entera. Si `nota.md` no se puede leer, la página queda en solo lectura para no pisarla nunca.
- **Posición interpolada.** Las apps solo actualizan la posición de vez en cuando. El helper la ajusta al momento exacto en que la mide (Windows indica cuándo fue su última actualización). Notch guarda esa posición y la hora de la medición, y mientras suena calcula la posición actual por su cuenta: posición + tiempo transcurrido.
- **Pomodoro en `main.js`.** Chromium frena los temporizadores de las páginas que no se ven, así que el temporizador vive en el proceso principal. Es un único `setTimeout` que salta justo al terminar.
- **Links seguros.** La página nunca recibe las URLs: para abrir un link, pide su número y `main.js` lo abre con `shell.openExternal`.
- **Logos sin conexión.** `main/link-logos.js` lee la lista de Simple Icons (`icons.json`, del paquete npm) solo al cargar `links.json` y no la guarda en memoria; de cada logo solo pasa a la página el dibujo (el `d` de su `<path>`, comprobado con la expresión regular de Simple Icons), que la página pinta con `createElementNS`: nunca `innerHTML`.
- **Home.** Los widgets van en orden y `home-grid.js` coloca cada uno en el primer hueco donde cabe (de izquierda a derecha y de arriba abajo), así que con 8 celdas o menos siempre caben. Al arrastrar, prueba cada posición de la lista y se queda con la que deja el widget bajo el ratón; los demás se deslizan a su sitio nuevo con la técnica FLIP (medir antes, colocar, medir después y animar la diferencia). Cada widget dice sus novedades como una lista de «motivos» (como el brillo de la isla): brilla si hay alguno que no habías visto. `main/home.js` revisa lo que le llega (tipos, tamaños, sin repetir, 8 celdas como mucho) y escribe `home.json` como la nota: primero un temporal y luego lo renombra.
- **Seguridad.** La página no tiene acceso a Node (`contextIsolation`, `sandbox`, sin `nodeIntegration`). Solo puede usar las funciones que `preload.js` expone en `window.notch`, y su Content-Security-Policy le impide cargar nada externo. Las órdenes al helper pasan por una lista blanca.
- **Bajo consumo.** No hay sondeo periódico (polling) en ninguna parte.
  - El reloj y los tiempos de la música solo se actualizan con el panel abierto, una vez por segundo (y sus números «ruedan», como en el iPhone).
  - El fondo animado, la letra que se ilumina y la barra continua solo se mueven con la página Música a la vista y la música sonando; al cerrar el panel o cambiar de página, se paran. El fondo solo usa `translate` y `scale`, que mueve la tarjeta gráfica casi sin gastar.
  - El volumen, la batería, el tema y los atajos funcionan por avisos del sistema.
  - La cuenta atrás del Pomodoro solo se dibuja cuando se ve.
  - Los widgets de Home no tienen temporizadores propios: el reloj se mueve con el de la barra de arriba (solo con el panel abierto) y la barra de la música avanza sola con una animación del navegador, que se para al cerrar el panel o cambiar de página.
  - Las animaciones son cortas y se lanzan por eventos.
  - Con el panel cerrado, la **única animación continua** es el ecualizador, y solo corre mientras suena música y se ve en pantalla.
  - Notch anima aunque Windows tenga apagados los «Efectos de animación» (muchos portátiles gamer vienen así). Para que le haga caso a Windows, pon `"animations": "system"`; para no animar nada, `"off"` (entonces la línea de la letra se ve entera iluminada).

## Privacidad

Sin telemetría ni analíticas. La **única** conexión a internet que hace Notch es **LRCLIB** (<https://lrclib.net>), una base de datos libre de letras: por cada canción nueva le manda el **título, el artista, el álbum y la duración** (nada más: ni quién eres ni qué más haces), y solo si no tenía ya la letra guardada. Con `"lyrics": false` en `settings.json` no hay ninguna conexión.

**Clawd.** Para saber si estás delante del PC, Notch solo pregunta a Windows cuántos segundos llevas sin tocar el ratón ni el teclado (no qué haces); no se guarda ni se manda a ningún sitio.

**IA.** El servidor de la IA solo escucha en tu PC (`127.0.0.1`) y solo recibe lo que Claude Code (o Antigravity) le manda. **Notch no manda nada a Anthropic ni a Google por su cuenta.** El chat no lo hace Notch: lanza tus propios programas (`claude`, `agy` o `gemini`) solo cuando escribes, y lo que escribas va solo a quien elijas (**Claude → Anthropic**, **Gemini → Google**). La conversación vive en memoria (a Claude además se le pide que no la guarde) y se olvida al cerrar Notch. Con `"ai": false` no hay servidor.

El corrector ortográfico que trae Electron descargaba diccionarios de Google al arrancar: está desactivado (la nota no lo usa) y esa descarga se redirige a tu propio PC. Tu nota, tus avisos, tu configuración, tus widgets de Home (`%APPDATA%\Notch\home.json`) y la caché de letras (`%APPDATA%\Notch\lyrics\`, se puede borrar cuando quieras) se quedan en tu PC. Los logos de los links vienen dentro de Notch (Simple Icons): no se descarga ninguno.

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
- **Todo se ve estático o las barritas de la música no se mueven.** Revisa que en `settings.json` no tengas `"animations": "system"` u `"off"`. Con `"system"`, Notch hace caso a Windows: si los «Efectos de animación» están apagados (*Configuración → Accesibilidad → Efectos visuales*), no anima. Con `"always"` (lo de por defecto) anima siempre.
- **No veo la batería.** Solo sale si el equipo tiene batería y no está llena y enchufada a la vez. En la mini-muesca, solo cuando queda poca (20 % o menos) y no está cargando.
- **No llega la notificación del Pomodoro.** Revisa que «No molestar» esté desactivado (*Configuración → Sistema → Notificaciones*). Windows también silencia las notificaciones mientras juegas a pantalla completa. Con `npm start`, la notificación aparece con un nombre técnico (`com.eidancuadros.notch`); en la versión instalada, como «Notch».
- **Un link no aparece.** Mira la terminal: dice qué link se ignoró y por qué.
- **Los links salen con la inicial y no con el logo.** Si es con todos, falta `npm install` (la terminal dice «No encuentro el paquete simple-icons»). Si es con uno, esa marca no está en Simple Icons (o la web no se reconoce): búscala en <https://simpleicons.org> y pon su nombre en `"icon"`. Si pusiste `"initial"`, se usa la inicial: quítala o añade `"icon"`.
- **No entra en el modo edición de Home.** Mantén pulsado 0,6 s **sin mover** el ratón (si lo mueves, cuenta como un clic normal).
- **Quiero el Home de siempre.** En el modo edición, «Diseños» → «Clásico». O cierra Notch y borra `%APPDATA%\Notch\home.json`.
- **No sale encima de un juego.** Los juegos en pantalla completa exclusiva tapan todas las ventanas. En modo «ventana sin bordes», el notch sí se ve.
- **`npm run dist` falla con «Cannot create symbolic link».** Activa el modo de desarrollador de Windows (*Configuración → Sistema → Para programadores*) o ejecuta la terminal como administrador y vuelve a intentarlo.
- **`npm start` dice que la versión de Node no es compatible.** Actualiza Node.js a 22.12 o superior.
- **La isla no muestra lo que hace Claude Code.** Revisa que pegaste el bloque en `%USERPROFILE%\.claude\settings.json` (con tu token) y reinicia Claude Code; con `/hooks` puedes ver si los cargó. En la página IA debe decir «Escuchando» (o «Conectado»). Para comprobar el servidor: `curl.exe -H "Authorization: Bearer TU_TOKEN" http://127.0.0.1:47823/health` debe responder `{"ok":true,"app":"notch"}`.
- **Claude Code se queda esperando y la terminal no pregunta nada.** Está esperando tu respuesta en la isla (la terminal dice «Esperando tu respuesta en Notch…»). Responde en la isla o pulsa «En la terminal». Si no haces nada, a los 10 minutos te pregunta la terminal.
- **«La IA no puede escuchar a Claude Code».** Otra app usa el puerto 47823. Pon otro en `aiPort` y cámbialo también en las URLs de tu configuración de Claude Code.
- **El chat dice «No encuentro Claude Code».** Abre una terminal nueva y prueba `claude --version`. Si no funciona, instálalo o añade su carpeta al PATH, y reinicia Notch. Si dice que no has iniciado sesión, ejecuta `claude` en una terminal e inicia sesión.
- **Gemini no responde o tarda mucho.** Si Antigravity falla, Notch prueba solo con Gemini CLI (lo pone en la respuesta). Para usar siempre Gemini CLI, pon `"geminiCli": "gemini"`. Si ninguno está instalado, el chat te lo dice.
- **Quiero apagar la IA.** Pon `"ai": false` en `settings.json` (se aplica al guardar). Puedes dejar los hooks pegados: si Notch no escucha, Claude Code sigue como siempre.
- **El brillo me molesta o quiero otros colores.** Pon `"glow": false` para quitarlo. Para cambiar los colores, edita las variables `--glow-…` de la sección 1b de `renderer/styles.css` y recarga Notch.
- **La isla sigue brillando en azul.** Claude te espera o acaba de terminar: pasa el ratón por la isla (o ábrela) y el brillo se va.
- **Prefiero los ojos de siempre.** Pon `"clawd": false` en `settings.json`.
- **Clawd se duerme demasiado pronto (o tarde).** Cambia `clawdSleepMinutes`. Viendo una película sin tocar el ratón también se duerme; si suena música, baila en vez de dormir.
- **No quiero que se despida (o a otra hora).** Pon `"clawdByeTime": ""` o la hora que quieras, p. ej. `"20:30"`.
