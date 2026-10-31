# Notch

Isla dinámica estilo iPhone para **Windows 11**: una píldora negra con dos ojos verdes en la parte superior de la pantalla que, con **Ctrl + Alt + T**, se despliega en un panel con fecha, hora y pestañas.

Hecha con **Electron + HTML/CSS/JS sin frameworks**. Código comentado en español.

## Estado

| Fase | Contenido | Estado |
| --- | --- | --- |
| 1 | El notch: ventana, animación, reloj, pestañas, clics que atraviesan | ✅ Hecha |
| 2 | Focus (Pomodoro) y links | ⏳ Pendiente |
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

| Acción | Resultado |
| --- | --- |
| `Ctrl + Alt + T` | Abre o cierra el panel (desde cualquier app) |
| Clic en la píldora | Abre el panel |
| `Esc` | Cierra el panel y devuelve el foco a la app que estabas usando |
| Clic fuera del panel | Cierra el panel |
| Clic derecho en el notch | Menú: abrir/cerrar y **Salir de Notch** |
| `Alt + F4` con el panel abierto | Solo cierra el panel (no sale de la app) |

Los clics **fuera** de la píldora cerrada llegan a las ventanas de debajo, como si el notch no estuviera ahí.

## Configuración

Edita `config/settings.json` y **reinicia Notch** para aplicar los cambios:

```json
{
  "shortcut": "Control+Alt+T",
  "locale": "es-ES",
  "hour12": false
}
```

| Clave | Por defecto | Qué hace |
| --- | --- | --- |
| `shortcut` | `"Control+Alt+T"` | Atajo global para abrir y cerrar. Usa el [formato de atajos de Electron](https://www.electronjs.org/docs/latest/api/accelerator), por ejemplo `"Control+Shift+Space"` o `"Alt+N"`. |
| `locale` | `"es-ES"` | Idioma de la fecha: `"es-MX"`, `"es-CO"`, `"en-US"`… |
| `hour12` | `false` | `true` muestra el reloj en formato de 12 horas (a. m./p. m.). |

Si el archivo tiene un error de sintaxis, Notch arranca con los valores por defecto y lo avisa en la terminal.

## Compilar (crear el `.exe`)

```bash
npm run pack
```

Crea la carpeta `dist\win-unpacked\` con `Notch.exe`. Es rápido y sirve para probar la versión empaquetada.

```bash
npm run dist
```

Crea el instalador `dist\Notch Setup 0.1.0.exe`: se instala solo para tu usuario, sin pedir permisos de administrador.

En la versión empaquetada, la carpeta `config` está en `resources\config`, junto a `Notch.exe` (con el instalador: `%LOCALAPPDATA%\Programs\notch\resources\config`). Edita los archivos de esa carpeta.

## Estructura del proyecto

```text
main.js              Proceso principal: ventana, atajo global, clics, foco y configuración
preload.js           Puente seguro (contextBridge) entre main y la página
renderer/
  index.html         Estructura del notch (píldora, panel y pestañas)
  styles.css         Aspecto y animaciones (aquí se cambian colores y tamaños)
  app.js             Lógica de la interfaz: abrir/cerrar, reloj, pestañas, parpadeo
config/
  settings.json      Tu configuración
  links.json         (Fase 2) Tus links
helpers/MediaHelper/ (Fase 3) Helper en C# que lee la música de Windows
```

## Cómo funciona

- **Una ventana fija y transparente.** Mide 800 × 308 px, siempre lo mismo: lo que ocupa el panel abierto más un margen para la sombra. La animación píldora → panel se hace con CSS dentro de esa ventana, porque redimensionar ventanas transparentes en Windows produce parpadeos.
- **Siempre visible, pero discreta.** No tiene marco, está siempre por encima del resto, no aparece en la barra de tareas ni en `Alt + Tab` y se coloca centrada arriba del **monitor principal**. Si cambias de monitor, de resolución o de escala, se recoloca sola.
- **Clics que atraviesan.** La ventana ignora el ratón con `setIgnoreMouseEvents(true, { forward: true })`, así que los clics pasan a lo que hay debajo. Gracias a `forward`, la página sigue recibiendo los movimientos del ratón: cuando el cursor entra en el notch, `app.js` avisa a `main.js` y la ventana vuelve a aceptar clics. Cuando sale, los deja pasar otra vez.
- **Foco.** Al abrirse, el notch toma el foco para recibir `Esc` y para saber, con el evento `blur`, cuándo haces clic fuera. Al cerrarse con `Esc` o con el atajo, devuelve el foco a la app que estabas usando.
- **Seguridad.** La página no tiene acceso a Node (`contextIsolation`, `sandbox`, sin `nodeIntegration`). Solo puede usar las 6 funciones que `preload.js` expone en `window.notch`, y su Content-Security-Policy le impide cargar nada externo.
- **Bajo consumo.** No hay ningún sondeo periódico (polling). El reloj solo funciona con el panel abierto y se actualiza una vez por segundo. Los ojos parpadean con una animación corta cada 2,5–6 s, en lugar de una animación infinita.

## Privacidad

Sin telemetría ni analíticas. La Fase 1 no hace **ninguna** conexión de red. La única conexión externa del proyecto llegará en la Fase 4: LRCLIB, para descargar letras.

## Solución de problemas

- **El atajo no hace nada.** Otra app ya usa esa combinación. Mira la terminal: aparece el aviso `[atajo] No se pudo registrar…`. Cambia `shortcut` en `config/settings.json` y reinicia. Mientras tanto, puedes abrir el panel haciendo clic en la píldora.
- **No veo el notch.** Aparece en el monitor **principal**: ve a *Configuración → Sistema → Pantalla*, elige el monitor y marca «Convertir en la pantalla principal».
- **No sale encima de un juego.** Los juegos en pantalla completa exclusiva tapan todas las ventanas. En modo «ventana sin bordes», el notch sí se ve.
- **`npm run dist` falla con «Cannot create symbolic link».** Activa el modo de desarrollador de Windows (*Configuración → Sistema → Para programadores*) o ejecuta la terminal como administrador y vuelve a intentarlo.
- **`npm start` dice que la versión de Node no es compatible.** Actualiza Node.js a 22.12 o superior.
