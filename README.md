# Recepción de mercadería · Zebra TC27

App web liviana (PWA) para recibir mercadería caja por caja contra el packing list, en
una TC27 con Android 14. Funciona **100 % sin conexión** una vez instalada: sin backend,
sin frameworks y sin paso de compilación. Cada caja se asigna sola a un pallet según su
SKU y, al terminar, la app exporta un Excel con productos, cajas y kilos por pallet.

## Cómo trabaja

**Packing list.** Es el Excel del proveedor (`.xls` o `.xlsx`) con **una fila por caja**,
hoja `Nro Packing List`. La app usa tres columnas:

| Columna | Encabezado | Para qué |
|---|---|---|
| **E** | Num Caja | Lo que lee el escáner. Identifica la caja |
| **Q** | Kilos | Kilos de esa caja (peso fijo, tomado del packing list) |
| **AZ** | Descripción | El producto: agrupa las cajas y define el SKU de cada pallet |

- **Detección de columnas.** La app las busca por el nombre del encabezado, en cualquier
  hoja y fila; si no las encuentra por nombre, usa las letras E, Q y AZ. Antes de iniciar
  muestra el resultado (hoja, columnas, cajas, productos y kilos) y cualquier columna se
  puede cambiar. La elección queda guardada para la próxima carga.
- **Esperado por producto.** Las cajas esperadas de cada producto son sus filas; los kilos
  esperados, la suma de la columna Q.
- **Comparación de códigos.** Tolera los ceros a la izquierda que Excel borra, los espacios
  y el prefijo AIM (`]C1`), si DataWedge lo agrega.
- **Mismo producto con variantes.** Como el SKU es la descripción (AZ), las variantes con
  la misma descripción van al mismo pallet: por ejemplo, el Minced 2 kg con y sin grasa,
  que en el packing list tienen distinto `Codigo Sap`. Si deben ir separadas, elegir una
  columna en "Código SKU (opcional)" al cargar el archivo, como `Codigo Sap` (H) o
  `Gexpo` (AY).

**Pallets.** Un pallet lleva un solo SKU; un SKU puede ocupar varios pallets. Los números
son correlativos (1, 2, 3…) en orden de creación, y cada SKU tiene como máximo un pallet
**ABIERTO**. Al escanear una caja:

1. Si su SKU no tiene un pallet abierto (primera caja, o todos sus pallets cerrados), se
   crea el siguiente pallet. La pantalla se pone azul y suena distinto:
   **NUEVO PALLET N° X**, con el producto.
2. Si ya tiene uno abierto, la caja se suma a ese pallet.

**Botones de la pantalla de escaneo:**

- **Pallet lleno / Nuevo pallet** cierra, previa confirmación, el pallet abierto del
  último SKU escaneado. El botón indica qué N° va a cerrar.
- **Deshacer último** pide confirmación y muestra la caja y el pallet. Si el pallet queda
  vacío, se elimina.
- **Resumen** abre la lista de pallets. Tocando uno se ve su detalle, donde se cierra,
  se reabre, o se eliminan o mueven cajas a otro pallet del mismo SKU. Si al reabrir un
  pallet su SKU ya tenía otro abierto, ese se cierra.

**Numeración.** Un pallet que queda vacío (al deshacer, eliminar o mover sus cajas)
desaparece. Su número se reutiliza solo si era el último: nunca cambia el número de un
pallet que ya tiene etiqueta física.

**Errores.**

- **Código que no está en el packing list:** pantalla roja y sonido de error. La caja no
  se registra; la lectura queda en "No identificados".
- **Caja ya escaneada:** pantalla ámbar que dice en qué pallet está. Se puede **Descartar**
  o **Registrar igual**; esta segunda opción cuenta como caja excedida y queda marcada en
  el Excel.
- **Una lectura nunca responde un diálogo.** Si se escanea con una advertencia abierta, la
  lectura se rechaza con sonido de error y hay que volver a escanear esa caja. El ENTER del
  escáner nunca aprieta un botón.

**Datos.**

- **Guardado.** Cada lectura se escribe en IndexedDB en una transacción con durabilidad
  estricta, y el OK aparece recién cuando quedó en disco. Si la app se cierra, se recarga
  o se acaba la batería, la recepción sigue exactamente donde quedó.
