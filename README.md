# Mi carnaval

Enciclopedia personal de Montse entre Ceuta y Cádiz, con el escenario del Gran Teatro Falla fijo detrás de toda la colección. El diseño se inspira en programas de mano y entradas de teatro, con papel marfil, dorado envejecido y un tono solemne y emotivo. HTML, CSS y JavaScript sin dependencias de ejecución ni servicios externos. Las tipografías están incluidas en el proyecto.

## Abrir en local

Desde esta carpeta, ejecutar `npm start` (en PowerShell, `npm.cmd start`) y abrir `http://127.0.0.1:4173`.

Las fotos y el catálogo ya están preparados en `dist/`. Se necesita un servidor HTTP; abrir `index.html` directamente no permite cargar el JSON en todos los navegadores.

## La colección

- Navegación por ciudad, año y modalidad; filtros combinables y búsqueda de agrupaciones sin distinguir tildes.
- Agrupaciones siempre en orden alfabético español, en todas las páginas y filtros. No hay selector de orden.
- Autocompletado de integrantes por nombre o apodo, con cifras de agrupaciones y fotos. Permite teclado, selección táctil, limpieza del filtro y enlaces con `integrante=`. Se combina con los demás filtros y devuelve fichas de agrupaciones, no una vista global de fotos.
- Fichas con portada, álbum de recuerdos y nombres de las fotografías.
- Recuentos de agrupaciones y fotografías por modalidad, ciudad y año, ajustados a los demás filtros y la búsqueda. Las fotografías del álbum se cuentan por separado de las portadas.
- Tarjetas con ciudad, edición, modalidad, nombres presentes en el álbum y cantidades de fotografías y portadas.
- Un único recorrido: encontrar una agrupación, abrir su ficha y ver sus fotos. No hay una vista global de fotografías. El álbum de eventos de las fuentes conserva su propia entrada, identificada como álbum.
- Paginación, enlaces directos y navegación atrás y adelante del navegador; las fichas tienen un botón de regreso siempre visible.
- Visor con marco ajustado a cada fotografía, cartela de programa, navegación por teclado, gestos en móvil y cierre con Escape.
- «Qué es esto» abre una carta de agradecimiento firmada por Montse.
- Enlaces a las fichas, con filtros conservados en la dirección.

El año corresponde a la agrupación, no a la fecha de la fotografía. Los datos desconocidos quedan sin fechar o por clasificar. No se deducen años de fechas de archivos ni se inventan modalidades. Las fotos sin nombre de integrante conservan una descripción genérica.

El índice de integrantes se construye a partir de las etiquetas de las fotos del álbum; no es una plantilla oficial o completa de cada agrupación. Se normalizan mayúsculas y tildes. Las etiquetas colectivas se separan cuando pueden reconocerse nombres ya guardados individualmente; las ambiguas se conservan. No se unifican apodos distintos sin verificar. Las cifras del autocompletado corresponden al archivo completo; al seleccionar un nombre se aplican también la ciudad, el año y la modalidad activos. Las tarjetas distinguen las fotos con ese nombre del total de fotografías de su álbum.

## Añadir fotografías o completar datos

1. Añadir una carpeta o imágenes en `../_fuentes/cadiz/` o `../_fuentes/ceuta/`. La portada se identifica comparando el nombre del archivo con el de la carpeta o por la modalidad indicada en su nombre. Los demás archivos son recuerdos.
2. Si la portada incluye un año y una modalidad (p. ej., `Los Humanos Comparsa 2026.jpg`), se importan esos datos.
3. Para completar o corregir una ficha sin renombrar los originales, editar `catalog-overrides.json`, usando el identificador de `catalog-audit.json`. Campos: `name`, `year`, `type`, `coverName` y, opcionalmente, `references` (lista con `title` y `url`). Modalidades: `comparsa`, `chirigota`, `coro`, `cuarteto`.
4. Ejecutar `python scripts/build_catalog.py` (requiere Pillow). Se generan `dist/catalog.json`, las copias WebP y el informe de datos pendientes `catalog-audit.json`. Las conversiones existentes se reutilizan; para volver a generar una foto cambiada, borrar únicamente sus dos derivados en `dist/assets/photos/` antes de reconstruir.

