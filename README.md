# Notch

Isla dinámica estilo iPhone para **Windows 11**. En reposo es una mini-muesca negra con dos ojos verdes, pegada al borde superior de la pantalla. Cuando pasa algo (un Pomodoro, una canción, cambias el volumen, se acaba la batería), se convierte en una píldora con información en vivo, como la isla dinámica de Apple; si pasan dos cosas a la vez, la segunda sale en una burbuja a su lado. Con **Ctrl + Alt + T** se despliega en un panel con 6 páginas (Home, Música, IA, Focus, Portapapeles y Nota), y con **Ctrl + Alt + 1…6** vas directo a cada una. En la página Música ves la **letra sincronizada**, los colores de la carátula y puedes cambiar la **salida de audio**; para pasar de canción basta con **deslizar** a los lados.

Hecha con **Electron + HTML/CSS/JS sin frameworks**, más un pequeño helper en **C#** (WinHelper) que habla con Windows: la música, el volumen, las salidas de audio y el portapapeles. Código comentado en español.

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
| 3 | IA: Claude Code y Antigravity en vivo (permisos, preguntas y planes desde la isla) y chat con Claude/Gemini | ✅ Hecha |
| 4 | Glow: colores que avisan de lo que pasa | ✅ Hecha |
| 5 | Clawd, la mascota, en la isla | ✅ Hecha |
| 6 | Home con widgets editables y links con su logo | ✅ Hecha |
| 7 | Portapapeles (historial) y bandeja de archivos | ✅ Hecha |
| 8 | «Casa de Clawd»: ventana de ajustes e historial | ⏳ Pendiente |
| 9 | La ventana: pantalla completa (Win32), bandeja de Windows (Tray), inicio con Windows, escala y auto-ocultar | ✅ Hecha |
| 10 | Motor de luz («Light Engine»): luz reactiva, 5 efectos, 16 eventos y derrame ambiental | ✅ Hecha |
| 11 | Teclado: gestos globales con Raw Input (Shift, Bloq Mayús, Ctrl+C/X/V, doble Ctrl derecho) y carga estilo Apple | ✅ Hecha |
| 12 | Tareas, agua y horario | ✅ Hecha |
| 13 | Búsqueda y comandos | ✅ Hecha |
| 14 | IA ampliada y selector de modelos | ✅ Hecha |
| 15 | Dictado por voz local (NAudio + Whisper.net) | ✅ Hecha |
| 16 | Pulido y ajustes: transiciones Glance, música, bandeja, Casa de Clawd | ✅ Hecha |
| A | Sistema de movimiento: tokens semánticos, factor global --motion-scale, curvas de muelle y monitor dev | ✅ Hecha |
| B | Morph de la isla: apertura elástica (ancho → alto → contenido), cierre suave (contenido → encoger), intercambio compacto, cambio de pestaña y micro-respuestas | ✅ Hecha |
| C | Avisos: pastilla temporal C1 con hover freeze y aviso que baja del notch C2 en degradado azul-violeta | ✅ Hecha |

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