- **Pantalla y ventanas.** La pantalla se mantiene encendida durante la recepción. Solo
  una ventana puede tener la recepción abierta: la instalada o una pestaña de Chrome.

Hay sonido y vibración distintos para OK, pallet nuevo, aviso y error. Los sonidos usan el
**volumen multimedia** del equipo.

## Archivos

| Ruta | Qué es |
|---|---|
| `index.html` | La app completa, con el JS y el CSS adentro |
| `manifest.json` | Manifiesto de la PWA: nombre, ícono y orientación vertical |
| `service-worker.js` | Guarda la app en el equipo para que abra sin conexión |
| `xlsx.full.min.js` | SheetJS 0.20.3, incluido localmente (licencia en `xlsx.LICENSE.txt`) |
| `icons/` | Íconos (`icono.svg` es el original; los PNG salen de él) |
| `.nojekyll` | Le indica a GitHub Pages que sirva los archivos tal cual |
| `wrangler.toml`, `.assetsignore` | Alternativa: publicar en Cloudflare workers.dev |
| `pruebas/packing_list_prueba.xls` | Packing list inventado, con el mismo formato que el real |
| `pruebas/etiquetas_prueba.html` | Las cajas de prueba en Code 128, para imprimir y escanear |
| `pruebas/generar-packing-prueba.mjs` | Regenera los dos archivos anteriores |
| `pruebas/e2e.mjs` | Prueba automática de punta a punta |

El packing list real (`PKL_602622.xls`) no está en el repo porque trae datos del
proveedor. El de prueba copia su estructura con cajas inventadas.

## Probar en el PC

Hace falta un servidor local, porque el service worker no corre desde `file://`:

```bash
npx serve .                      # desde la raíz del repo; o:  python3 -m http.server 8080
```

1. Abrir `http://localhost:3000/?prueba` (o el puerto que indique el servidor).
2. Cargar `pruebas/packing_list_prueba.xls`, escribir una referencia y tocar
   **Iniciar recepción**.
3. **Simular un escaneo:** escribir el N° de caja y apretar ENTER. Es exactamente lo que
   hace DataWedge. No hace falta hacer clic en ningún campo: la app captura el teclado
   sola.

Cajas del packing list de prueba:

| Producto | Cajas |
|---|---|
| Salmon Ahumado En Frio Minced 2 kg (14) | 10000001 10000003 10000004 10000008 10000011 10000019 10000021 10000023 10000025 10000026 10000031 10000036 10000037 10000039 |
| Ahumados C kgs (10) | 10000005 10000007 10000009 10000014 10000022 10000024 10000027 10000029 10000032 10000038 |
| Salmon Ahumado En Frio Slice Trad (1 Kg) Kgs (6) | 10000002 10000006 10000020 10000033 10000034 10000040 |
| Salmon Ahumado en Frio Slice Trad (113 Grs) Kgs (6) | 10000012 10000013 10000017 10000018 10000028 10000030 |
| Salmon Ahumado en Frio Slice Trad (100 Grs) Kgs (4) | 10000010 10000015 10000016 10000035 |

**Otros casos:**

- **Código desconocido:** cualquier número fuera de la lista, por ejemplo `99999999`.
- **Caja repetida:** escanear dos veces el mismo número.
- **Atajos:** con `?prueba` en la dirección aparece el botón **Simular** al costado. Trae
  "caja pendiente", "mismo producto", "repetir última" y "código desconocido".

**Con la TC27 real, antes de una recepción:** abrir `pruebas/etiquetas_prueba.html` en el
PC, imprimirlo (o dejarlo en pantalla) y escanear las etiquetas. Son las mismas 40 cajas
en Code 128, más una que no está en el packing list.

**Prueba automática.** Usa Chromium con pantalla de TC27 y recorre todas las reglas, más
la recarga, el modo sin conexión y el Excel exportado:

```bash
npm i -D playwright                     # una vez; Playwright no es dependencia del proyecto
node pruebas/e2e.mjs                    # opcional: --real=<packing real .xls> --capturas=<carpeta>
```

