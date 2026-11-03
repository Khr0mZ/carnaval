# Hosting

This project uses GitHub Pages in `Khr0mZ/carnaval`. Publish through `.github/workflows/pages.yml`, which deploys `dist/` from `main`.

The user explicitly rejected publishing to Sites without authorization. Do not create, synchronize, or deploy this project through Sites or another hosting provider unless the user explicitly authorizes that provider. A request to change the website does not change its hosting provider.

The user authorized making `Khr0mZ/carnaval` public and publishing this collection on GitHub Pages on 2026-11-02. Preserve that selected repository and audience in subsequent work unless instructed otherwise.

Keep the original family photographs in `../_fuentes/` outside the repository. The optimized images in `dist/` are the website assets. Do not commit `.local/`, credentials, or archives.

# Design and browsing

The current name is "Mi carnaval". The user now prefers a solemn, very emotional tone and theatrical components inspired by carnival programmes and tickets. Keep the Falla stage fixed behind the page. Do not add confetti or random decorative SVGs.

The display typography must visibly evoke carnival posters: use the local Rye face for the brand, prominent headings and grouping names. Do not revert these to an ordinary literary serif. Keep longer emotional text and controls readable with the supporting typefaces.

The user explicitly requested a richer visual treatment with created images and animation. Keep the generated velvet curtains, gilded frames and programme paper in `dist/assets/theatre/`, the material styling in `dist/theatre.css`, and the purposeful entry and photo animations. Respect reduced-motion preferences, keep decorations out of interaction, and preserve photo proportions and readable captions. Asset prompts and provenance are in `docs/visual-assets.md`.

All generated decoration must look photographic, including the theatre, cloth, paper and frames. Curtains must fill the entire viewport height without distortion, remain fixed on scroll, and use the separate desktop, tablet and narrow-screen models selected by aspect ratio. For framed photographs, use the real alpha-derived aperture from `dist/frames.js` and `dist/frames.css`; do not put a rectangular photograph behind a transparent frame without clipping it to the opening.

The same alpha clipping applies to the material fills and content of city, modality and theatre controls, and to framed panels. Paper or velvet must not show outside a frame's silhouette. The SVG masks used to assemble the bitmap alpha are functional clipping, not decorative artwork. Use "recuerdos" in interface labels, including "Mi álbum de recuerdos", while preserving source grouping and person names.

Browse by grouping first, then open the group's album and its photos. Do not reintroduce a global photo view or scroll-only navigation buttons. The user has explicitly requested the top-right "Qué es esto" button again, opening an emotional thank-you letter signed by Montse. Show accurate contextual photo counts by category and separate album photographs from covers.

Always sort the grouping list alphabetically in Spanish, with no ordering selector. The requested member autocomplete filters grouping entries using the names preserved in the photo labels. Keep it combinable with city, year, modality and grouping-name search. Do not claim complete rosters or merge unverified aliases.
