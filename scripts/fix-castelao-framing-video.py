from pathlib import Path
import re

FILES = [
    Path('src/pages/historia.astro'),
    Path('src/pages/es/historia.astro'),
]

STYLE = r'''

  /* CASTELAO_FRAME_FINAL_BEGIN */
  .castelao-san-david-block .castelao-hero-image {
    min-height: 0;
    aspect-ratio: 1083 / 720;
    overflow: hidden;
    background: #fff;
  }
  .castelao-san-david-block .castelao-hero-image img {
    width: 100%;
    height: 100%;
    min-height: 0;
    object-fit: cover;
    object-position: center;
    background: transparent;
  }
  .castelao-roseton-block .castelao-hero-image {
    min-height: 0;
    aspect-ratio: 1 / 1;
    display: grid;
    place-items: center;
    overflow: visible;
    padding: clamp(.35rem, 1.2vw, .8rem);
    background: #fff;
  }
  .castelao-roseton-block .castelao-hero-image img {
    width: min(100%, 560px);
    height: auto;
    min-height: 0;
    aspect-ratio: 1 / 1;
    object-fit: cover;
    clip-path: circle(45.7% at 50% 50%);
    background: transparent;
  }
  @media (max-width: 700px) {
    .castelao-san-david-block .castelao-hero-image img,
    .castelao-roseton-block .castelao-hero-image img { min-height: 0; }
  }
  /* CASTELAO_FRAME_FINAL_END */
'''


def require_change(old: str, new: str, label: str) -> str:
    if old == new:
        raise RuntimeError(f'{label}: non se atopou o marcador esperado')
    return new


def move_video_to_end(text: str, spanish: bool) -> str:
    pattern = re.compile(r'\n?\s*<section class="castelao-video-block"[^>]*>.*?</section>\s*', re.S)
    m = pattern.search(text)
    if not m:
        raise RuntimeError('Non se atopou o bloque de vídeo')
    video = m.group(0).strip()
    text = text[:m.start()] + '\n\n' + text[m.end():]

    panel_start = text.index('<div id="panel-castelao"')
    if spanish:
        next_panel = text.index('<div id="panel-legado"', panel_start)
    else:
        marker = '<!-- 06 LEGADO -->'
        next_panel = text.index(marker, panel_start)
    close = text.rfind('</div>', panel_start, next_panel)
    if close < 0:
        raise RuntimeError('Non se atopou o peche do panel Castelao')
    return text[:close] + '\n\n' + video + '\n' + text[close:]


def clean_r2_credits(text: str, spanish: bool) -> str:
    clean = 'Archivo SCPP' if spanish else 'Arquivo SCPP'
    pattern = re.compile(
        r'(<(?:span|p) class="(?:pano-caption|pano-photo-credit|castelao-emblem-source)">)([^<]*R2[^<]*)(</(?:span|p)>)',
        re.I,
    )
    return pattern.sub(lambda m: f'{m.group(1)}{clean}{m.group(3)}', text)


def apply(path: Path) -> None:
    text = path.read_text(encoding='utf-8')
    spanish = '/es/' in str(path).replace('\\', '/')

    before = text
    text = re.sub(
        r'<section class="castelao-hero-pano" aria-labelledby="(san-david-title(?:-es)?)">',
        r'<section class="castelao-hero-pano castelao-san-david-block" aria-labelledby="\1">',
        text,
        count=1,
    )
    require_change(before, text, f'{path}: clase San David')

    before = text
    text = re.sub(
        r'<section class="castelao-hero-pano castelao-hero-pano-reverse" aria-labelledby="(roseton-title(?:-es)?)">',
        r'<section class="castelao-hero-pano castelao-hero-pano-reverse castelao-roseton-block" aria-labelledby="\1">',
        text,
        count=1,
    )
    require_change(before, text, f'{path}: clase Rosetón')

    text = clean_r2_credits(text, spanish)
    if re.search(r'(pano-caption|pano-photo-credit|castelao-emblem-source)[^>]*>[^<]*R2', text, re.I):
        raise RuntimeError(f'{path}: quedou unha referencia visible a R2')

    text = move_video_to_end(text, spanish)

    text = re.sub(
        r'\n\s*/\* CASTELAO_FRAME_FINAL_BEGIN \*/.*?/\* CASTELAO_FRAME_FINAL_END \*/\s*',
        '\n',
        text,
        flags=re.S,
    )
    if '</style>' not in text:
        raise RuntimeError(f'{path}: non se atopou </style>')
    text = text.replace('</style>', STYLE + '\n</style>', 1)

    path.write_text(text, encoding='utf-8')
    print(f'Actualizado {path}')


for item in FILES:
    apply(item)