## Publicar

### GitHub Pages (este repo)

La app queda en **https://idelloro.github.io/App_Recepcion/**. Se configura una sola vez:

1. **Settings → General → Danger Zone → Change repository visibility → Public.** GitHub
   Pages gratis solo publica repos públicos. El código no lleva datos: el packing list de
   prueba es inventado y las recepciones quedan en el terminal.
2. **Settings → Pages → Build and deployment:** Source *Deploy from a branch*, Branch
   `main` y carpeta `/ (root)`, y guardar.
3. Esperar uno o dos minutos y abrir la dirección en un PC para confirmar que carga.

Desde ahí, cada push a `main` se publica solo.

### Alternativa: Cloudflare en workers.dev

Sirve si el repo tiene que seguir privado. Desde la raíz del repo:

```bash
npx wrangler login
npx wrangler deploy
```

Queda en `https://recepcion-tc27.<subdominio>.workers.dev`. `.assetsignore` deja fuera del
sitio el historial de git y la configuración. Para que se publique solo en cada push: en
el panel de Cloudflare, Workers & Pages → Crear → Importar un repositorio → este repo, con
el comando de build vacío y `npx wrangler deploy` como comando de deploy.

### Publicar una versión nueva

Cambiar `VERSION` en `service-worker.js` y volver a publicar. La TC27 baja la versión
nueva cuando tiene red y muestra **"Hay una versión nueva · Actualizar"**. Nunca se
recarga sola, y la recepción en curso no se pierde al actualizar.

## Instalar en la TC27

1. Conectar la TC27 a la red, abrir **Chrome** y entrar a
   **https://idelloro.github.io/App_Recepcion/** (o a la dirección de Cloudflare).
2. Menú ⋮ → **Instalar app**. En algunas versiones dice **Agregar a la pantalla
   principal** → **Instalar**. La pantalla de inicio de la app también muestra un botón
   **Instalar como app** cuando Chrome lo permite.
3. Abrir la app una vez desde su ícono, con red: ahí se guarda completa en el equipo.
4. Probar sin conexión: activar el modo avión, abrir la app y cargar el packing list de
   prueba.
5. Subir el **volumen multimedia**, que es el que usan los sonidos de la app.

El packing list tiene que estar en la TC27, por ejemplo en Descargas: bajado del correo o
de Drive, o copiado por USB. El Excel exportado también queda en **Descargas**.

**Para la primera prueba**, los archivos de prueba están publicados junto a la app:

- **Packing list de prueba:** en la TC27, abrir
  `https://idelloro.github.io/App_Recepcion/pruebas/packing_list_prueba.xls`. Queda en
  Descargas.
- **Etiquetas:** en un PC, abrir
  `https://idelloro.github.io/App_Recepcion/pruebas/etiquetas_prueba.html` e imprimirlas,
  o escanearlas directo desde la pantalla.

## Configurar DataWedge

DataWedge es la app de Zebra que convierte cada lectura en teclas. Se le crea un perfil
para Chrome que escriba el código y termine con ENTER:

1. Abrir la app **DataWedge** → menú ⋮ → **New profile** → nombre `Recepcion` → OK.
2. Tocar el perfil y dejar marcado **Profile enabled**.
3. **Associated apps** → menú ⋮ → **New app/activity** → elegir **`com.android.chrome`** →
   elegir **`*`** (todas las actividades).
   - La app instalada corre dentro de Chrome, así que este paso cubre Chrome y la PWA.
   - Si en la lista de DataWedge aparece además un paquete propio de la app
     (`org.chromium.webapk.…`), agregarlo igual, con `*`.
4. **Barcode input:** **Enabled**, Scanner selection **Auto**. En **Decoders**, confirmar
   que esté activo el tipo de código de las etiquetas de las cajas. Code 128 viene activo;
   Interleaved 2 of 5 viene apagado y, si se usa, hay que revisar que su largo permita los
   8 dígitos del N° de caja.
5. **Keystroke output:** **Enabled**.
   - **Action key character:** None.
   - **Basic data formatting:** Enable, **Send data** activo, **Send ENTER key** activo y
     Send TAB key apagado.
