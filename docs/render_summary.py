"""Render demo-summary.md to PDF. Requires reportlab: python -m pip install reportlab."""

from html import escape
from pathlib import Path
import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate


ROOT = Path(__file__).resolve().parent
OLIVE = colors.HexColor("#333929")
INK = colors.HexColor("#232720")
GOLD = colors.HexColor("#9B8657")


def inline(text):
    text = escape(text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"`(.+?)`", r'<font name="Courier">\1</font>', text)
    return re.sub(
        r"\[([^\]]+)\]\(([^)]+)\)",
        r'<link href="\2" color="#536344"><u>\1</u></link>',
        text,
    )


def footer(canvas, document):
    width, _ = A4
    canvas.saveState()
    canvas.setStrokeColor(GOLD)
    canvas.line(44, 37, width - 44, 37)
    canvas.setFillColor(OLIVE)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(44, 24, "TESTRIL  /  DEMO STRATEGY  /  3 OCTOBER 2026")
    canvas.drawRightString(width - 44, 24, str(document.page))
    canvas.restoreState()


def main():
    styles = {
        "body": ParagraphStyle(
            "body", fontName="Helvetica", fontSize=10.3, leading=13.6,
            textColor=INK, spaceAfter=7, alignment=TA_LEFT,
        ),
        "title": ParagraphStyle(
            "title", fontName="Helvetica-Bold", fontSize=22, leading=25,
            textColor=OLIVE, spaceAfter=8,
        ),
        "heading": ParagraphStyle(
            "heading", fontName="Helvetica-Bold", fontSize=11.6, leading=14,
            textColor=OLIVE, spaceBefore=9, spaceAfter=5, keepWithNext=True,
        ),
    }
    story = []
    for block in re.split(r"\n\s*\n", (ROOT / "demo-summary.md").read_text()):
        block = block.strip()
        if not block:
            continue
        if block == "<!-- pagebreak -->":
            story.append(PageBreak())
            continue
        style = "body"
        if block.startswith("# "):
            style, block = "title", block[2:]
        elif block.startswith("## "):
            style, block = "heading", block[3:]
        story.append(Paragraph(inline(block.replace("\n", " ")), styles[style]))

    document = SimpleDocTemplate(
        str(ROOT / "demo-summary.pdf"), pagesize=A4,
        leftMargin=44, rightMargin=44, topMargin=38, bottomMargin=48,
        title="Testril demos: the decision brief", author="Ormilabs",
    )
    document.build(story, onFirstPage=footer, onLaterPages=footer)


if __name__ == "__main__":
    main()