Los originales no se modifican. Se generan imágenes de hasta 1.600 píxeles para el visor y miniaturas de hasta 640 píxeles. Los derivados no incluyen los metadatos EXIF de las fotografías.

## Diseño y recursos

- Fondo: `dist/assets/theatre/teatro-falla-fotografico.webp`, regenerado con acabado fotorealista y fijo durante la navegación. Es una recreación generada inspirada en el teatro, no una fotografía documental.
- Tipografías: Rye da carácter de cartel de carnaval a la cabecera, los títulos, las agrupaciones y los álbumes. Cormorant Garamond acompaña las frases emotivas y la carta, Manrope los controles y datos, y Caveat la firma. Archivos guardados en el proyecto; licencias en `dist/assets/fonts/`.
- Escenografía regenerada con acabado fotorealista: interior, tres modelos de telón, madera dorada, papel verjurado y terciopelo, creados con `image_gen` y guardados en `dist/assets/theatre/`. Los archivos, usos y prompts finales figuran en [docs/visual-assets.md](docs/visual-assets.md).
- Telones fijos a la altura completa de pantalla, con anchura automática para conservar su proporción. `<picture>` elige el modelo según el ancho y el alto: móvil hasta 3/5, tablet hasta 6/5 y escritorio a partir de ahí. El navegador descarga solo el modelo que corresponde y lo cambia al girar o redimensionar la pantalla.
- Marcos con transparencia real: `dist/frames.js` obtiene la abertura desde el alpha del marco y aplica el mismo recorte a la fotografía y su fondo interior. Las esquinas mantienen sus proporciones; no sobresale fotografía por los huecos exteriores. `dist/frames.css` compone las capas en tarjetas, álbumes y visor.
- Los fondos de papel y terciopelo de ciudades, modalidades, botones y paneles también se recortan con ese alpha. Los textos de los controles quedan dentro de la abertura; la carta y los diálogos conservan su contorno al desplazarse. Las etiquetas de la web usan «recuerdos», incluido «Mi álbum de recuerdos».
- `dist/theatre.css` contiene el acabado de materiales, las molduras, las tarjetas, los controles y los álbumes. El fondo del Falla sigue fijo detrás de la portada y del archivo.
- Animaciones: apertura de los telones, entrada escalonada de las fichas y fotografías al recorrer el álbum, apertura de diálogos y transición del marco al cambiar de fotografía. Se respeta `prefers-reduced-motion`, incluso si la preferencia cambia con la página abierta. El pie de foto permite desplazamiento cuando una etiqueta colectiva es demasiado larga.
- Las portadas y los recuerdos proceden exclusivamente de la colección facilitada.
- La página no usa confeti, SVG decorativos ni botones cuyo único propósito sea hacer scroll. Se conservan los iconos funcionales. El único panel explicativo es el agradecimiento solicitado por el usuario.

## Publicación

El repositorio es [Khr0mZ/carnaval](https://github.com/Khr0mZ/carnaval) y el alojamiento es GitHub Pages. La web se publica en `https://khr0mz.github.io/carnaval/`.

El flujo `.github/workflows/pages.yml` publica automáticamente `dist/` cuando hay cambios en esa carpeta en `main`. También se puede ejecutar manualmente desde Actions → Publicar en GitHub Pages → Run workflow. La fuente seleccionada en Settings → Pages debe ser **GitHub Actions**.

No se necesita instalar dependencias ni generar las fotos en GitHub Actions: el catálogo, las tipografías y las imágenes optimizadas están incluidos en `dist/`. Los archivos originales de `_fuentes/` quedan fuera del repositorio.

Para reproducir la ruta del sitio en PowerShell: `$env:BASE_PATH='/carnaval/'; npm.cmd start`, y abrir `http://127.0.0.1:4173/carnaval/`. Las rutas de recursos y enlaces funcionan bajo ese prefijo.

Este proyecto no requiere Sites ni credenciales de OpenAI para funcionar o publicarse. No debe volver a publicarse en otro proveedor sin autorización expresa del usuario.