6. **Intent output** e **IP output:** desactivados.
7. **Opcional:** en la configuración del escáner (Scan params), dejar **Decode audio
   feedback** en *None*. Así solo suenan los sonidos de la app, que distinguen OK, pallet
   nuevo y error.

Para comprobarlo, abrir la app, iniciar una recepción y escanear. El código aparece un
instante en la barra "Listo para escanear…" y se procesa solo. La app deja el lector siempre
con el foco (`inputmode="none"`, sin teclado en pantalla) y lo recupera si se pierde; si
por algún motivo lo pierde, la barra se pone roja: **Lector en pausa · toque aquí**.

**Sin ENTER también funciona.** Si el perfil no envía ENTER, la app reconoce la lectura
por su ritmo: el escáner escribe todos los caracteres en milisegundos, y 120 ms después del
último la procesa sola. Lo tecleado a mano en un PC sigue esperando el ENTER. Aun así, conviene
activar **Send ENTER key**: la lectura entra al instante.

**Si algo no funciona:**

- **Nada llega a la app.** Revisar que el perfil esté habilitado y asociado a
  `com.android.chrome`. Si no, DataWedge usa `Profile0`.
- **Faltan caracteres o llegan desordenados.** En Keystroke output, subir *Inter character
  delay* a 20–50 ms.
- **La etiqueta trae más que el N° de caja**, por ejemplo un GS1-128 largo. La hoja
  No_Identificados del Excel, o la pestaña "No ident.", muestra exactamente lo que leyó el
  escáner. Con eso se puede recortar el dato con *Advanced data formatting* en DataWedge, o
  ajustar la app.

## Excel exportado

**Finalizar y exportar** (dentro de Resumen) descarga
`Recepcion_<referencia>_<AAAA-MM-DD>.xlsx`. No cierra pallets y se puede repetir. Después
ofrece iniciar una recepción nueva: la actual se borra del equipo solo después de
confirmar dos veces.

| Hoja | Contenido |
|---|---|
| **Pallets** | N° pallet, SKU, descripción, cajas, kg, estado. Total general al final |
| **Resumen_SKU** | SKU, descripción, N° de pallets, pallets usados (ej. "3, 7, 12"), cajas, kg |
| **Diferencias** | Por SKU del packing list, incluidos los que no llegaron: cajas y kg esperados vs recibidos, diferencia y **Estado**: OK, FALTANTE o SOBRANTE |
| **Detalle_Escaneos** | Fecha y hora, código leído, SKU, descripción, kg, N° pallet y observación (cajas repetidas registradas igual) |
| **No_Identificados** | Fecha y hora y código leído de las lecturas sin match |
| **Cajas_No_Recibidas** | Adicional: las cajas del packing list que no se escanearon, con su fila en el archivo original |

Mientras no se elija una columna de código SKU, las columnas SKU y Descripción traen lo
mismo: la descripción de AZ. Los N° de caja van como número, igual que en el packing list,
para poder cruzarlos con BUSCARV.

## Límites

- **Los datos viven solo en la TC27.** Borrar los datos del sitio en Chrome durante una
  recepción la elimina. Exportar no borra nada.
- **Una TC27 por recepción.** Sin backend no hay sincronización.
- **Pendiente para una fase 2:** conectar Supabase a través de un Worker, con la app
  todavía offline primero. Eso daría un respaldo de cada lectura fuera del equipo,
  permitiría cargar el packing list desde la oficina y dejaría ver las recepciones sin
  mandar el Excel. Los identificadores (`uid` en cada lectura) ya están pensados para
  sincronizar sin migrar datos.

## SheetJS

`xlsx.full.min.js` es SheetJS Community Edition 0.20.3 (Apache-2.0). Viene del paquete
npm `@e965/xlsx`, que republica la versión oficial, porque la CDN de SheetJS no era
accesible desde el entorno donde se armó. Se usa la 0.20.3 y no la 0.18.5, la última en
npm, porque corrige dos vulnerabilidades al leer archivos. Para reemplazarlo por la copia
oficial, bajar `https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js`,
sobrescribir el archivo y cambiar `VERSION` en el service worker.
