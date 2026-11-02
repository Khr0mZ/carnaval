# El carnaval de Montse

Enciclopedia personal entre Ceuta y Cádiz, con el escenario del Gran Teatro Falla fijo detrás de toda la colección. El diseño se inspira en los carteles de carnaval, con una tipografía expresiva y textos cercanos. HTML, CSS y JavaScript sin dependencias de ejecución ni servicios externos. Las tipografías están incluidas en el proyecto.

## Abrir en local

Desde esta carpeta, ejecutar `npm start` (en PowerShell, `npm.cmd start`) y abrir `http://127.0.0.1:4173`.

Las fotos y el catálogo ya están preparados en `dist/`. Se necesita un servidor HTTP; abrir `index.html` directamente no permite cargar el JSON en todos los navegadores.

## La colección

- Navegación por ciudad, año y modalidad; filtros combinables y búsqueda de agrupaciones e integrantes sin distinguir tildes.
- Fichas con portada, álbum de encuentros y nombres de las fotografías.
- Una sola colección con dos vistas: agrupaciones y fotos con Montse. Ciudad, búsqueda, año, modalidad y ordenación se controlan en el mismo sitio.
- Paginación, enlaces directos y navegación atrás y adelante del navegador; las fichas tienen un botón de regreso siempre visible.
- Visor de imágenes con teclado, gestos en móvil y cierre con Escape.
- Enlaces a las fichas, con filtros conservados en la dirección.

El año corresponde a la agrupación, no a la fecha de la fotografía. Los datos desconocidos quedan sin fechar o por clasificar. No se deducen años de fechas de archivos ni se inventan modalidades. Las fotos sin nombre de integrante conservan una descripción genérica.

## Añadir fotografías o completar datos

1. Añadir una carpeta o imágenes en `../_fuentes/cadiz/` o `../_fuentes/ceuta/`. La portada se identifica comparando el nombre del archivo con el de la carpeta o por la modalidad indicada en su nombre. Los demás archivos son encuentros.
2. Si la portada incluye un año y una modalidad (p. ej., `Los Humanos Comparsa 2026.jpg`), se importan esos datos.
3. Para completar o corregir una ficha sin renombrar los originales, editar `catalog-overrides.json`, usando el identificador de `catalog-audit.json`. Campos: `name`, `year`, `type`, `coverName` y, opcionalmente, `references` (lista con `title` y `url`). Modalidades: `comparsa`, `chirigota`, `coro`, `cuarteto`.
4. Ejecutar `python scripts/build_catalog.py` (requiere Pillow). Se generan `dist/catalog.json`, las copias WebP y el informe de datos pendientes `catalog-audit.json`. Las conversiones existentes se reutilizan; para volver a generar una foto cambiada, borrar únicamente sus dos derivados en `dist/assets/photos/` antes de reconstruir.

Los originales no se modifican. Se generan imágenes de hasta 1.600 píxeles para el visor y miniaturas de hasta 640 píxeles. Los derivados no incluyen los metadatos EXIF de las fotografías.

## Diseño y recursos

- Fondo: `dist/assets/teatro-falla.webp`, creado con la herramienta integrada de generación de imágenes. Es una recreación artística inspirada en el teatro, no una fotografía documental.
- Prompt: «Interior del Gran Teatro Falla visto desde una butaca central hacia el escenario; arquitectura neomudéjar, palcos iluminados, terciopelo burdeos, dorado antiguo, butacas en primer plano y espacio central oscuro para la tipografía; composición simétrica, sin personas ni texto».
- Tipografías: Rye para los títulos de cartel, Bricolage Grotesque para textos y controles, y Caveat para la firma y las notas. Distribuidas mediante Google Fonts y guardadas en el proyecto. Licencias en `dist/assets/fonts/`.
- Las portadas y los encuentros proceden exclusivamente de la colección facilitada.

## Publicación

El repositorio es [Khr0mZ/carnaval](https://github.com/Khr0mZ/carnaval) y el alojamiento es GitHub Pages. La web se publica en `https://khr0mz.github.io/carnaval/`.

El flujo `.github/workflows/pages.yml` publica automáticamente `dist/` cuando hay cambios en esa carpeta en `main`. También se puede ejecutar manualmente desde Actions → Publicar en GitHub Pages → Run workflow. La fuente seleccionada en Settings → Pages debe ser **GitHub Actions**.

No se necesita instalar dependencias ni generar las fotos en GitHub Actions: el catálogo, las tipografías y las imágenes optimizadas están incluidos en `dist/`. Los archivos originales de `_fuentes/` quedan fuera del repositorio.

Para reproducir la ruta del sitio en PowerShell: `$env:BASE_PATH='/carnaval/'; npm.cmd start`, y abrir `http://127.0.0.1:4173/carnaval/`. Las rutas de recursos y enlaces funcionan bajo ese prefijo.

Este proyecto no requiere Sites ni credenciales de OpenAI para funcionar o publicarse. No debe volver a publicarse en otro proveedor sin autorización expresa del usuario.