`npm run build:helper` compila el helper de Windows y deja `WinHelper.exe` en `helpers/WinHelper/publish/`. Hay que repetirlo cada vez que cambia el código C# (por ejemplo, al actualizar a una fase que añade algo al helper, como el volumen de la Fase 1 o el portapapeles de la Fase 7). Cierra Notch antes de compilarlo: con Notch abierto, `WinHelper.exe` está en uso y no se puede sobrescribir.

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
| **Soltar archivos** | Al arrastrar archivos (del Explorador, del escritorio…) hasta la isla, se abre para recibirlos: «Suelta para guardarlo». Al soltar, confirma «Guardado en la bandeja» y, si la pulsas, abre la bandeja. Ver [Portapapeles y bandeja](#portapapeles-y-bandeja). |
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

- **Home**: tus widgets (Reloj, Música, Focus, IA, Links, Batería, Nota y Portapapeles), en una rejilla que tú eliges. Ver [Home y sus widgets](#home-y-sus-widgets).
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
- **Portapapeles**: lo último que copiaste y la bandeja de archivos. Ver [Portapapeles y bandeja](#portapapeles-y-bandeja).
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
| **Portapapeles** | El principio de lo último que copiaste | Los archivos de la bandeja (sus miniaturas y cuántos hay) | Abre Portapapeles |

**Modo edición: mantén pulsado 0,6 s** sobre cualquier widget (o sobre un hueco). Los widgets tiemblan y abajo, en lugar de las pestañas, aparece la barra de edición:

- **Arrastra** un widget para cambiarlo de sitio (sin soltar tras mantener pulsado, ya lo puedes mover). Los demás se apartan.
- **✕** lo quita y **⤢** cambia su tamaño (1×1 ⇄ 2×1). Si no cabe, te lo dice abajo.
- **Añadir** abre el catálogo con los que no están (o pulsa el **+** de un hueco libre).
- **Diseños**: 3 ya hechos, «Clásico» (el de por defecto), «Trabajo» y «Todo a la vista».
- **Listo** (o `Esc`, cerrar el panel o cambiar de página) termina.

Lo que elijas se guarda en `%APPDATA%\Notch\home.json` (no en `config/`: no hace falta tocarlo a mano).

**Novedades.** Un widget brilla con un borde de luz cuando su módulo tiene algo nuevo que aún no viste: Claude te espera o terminó (IA, en azul), el Pomodoro acabó (Focus), empezó otra canción (Música, con el color de la carátula), queda poca batería (Batería, en amarillo o rojo), cambiaste `links.json` (Links), la nota no se pudo guardar (Nota, en rojo) o soltaste archivos nuevos en la bandeja (Portapapeles; lo que copias no, que sería a todas horas). Al pasar el ratón por encima, tocarlo o abrir su página, se da por visto.

### Portapapeles y bandeja

La página **Portapapeles** (`Ctrl + Alt + 5`) tiene dos partes; arriba a la izquierda eliges cuál ves.

**Copiado**: los últimos **30 textos** que copias, en tarjetas (las fijadas, primero). Pulsa una y se **copia otra vez** (sube al principio: ya puedes pegarla con `Ctrl + V`).

- Cada tarjeta dice de qué programa vino («Google Chrome», «Visual Studio Code»…) y cuándo, y se dibuja según lo que parece: un **link** (con el logo de la web si es conocida, como los de Focus), un **color** (`#ff8a4c`, `rgb(…)`: con su muestra), un **correo**, una **ruta**, **código** (en letra de programador) o texto.
- **📌 Fijar** (al pasar el ratón): hasta 10. Las fijadas no se van al pasar de 30 ni con «Borrar».
- **✕** quita una; **Borrar** quita todas menos las fijadas (pide confirmación: el primer clic lo pone en rojo).
- **Buscar**: empieza a escribir con la página a la vista y va directo ahí (sin mayúsculas ni tildes). `Esc` borra la búsqueda.
- **⏸ Pausa**: mientras está en pausa, no se guarda lo que copias (por ejemplo, antes de copiar contraseñas desde una extensión del navegador). Al reiniciar Notch vuelve a escuchar.
- **Solo texto y solo en memoria**: nada se escribe en el disco y al cerrar Notch se olvida (también lo fijado). Las imágenes y los archivos copiados no se guardan.
- **Nunca las contraseñas de tu gestor**: Notch hace caso a las marcas que ponen los gestores de contraseñas (KeePass, 1Password, Bitwarden…) para que nadie guarde lo que copias de ellos, igual que el historial de Windows (`Win + V`). Ni siquiera lo lee.
- Con `"clipboard": false` en `settings.json` se apaga del todo (y se borra lo que había).

**Bandeja**: un sitio donde dejar archivos un rato, para llevarlos de una app a otra.

- **Suelta archivos sobre la isla** (o sobre el panel abierto). Puedes soltar varios a la vez, y carpetas. Caben 24.
- **Arrástralos hacia fuera** (al escritorio, a una carpeta, a un correo, a WhatsApp…) y se **copian** allí: el original no se mueve. **Arrastrar todo** saca todos a la vez.
- **Doble clic** (o el icono de la carpeta) abre el Explorador con el archivo marcado. **✕** lo quita de la bandeja; **Vaciar**, todos (los archivos siguen en su sitio).
- **Añadir…** elige archivos con la ventana de Windows (por si prefieres no arrastrar).
- Las fotos, vídeos y PDF salen con su **miniatura** (la misma del Explorador); los demás, con el icono de su tipo.
- Se guarda solo **la ruta** de cada archivo (en `%APPDATA%\Notch\bandeja.json`), nunca una copia, y sigue ahí al reiniciar. Si mueves o borras el archivo, sale apagado y con «No está».

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
  "clipboard": true,
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
| `clipboard` | `true` | `true`: guarda los últimos 30 textos que copias (solo en memoria; ver [Portapapeles y bandeja](#portapapeles-y-bandeja)). `false`: Notch ni mira el portapapeles (y olvida lo que había). La bandeja de archivos funciona igual. |
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
| `islandStyle` | `"notch"` | `"notch"`: la isla va pegada al borde de arriba. `"floating"`: flota 14 px más abajo, con degradado azul marino → violeta. En tema claro solo baja (sin degradado). |
| `glass` | `false` | Cristal simulado: relleno translúcido con brillo de luz en el borde. Si está activo, gana al degradado del estilo flotante. |
| `glassTint` | `"#101014"` | Tinte del cristal, en formato `#rrggbb` (cualquier otro valor se ignora). |
| `agentSweep` | `false` | Barrido de luz por el borde de abajo cada ~15 s mientras Claude Code o Antigravity trabajan. Medido: +0,3 puntos de CPU. |

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
  clipboard-history.js   la lista de lo copiado: 30 textos, fijados, repetidos (lógica pura)
  clipboard.js           el portapapeles: lo que manda el helper, pausa y volver a copiar
  tray.js                la bandeja de archivos (bandeja.json), miniaturas y arrastrar hacia fuera
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
    wave.js              la ola de la barra de progreso (en un canvas)
    beat.js              el reloj de pasos de lo que se mueve sin parar (gasta poco)
    eq.js                las barritas del ecualizador (suaves, con muelle)
    backdrop.js          el fondo de la página Música (manchas que se mueven despacio)
    ai.js                Claude Code y Antigravity: isla, decisiones y página IA
    chat.js              el chat de la página IA
    glow.js              el brillo de color alrededor de la isla
    clawd.js             Clawd: qué hace, sus acciones, bailes y disfraces
    home.js              Home: la rejilla, el modo edición, las novedades y guardarlo
    home-grid.js         dónde cae cada widget en la rejilla de 4×2 (funciones puras)
    clip-page.js         la página Portapapeles: sus dos partes (Copiado y Bandeja)
    clipboard.js         lo que copiaste: tarjetas, fijar, buscar y pausa
    tray.js              la bandeja y soltar archivos sobre la isla
    clock.js, eyes.js, pomodoro.js, music.js, links.js, utils.js
  widgets/               Un archivo por widget de Home:
    index.js             el catálogo (y los 3 diseños)
    clock.js, music.js, focus.js, ai.js, links.js, battery.js, note.js, clipboard.js
helpers/WinHelper/
  WinHelper.csproj       Proyecto C# (.NET 8, Windows 10 2004 o superior)
  Program.cs             Arranca los módulos y habla con Notch (stdin/stdout)
  MediaModule.cs         La música (sesión multimedia de Windows)
  VolumeModule.cs        El volumen (Core Audio)
  AudioDevicesModule.cs  Las salidas de audio y cambiar la predeterminada
  ClipboardModule.cs     Lo que copias (solo texto), por avisos de Windows
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
  - Electron lo lanza como proceso hijo. El helper escribe en su salida estándar (stdout) **una línea JSON por cada cambio**, con un campo `type` que dice de qué trata (`media`, `volume`, `audio-devices`, `audio-output-result`, `clipboard` o `clipboard-status`), y `main/helper.js` la reparte al módulo que corresponde. Para la música trae título, artista, álbum, estado, posición, duración, app y carátula. Recibe órdenes por su entrada estándar (stdin): `play`, `pause`, `toggle`, `next`, `previous`, `seek`, `refresh`, `audio-devices`, `set-output` y `clipboard on`/`off`.
  - Apple Music manda «Artista — Álbum» juntos en el artista: Notch los separa.
  - Funciona solo por avisos de Windows: no comprueba nada periódicamente.
  - La carátula se reduce a 300 px en JPEG y **solo viaja cuando cambia**.
  - Si el helper se cierra, Electron lo reinicia esperando cada vez más (2 s, 4 s… hasta 1 minuto). Al salir de Notch, el helper se cierra con él.
- **Pantalla completa por eventos (Win32).** `WinHelper` registra una AppBar (`SHAppBarMessage` con `ABM_NEW`) y consulta `SHQueryUserNotificationState` (`QUNS_RUNNING_D3D_FULL_SCREEN`, `QUNS_BUSY`, `QUNS_PRESENTATION_MODE`), respaldado por un hook `SetWinEventHook(EVENT_SYSTEM_FOREGROUND)`. En cuanto abres un juego o vídeo a pantalla completa, la isla se oculta de inmediato y el reloj `beat.js` detiene todos sus temporizadores, garantizando 0% de CPU y cero interferencia gráfica con tus partidas.
- **Bandeja del sistema (System Tray).** Icono de Notch en el área de notificación de Windows 11 con menú contextual («Casa de Clawd», «Pausar isla», «Iniciar con Windows» y «Salir»). Un clic izquierdo en el icono abre o cierra el panel de Notch.
- **Escala, monitor y margen superior.** Ajustes configurables para elegir el monitor (`monitor`), margen superior (`topGap`, 0 a 12 px) y zoom de la isla (`scale`, del 80 al 130 %) con `setZoomFactor` y dimensionado proporcional de la ventana fija.
- **Auto-ocultación tras inactividad.** Con `autoHideIdle: true`, si no hay música ni tareas en vivo durante 30 segundos, la mini-muesca se encoge a una sutil línea de 120 × 6 px pegada al borde superior, despertando automáticamente al acercar el cursor.
- **Volumen con Core Audio.** El mismo helper escucha el volumen de tu salida de audio con las interfaces COM de Windows (`IAudioEndpointVolumeCallback` y, para cuando cambias de altavoces a auriculares, `IMMNotificationClient`). Windows le avisa en cada cambio; al arrastrar el control llegan decenas de avisos seguidos y los junta en uno cada 40 ms. Windows 11 no deja ocultar su propio indicador de volumen, así que se ven los dos (o pon `"volumeIndicator": false`).
- **Portapapeles por avisos.** El helper crea una ventana invisible «de solo mensajes» (no se ve, ni sale en la barra de tareas) y se apunta con `AddClipboardFormatListener`: Windows le manda `WM_CLIPBOARDUPDATE` cada vez que alguien copia algo. Espera 60 ms (algunos programas copian en varios pasos) y solo entonces lo mira: si trae `ExcludeClipboardContentFromMonitorProcessing`, `Clipboard Viewer Ignore` o `CanIncludeInClipboardHistory = 0` (las marcas de los gestores de contraseñas), ni lo lee; si no es texto o pasa de 100 000 caracteres, tampoco. De quién vino lo saca del dueño del portapapeles (`GetClipboardOwner` → su programa). La ventana y su hilo solo existen si Notch se lo pide (`clipboard on`), y con `clipboard off` deja de mirar. `main/clipboard.js` guarda los textos **en memoria** y a la página solo le manda el principio de cada uno (1500 caracteres); al pulsar una tarjeta, `main.js` copia el texto entero con `clipboard.writeText`. Si el helper no contesta a `clipboard on` en 5 s (uno sin recompilar), la página pide recompilarlo.
- **Soltar en una ventana que deja pasar los clics.** Mientras la ventana ignora el ratón, Windows tampoco le deja recibir archivos. Pero `forward: true` sigue mandando sus movimientos a la página también mientras arrastras, así que la isla se despierta y «atrapa» el ratón como siempre; entonces Windows ya le deja recibir el arrastre. Si sales de la isla, la ventana vuelve a dejar pasar el ratón y el arrastre pasa a las ventanas de abajo. La página nunca ve las rutas de lo que sueltas: `preload.js` las saca con `webUtils.getPathForFile` y se las pasa a `main/tray.js`.
- **Sacar archivos.** Al empezar a arrastrar un archivo de la bandeja, la página cancela el arrastre «de página web» y `main.js` empieza uno de verdad con `webContents.startDrag` (el mismo que haría el Explorador), con la miniatura bajo el cursor. Solo permite **copiar** (o crear un acceso directo): nunca mueve el original. Las miniaturas salen de Windows (`nativeImage.createThumbnailFromPath`) y, si no tiene, el icono de su tipo (`app.getFileIcon`).
- **Letras de LRCLIB.** Al cambiar de canción, `main/lyrics.js` mira primero su caché (`%APPDATA%\Notch\lyrics\`, un archivo por canción). Si no la tiene, espera 1,5 s (por si estás pasando canciones) y pregunta a LRCLIB: primero la búsqueda exacta (`/api/get`, con título, artista, álbum y duración) y, si no la encuentra, la aproximada (`/api/search`, quitando cosas como «(feat. …)» o «- Remastered»). Guarda la respuesta, también el «no hay letra» (lo vuelve a intentar a los 7 días). Si LRCLIB no contesta en 10 s o no hay internet, la página ofrece «Reintentar». Sin artista (un vídeo cualquiera) no busca, para no traer la letra de otra canción.
- **La línea que suena, sin sondeos.** La página calcula en qué línea vas con la posición interpolada y programa **un solo temporizador** para el instante exacto de la siguiente; si pausas, saltas o cambias de canción, lo recalcula. Solo funciona con la página Música a la vista.
- **Colores con k-means.** La carátula se reduce a 16 × 16 píxeles y se agrupan los píxeles parecidos en 3 grupos; el color medio de cada uno pinta los degradados y el más vivo es el color de acento. Son variables CSS registradas con `@property`, así que cambian de una canción a otra con una transición suave.
- **Salida de audio.** El helper lista las salidas con Core Audio (`IMMDeviceEnumerator`) y se entera de los cambios por avisos de Windows. Para cambiar la predeterminada usa `IPolicyConfig`, la interfaz que usa la propia configuración de sonido de Windows. ⚠️ Microsoft no la documenta: funciona de Windows 7 a Windows 11, pero si algún día cambia, Notch solo mostrará el aviso «No se pudo cambiar la salida de audio».
- **Muelles de verdad.** La isla cambia de forma con curvas de muelle amortiguado (escritas con `linear()` en `styles.css`): al crecer se pasa un poco y se asienta, como en el iPhone; al encoger, se asienta sin rebotar. Al pulsarla se hunde un poco. Al cambiar de forma, lo que se va se desenfoca y lo que llega se enfoca; el contenido del panel entra igual, en cascada.
- **Iconos dibujados a mano.** Son SVG propios al estilo de los de Apple (rellenos y con las puntas redondeadas), definidos una sola vez en `index.html` y reutilizados con `<use>`: no se descarga ninguna fuente de iconos. La ola de la barra la dibuja `wave.js` en un `<canvas>` (lo que ya sonó y lo que falta): para cada punto, altura = envolvente × amplitud × seno; la envolvente la hace nacer y morir plana. Mientras suena, fluye y avanza 24 veces por segundo, solo con la página Música a la vista; en pausa, en cuanto se calma, se para. Al principio eran dos `<path>` de SVG, pero cada cambio obligaba a Chromium a recalcular estilos, maquetar y repintar: era lo que más gastaba de la página.
- **Clawd.** Es un SVG dentro de `index.html` (para poder animar sus patas, brazos, ojos y gorros con CSS): 18 × 10 «píxeles», cada uno de 1 px en la mini-muesca y de 2 px en la píldora. `clawd.js` decide qué hace (`data-mode`) y su expresión (`data-eyes`) cada vez que la isla revisa su forma; lo que se mueve mientras dura (teclear, bailar, caminar, las «z») va a saltos de píxel, como un juego retro, con el reloj de pasos de `beat.js` (ver «Bajo consumo») y solo mientras se ve; las «z» suben 12 s y luego se quedan quietas (si duerme, es que no estás mirando). Parpadear, mirar al ratón y alrededor siguen en `eyes.js`, que mueve la cara que toque. Para saber si estás delante, `main/idle.js` pregunta cada 30 s cuánto llevas sin tocar el PC (`powerMonitor.getSystemIdleTime`), cada 3 s mientras duerme para despertarse enseguida, y escucha los avisos de bloquear, desbloquear, suspender y reanudar. La despedida es un único temporizador hasta esa hora.
- **Teclado con Raw Input (Win32).** Un módulo en C# (`KeyboardModule.cs`) registra un receptor de entrada cruda (`RegisterRawInputDevices` con `RIDEV_INPUTSINK`) en un hilo STA con ventana oculta. Detecta de forma global y sin lag:
  - `Shift` (destello sutil al pulsar o soltar).
  - `Bloq Mayús` (aviso de estado activo/inactivo).
  - `Ctrl+C` (copiar), `Ctrl+X` (cortar) y `Ctrl+V` (pegar): enlazados instantáneamente con las animaciones de barrido luminosas de la isla en cualquier programa de Windows.
  - `Doble Ctrl derecho` (< 350 ms): abre o cierra el panel al instante.
  - **Privacidad estricta:** Notch NUNCA registra ni guarda texto ni pulsaciones generales. Se suspende automáticamente al jugar a pantalla completa.
- **Aviso de carga estilo Apple Dynamic Island.** Al conectar el cargador, la isla se expande con un muelle ágil a una píldora con el rayo verde pulsante, la etiqueta «Cargando», el porcentaje en negrita y el icono de la pila con su nivel real. Se oculta suavemente tras 2,6 segundos.
- **Motor de luz («Light Engine»).** La isla «emite luz» alrededor de su contorno y proyecta un derrame ambiental suave hacia abajo (`#island-spill` en `#stage`, fuera de la isla para no ser recortado por `overflow: hidden`). Se organiza en una jerarquía estricta de prioridades con preclusión (preemption) automática:
  1. **Crítica** (Claude pide permiso): contorno con respiración ámbar (`#F59E0B`).
  2. **Alta** (Claude terminó, Focus terminado, aviso urgente): barrido turquesa o verde (`#2DD4BF` / `#22C55E`).
  3. **Media** (cargador enchufado/desenchufado, batería baja, copiar, cortar, pegar, volumen): llenados proporcionales y barridos direccionales (de izquierda a derecha para copiar, derecha a izquierda para pegar).
  4. **Ambiente** (música sonando, IA pensando): contorno suave continuo mientras está activa la reproducción o tarea. Si ocurre un aviso de mayor prioridad (ej. permiso o cargador), la luz ambiente se suspende y se restaura sola automáticamente al finalizar el aviso prioritario. Cero coste en reposo: 0% CPU.
- **El brillo.** Es un `filter: drop-shadow(...)` sobre la propia isla: sigue su forma (mini, píldora, tarjeta) y no lo recorta el `overflow: hidden`. `glow.js` solo decide el estado (`data-glow`) cuando la isla revisa su forma, al pasar el ratón o al abrir el panel; un único temporizador apaga el verde. El latido de la atención es una animación CSS del filtro: late 4 veces y se queda encendido (un brillo que late sin parar haría redibujar la ventana 60 veces por segundo). Sin brillo, las sombras son transparentes, y con el panel abierto no hay filtro.
- **Servidor de la IA.** `main/ai-server.js` escucha solo en `127.0.0.1` y exige el token (`Authorization: Bearer …`, comparado en tiempo constante). Rechaza las peticiones de navegadores (con cabecera `Origin`) y las que no van dirigidas a `127.0.0.1` o `localhost` (así una web no puede hablarle), y como mucho acepta 1 MB por petición. Responde al momento salvo cuando algo espera tu respuesta.
- **Decisiones.** Un permiso, una pregunta o un plan dejan la petición de Claude Code abierta: la isla enseña la tarjeta y, cuando eliges, Notch contesta con el JSON que dice la documentación de Claude Code (`decision.behavior` en los permisos; `permissionDecision` con `updatedInput` en las preguntas y los planes). Si Claude Code cuelga antes (respondiste en la terminal o se agotó su tiempo), la tarjeta se va sola. Un temporizador por decisión (590 s) y otro por sesión (se olvida a los 45 minutos sin señales): nada de sondeos.
- **Chat.** `main/ai-chat.js` busca los programas con `where.exe`, prefiere el `.exe` y, si solo hay un `.cmd` (instalado con npm), lo lanza con `cmd.exe` pasándole solo argumentos de Notch: tu texto va por la entrada estándar. Lee su salida línea a línea (`stream-json`) y se la manda a la página a trozos (cada 50 ms). «Parar» cierra el programa con todo lo que haya abierto (`taskkill /T`).
- **Batería por eventos.** La página usa la API de batería de Chromium (`navigator.getBattery()`), que avisa cuando cambia el nivel o enchufas el cargador. Avisa una vez al bajar del 20 % y otra del 10 %, y vuelve a avisar tras cargarlo.
- **Centro de avisos.** Solo los de Notch (Pomodoro, batería, errores de configuración, atajos, helper y la IA). Viven en memoria: al cerrar Notch se olvidan. Notch no puede leer las notificaciones de otras apps (Windows solo lo permite a las instaladas desde la Microsoft Store).
- **Tema.** `main/theme.js` aplica `theme` con `nativeTheme` (así el menú del clic derecho también cambia) y le dice a la página qué tema toca; la página lo pone en `<html data-theme>`. Con `"auto"`, si cambias el modo de Windows, el panel cambia solo.
- **Nota rápida.** Se escribe primero en un archivo temporal y luego se renombra: si se apaga el PC a mitad, la nota anterior sigue entera. Si `nota.md` no se puede leer, la página queda en solo lectura para no pisarla nunca.
- **Posición interpolada.** Las apps solo actualizan la posición de vez en cuando. El helper la ajusta al momento exacto en que la mide (Windows indica cuándo fue su última actualización). Notch guarda esa posición y la hora de la medición, y mientras suena calcula la posición actual por su cuenta: posición + tiempo transcurrido.
- **Pomodoro en `main.js`.** Chromium frena los temporizadores de las páginas que no se ven, así que el temporizador vive en el proceso principal. Es un único `setTimeout` que salta justo al terminar.
- **Links seguros.** La página nunca recibe las URLs: para abrir un link, pide su número y `main.js` lo abre con `shell.openExternal`.
- **Logos sin conexión.** `main/link-logos.js` lee la lista de Simple Icons (`icons.json`, del paquete npm) solo al cargar `links.json` y no la guarda en memoria; de cada logo solo pasa a la página el dibujo (el `d` de su `<path>`, comprobado con la expresión regular de Simple Icons), que la página pinta con `createElementNS`: nunca `innerHTML`.
- **Home.** Los widgets van en orden y `home-grid.js` coloca cada uno en el primer hueco donde cabe (de izquierda a derecha y de arriba abajo), así que con 8 celdas o menos siempre caben. Al arrastrar, prueba cada posición de la lista y se queda con la que deja el widget bajo el ratón; los demás se deslizan a su sitio nuevo con la técnica FLIP (medir antes, colocar, medir después y animar la diferencia). Cada widget dice sus novedades como una lista de «motivos» (como el brillo de la isla): brilla si hay alguno que no habías visto. `main/home.js` revisa lo que le llega (tipos, tamaños, sin repetir, 8 celdas como mucho) y escribe `home.json` como la nota: primero un temporal y luego lo renombra.
- **Seguridad.** La página no tiene acceso a Node (`contextIsolation`, `sandbox`, sin `nodeIntegration`). Solo puede usar las funciones que `preload.js` expone en `window.notch`, y su Content-Security-Policy le impide cargar nada externo. Las órdenes al helper pasan por una lista blanca.
- **Bajo consumo.** No hay sondeo periódico (polling) en ninguna parte.
  - **Nada de animaciones CSS infinitas.** Una animación que no para obliga a Chromium a redibujar la ventana 60 veces por segundo aunque casi no cambie, y en una ventana transparente eso cuesta: con música sonando, el ecualizador y el baile de Clawd hacían gastar a Notch unas 4 veces más CPU que ahora. Lo que se mueve mientras dura un estado avanza con un único reloj, `beat.js`, y solo mientras se ve: Clawd bailando, tecleando o durmiendo (es pixel art), los iconos de la IA que giran y el fondo de la página Música van a 8 pasos por segundo; las barritas del ecualizador (con un muelle amortiguado, paseo aleatorio por barra y `will-change: transform`, bajando suave al pausar antes de parar el reloj), la ola y la letra de la página Música van con el mismo reloj a 24 por segundo (uno de cada tres coincide con un paso: no suman dibujos). Lo que solo avisa (el brillo de atención, el borde de novedades de los widgets, los iconos que esperan tu respuesta) late unas pocas veces y se queda quieto.
  - El reloj y los tiempos de la música solo se actualizan con el panel abierto, una vez por segundo. Las horas, los minutos, el Pomodoro y los porcentajes «ruedan», como en el iPhone; los segundos del reloj, no (rodarían sin parar).
  - El fondo animado, la letra que se ilumina y la barra continua solo se mueven con la página Música a la vista y la música sonando; al cerrar el panel o cambiar de página, se paran.
  - El volumen, la batería, el tema, los atajos y el portapapeles funcionan por avisos del sistema.
  - La bandeja no vigila tus archivos: comprueba que siguen en su sitio solo al abrirla.
  - La cuenta atrás del Pomodoro solo se dibuja cuando se ve.
  - Los widgets de Home no tienen temporizadores propios: el reloj se mueve con el de la barra de arriba (solo con el panel abierto) y la barra de la música avanza sola, a saltos de un segundo, con una animación del navegador que se para al cerrar el panel o cambiar de página.
  - Las demás animaciones son cortas y se lanzan por eventos.
  - Medido (en el equipo de pruebas, sin tarjeta gráfica): en reposo ~0,2 % de CPU; con música o con Claude trabajando y el panel cerrado, ~2 %; con la página Música abierta, ~7 %. La memoria (250-300 MB) es lo normal en una app de Electron: lleva dentro un Chromium entero.
  - Notch anima aunque Windows tenga apagados los «Efectos de animación» (muchos portátiles gamer vienen así). Para que le haga caso a Windows, pon `"animations": "system"`; para no animar nada, `"off"` (entonces la línea de la letra se ve entera iluminada).

## Privacidad

Sin telemetría ni analíticas. La **única** conexión a internet que hace Notch es **LRCLIB** (<https://lrclib.net>), una base de datos libre de letras: por cada canción nueva le manda el **título, el artista, el álbum y la duración** (nada más: ni quién eres ni qué más haces), y solo si no tenía ya la letra guardada. Con `"lyrics": false` en `settings.json` no hay ninguna conexión.

**Clawd.** Para saber si estás delante del PC, Notch solo pregunta a Windows cuántos segundos llevas sin tocar el ratón ni el teclado (no qué haces); no se guarda ni se manda a ningún sitio.

**IA.** El servidor de la IA solo escucha en tu PC (`127.0.0.1`) y solo recibe lo que Claude Code (o Antigravity) le manda. **Notch no manda nada a Anthropic ni a Google por su cuenta.** El chat no lo hace Notch: lanza tus propios programas (`claude`, `agy` o `gemini`) solo cuando escribes, y lo que escribas va solo a quien elijas (**Claude → Anthropic**, **Gemini → Google**). La conversación vive en memoria (a Claude además se le pide que no la guarde) y se olvida al cerrar Notch. Con `"ai": false` no hay servidor.

El corrector ortográfico que trae Electron descargaba diccionarios de Google al arrancar: está desactivado (la nota no lo usa) y esa descarga se redirige a tu propio PC. Tu nota, tus avisos, tu configuración, tus widgets de Home (`%APPDATA%\Notch\home.json`) y la caché de letras (`%APPDATA%\Notch\lyrics\`, se puede borrar cuando quieras) se quedan en tu PC. Los logos de los links vienen dentro de Notch (Simple Icons): no se descarga ninguno.

**Portapapeles.** Lo que copias se queda **solo en la memoria** de Notch: nunca se escribe en el disco ni sale de tu PC, y se olvida al cerrar Notch. Notch no lee lo que los gestores de contraseñas marcan como privado. Con la pausa (o `"clipboard": false`), no mira el portapapeles. De la **bandeja** solo se guarda la ruta de cada archivo, en `%APPDATA%\Notch\bandeja.json`; los archivos no se copian ni se suben a ningún sitio.

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
- **Portapapeles dice «Hay que recompilar el helper».** Tu `WinHelper.exe` es de antes de la Fase 7: cierra Notch, ejecuta `npm run build:helper` y vuelve a abrirlo.
- **No guarda algo que copié.** Puede que el programa lo marcara como privado (los gestores de contraseñas lo hacen), que no fuera texto (una imagen, unos archivos), que pasara de 100 000 caracteres o que estuviera en pausa (el botón ⏸ en amarillo). Las contraseñas que copias desde una **extensión del navegador** no llevan esa marca: pon la pausa antes de copiarlas, o quítalas después con ✕.
- **No puedo soltar archivos en la isla.** Acerca el archivo a la mini-muesca y espera un instante a que se despierte (con `"revealOnHover": false` no se despierta: suelta sobre la isla cuando esté grande, o abre el panel y suéltalo encima). También puedes usar **Añadir…** en la bandeja.
- **Un archivo de la bandeja sale «No está».** Lo moviste, lo borraste o estaba en un USB que ya no está conectado. Quítalo con ✕ (si vuelve a aparecer en su sitio, al abrir la bandeja se recupera solo).
- **Al sacar un archivo de la bandeja, el original sigue donde estaba.** Es a propósito: siempre se copia, nunca se mueve.
- **¿Cuánto debería gastar?** En reposo, casi nada de CPU (por debajo del 1 %). Con música sonando o Claude trabajando sube un poco (Clawd baila o teclea y el ecualizador se mueve), y más con el panel abierto en Música (la ola, la letra y el fondo), pero solo mientras lo miras. La memoria, 250-300 MB, es lo normal en una app de Electron (lleva dentro un Chromium entero, con varios procesos). Si quieres que gaste aún menos: `"animations": "off"` (nada se mueve), `"glow": false` (sin brillo) o `"clawd": false`.
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

---

## Fase 12: Tareas, Agua y Horario

- **Tareas en la página Nota (Ctrl+Alt+6):** Nuevo selector segmentado para alternar entre tu nota rápida de siempre y tu lista de tareas. Añade tareas pulsando Enter, márcalas como urgentes (rosa `#F43F5E`) o asígnales hora límite. Las tareas completadas se tachan al final y se purgan solas cada nuevo día en `%APPDATA%\Notch\tareas.json`.
- **Recordatorio inteligente de agua:** Notch te recuerda hidratarte cada hora (solo entre las 7:00 y las 22:00) con aviso en la isla y luz celeste. Se recalcula solo al suspender y reanudar Windows sin gastar CPU.
- **Horario semanal:** Programación de eventos recurrentes en `%APPDATA%\Notch\eventos.json` con temporizadores exactos.
- **Historial de Focus:** Acumula minutos diarios de concentración en `%APPDATA%\Notch\focus.json` y premia 4 bloques de Pomodoro con aviso de descanso largo de 15 minutos.

---

## Fase D: Animación de Batería y Ajustes de Enfoque

- **Animación de batería limpia (estilo Apple Dynamic Island):** Al conectar el cargador, la isla se expande ágilmente mostrando el rayo verde, porcentaje y nivel de carga sin anillos externos sobrecargados.
- **Temporizador de enfoque:** Concluir un bloque de concentración emite el aviso C1 («🍅 ¡Bloque terminado!») y preserva el diseño limpio de la cápsula.

---

## Fase E: Acabado visual y Casa de Clawd renovada (v0.21.0)

- **Estilo flotante (`islandStyle`):** la isla, sus burbujas y el derrame de luz bajan 14 px juntos (un solo `translate` de 420 ms con muelle). La ventana fija crece 14 px solo en ese estilo para no cortar la sombra; sin clics perdidos fuera de la isla.
- **Cristal simulado (`glass`, `glassTint`):** relleno translúcido (80 %) con brillo en el borde superior. La ventana es transparente, así que `backdrop-filter` no difuminaría el escritorio: es cristal *simulado*, no real. Contraste AA comprobado sobre un escritorio blanco.
- **Casa de Clawd:** ahora **guarda y aplica** los ajustes. La causa era que `main/bridge.js` solo atendía a la ventana de la isla y descartaba en silencio lo que mandaba la Casa. Desde ahora la Casa solo puede usar 7 canales: `settings:get`, `settings:save-key`, `app:get-version`, `app:open-data-folder`, `lyrics:clear-cache`, `ai:get` y `ai:copy-setup`. Además, `settings:save-key` solo acepta claves que existan en los ajustes por defecto, la Casa lleva la misma CSP que la isla y corre con `sandbox: true`.
- **Interfaz de la Casa:** interruptores tipo iOS, selectores y deslizadores propios, y tema claro/oscuro (sigue `"theme"`).
- **Botones en la barra del panel:** micrófono (dictado), IA rápida y engranaje (Casa de Clawd). Los atajos siguen funcionando igual.

**Privacidad:** esta fase no añade ninguna conexión de red. La Casa sigue sin acceso a Internet (CSP `default-src 'none'`).

**Solución de problemas**

- **Cambié algo en la Casa y no pasa nada.** Mira la terminal de `npm run dev`: debe aparecer `[config] settings.json recargado.` Si el archivo tiene un error de JSON, Notch no lo sobrescribe y lo avisa.
- **El estilo flotante no tiene degradado.** En tema claro (`"theme": "light"` o Windows en claro con `"auto"`) solo baja la isla. También se oculta el degradado si activas `glass`.
- **El cristal se lee mal sobre mi escritorio.** Prueba un `glassTint` más oscuro o desactiva `glass`.

---

## Fase F: Luz de escucha y borde de agente (v0.22.0)

- **Luz de escucha (F1):** al dictar con voz, un halo azul y blanco aparece alrededor de la isla (200 ms) y su intensidad **sigue el nivel de tu micrófono** (sube en 60 ms, baja en 220 ms). Solo corre mientras grabas, solo anima `opacity` y `scale`, y se apaga en 300 ms. Con `"animations": "off"` queda fijo.
- **Borde de agente (F2):** mientras Claude Code o Antigravity trabajan, la isla lleva un borde de 1,5 px en degradado naranja → rosa → violeta. Al empezar da **una sola vuelta** (1,6 s) con 3 respiraciones y luego queda fijo (nunca gira sin parar). Al terminar pasa a verde agua con un barrido y se apaga (~1,2 s). Si pide permiso: ámbar, 4 respiraciones y fijo hasta que respondas; esa luz gana a la de "trabajando".
- **Barrido opcional (`agentSweep`):** una pasada de luz cada ~15 s mientras trabaja. Apagado por defecto; se activa en la Casa de Clawd (Apariencia y luz).
- **Arreglos de paso:** la luz de "pide permiso" ya se apaga al responder (antes se quedaba encendida), la IA rápida usaba un evento de luz inexistente (`aiDone`) y las respiraciones de aviso eran infinitas (ahora son 3 o 4 y luego quedan fijas).

**Consumo medido** (panel cerrado, música sonando, referencia ~2 %): borde de agente fijo ≈ +0,6 puntos de media (mediana sin diferencia), halo de escucha ≈ +0,06, barrido ≈ +0,3 (sin `filter`; con la sombra `drop-shadow` heredada costaba ~+1).

**Privacidad:** el nivel del micrófono solo se usa para dibujar el halo; no se guarda ni sale del PC.

**Solución de problemas**

- **No veo el borde de agente.** Comprueba que `"light": true` y que Notch recibe eventos de Claude Code (Casa de Clawd → Claude Code: servidor en verde).
- **El halo no aparece al dictar.** Necesita `"light": true`; si el micrófono está bloqueado por Windows, el dictado no empieza (ver la sección de voz).

