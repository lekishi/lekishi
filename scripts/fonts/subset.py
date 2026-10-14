"""Subsets the site's fonts to the characters its text uses.

Usage: python -I subset.py SOURCES_JSON SOURCE_DIR CORPUS_TXT OUT_DIR

RFD 5 ("Typography"): every face is open-licensed, self-hosted from
static/fonts/, and cut down at build time to the glyphs the site actually
sets, so the CJK cost follows the chapters rather than the font. Each face
keeps its weight axis only across the weights the design system uses, and
is written as WOFF2.

Which characters each face carries:

- "latin": the corpus's non-CJK characters (Cinzel is Latin-only display).
- "all": every corpus character the font has (Noto Serif JP carries the
  historical names).
- "missing-from:<id>": only the CJK characters that face lacks (Noto Serif
  TC fills the traditional forms Noto Serif JP does not draw).
- "missing-from:*": any character no earlier face carries (Noto Serif fills
  the rare Latin letters, such as the ṭ of Tripiṭaka, the JP faces lack).
- "non-han": the corpus without Han ideographs. Interface text is Noto Sans
  JP; a Han character in it falls through the stack to the serif, so the
  ideographs ship once rather than twice.

The @font-face rules live in src/app.css, not here. Beside the fonts it
writes coverage.json (which characters each file
carries, and any corpus character no face has), which the build invariant
reads, and copies each family's licence.
"""

import json
import shutil
import sys
import unicodedata
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

# Layout features worth their bytes: kerning, ligatures, tabular figures for
# dates, proportional CJK punctuation, and the defaults fontTools keeps.
FEATURES = ["kern", "liga", "calt", "tnum", "palt", "locl", "ccmp", "mark", "mkmk"]


def is_han(char: str) -> bool:
    return unicodedata.name(char, "").startswith("CJK UNIFIED IDEOGRAPH") or (
        "CJK COMPATIBILITY IDEOGRAPH" in unicodedata.name(char, "")
    )


def is_cjk(char: str) -> bool:
    code = ord(char)
    return is_han(char) or 0x3000 <= code <= 0x30FF or 0xFF00 <= code <= 0xFFEF


def cmap(path: Path) -> set[int]:
    with TTFont(path, lazy=True) as font:
        return set(font.getBestCmap().keys())


def main() -> None:
    sources_json, source_dir, corpus_txt, out_dir = map(Path, sys.argv[1:5])
    sources = json.loads(sources_json.read_text(encoding="utf-8"))
    corpus = {char for char in corpus_txt.read_text(encoding="utf-8") if char.isprintable()}
    corpus.discard("﻿")
    out_dir.mkdir(parents=True, exist_ok=True)

    carried: dict[str, set[str]] = {}
    coverage: dict[str, object] = {"faces": {}}

    for face in sources["faces"]:
        source = source_dir / Path(face["source"]).name
        available = cmap(source)
        rule = face["scripts"]

        if rule == "latin":
            wanted = {char for char in corpus if not is_cjk(char)}
        elif rule == "all":
            wanted = set(corpus)
        elif rule == "non-han":
            wanted = {char for char in corpus if not is_han(char)}
        elif rule == "missing-from:*":
            earlier = set().union(*carried.values())
            wanted = {char for char in corpus if char not in earlier and not char.isspace()}
        elif rule.startswith("missing-from:"):
            other = carried[rule.split(":", 1)[1]]
            wanted = {char for char in corpus if char not in other and is_cjk(char)}
        else:
            raise SystemExit(f"{face['id']}: unknown scripts rule {rule}")

        chars = {char for char in wanted if ord(char) in available}
        carried[face["id"]] = chars
        # A face with nothing to carry is still written (a space and .notdef),
        # so the stylesheet's @font-face rules never point at a missing file;
        # a browser only fetches it if no earlier face draws a character.
        if not chars:
            chars = {" "}

        font = TTFont(source, lazy=False)

        options = subset.Options()
        options.flavor = "woff2"
        options.layout_features = FEATURES
        options.name_IDs = ["*"]
        options.name_languages = ["*"]
        options.notdef_outline = True
        options.hinting = False
        options.desubroutinize = True

        subsetter = subset.Subsetter(options=options)
        subsetter.populate(unicodes=sorted(ord(char) for char in chars))
        subsetter.subset(font)

        # Instanced after subsetting, so the axes are cut on the few glyphs
        # kept: a range keeps the weights the system uses, a number pins one.
        axes = {
            tag: tuple(value) if isinstance(value, list) else value
            for tag, value in face["axes"].items()
        }
        font = instancer.instantiateVariableFont(font, axes)

        file = f"lekishi-{face['id']}.woff2"
        font.flavor = "woff2"
        font.save(out_dir / file)

        # The OFL travels with the font it licenses.
        license_file = f"{Path(face['license']).parent.name}-OFL.txt"
        shutil.copyfile(source_dir / license_file, out_dir / license_file)

        coverage["faces"][face["id"]] = {
            "family": face["family"],
            "file": file,
            "bytes": (out_dir / file).stat().st_size,
            "characters": "".join(sorted(chars)),
        }

    covered = set().union(*carried.values())
    coverage["missing"] = "".join(sorted(char for char in corpus if char not in covered and not char.isspace()))
    (out_dir / "coverage.json").write_text(
        json.dumps(coverage, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    for face_id, face in coverage["faces"].items():
        print(f"  {face['file']}: {len(face['characters'])} characters, {face['bytes']:,} bytes")
    if coverage["missing"]:
        print(f"  no face draws: {coverage['missing']}")


if __name__ == "__main__":
    main()
