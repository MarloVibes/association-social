from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "Franchise_Mobile_x_NBA_2K_One_Page_Teaser.pdf"

PAGE_W, PAGE_H = letter
MARGIN = 42
INK = HexColor("#F7F9FC")
MUTED = HexColor("#A8B0BC")
DEEP = HexColor("#070A0E")
PANEL = HexColor("#10151C")
PANEL_2 = HexColor("#151B24")
LINE = HexColor("#28323E")
GREEN = HexColor("#00E68A")
CYAN = HexColor("#36BFFA")
AMBER = HexColor("#F5B942")


def set_font(c, size, bold=False, color=INK):
    c.setFillColor(color)
    c.setFont("Helvetica-Bold" if bold else "Helvetica", size)


def wrap_lines(text, font, size, max_width):
    words = text.split()
    lines = []
    current = ""
    for word in words:
        proposed = f"{current} {word}".strip()
        if stringWidth(proposed, font, size) <= max_width:
            current = proposed
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def paragraph(c, text, x, y, width, size=8.4, leading=11, color=MUTED, bold=False):
    font = "Helvetica-Bold" if bold else "Helvetica"
    set_font(c, size, bold=bold, color=color)
    for line in wrap_lines(text, font, size, width):
        c.drawString(x, y, line)
        y -= leading
    return y


def label(c, text, x, y, color=GREEN):
    set_font(c, 7.2, bold=True, color=color)
    c.drawString(x, y, text.upper())


def rounded_panel(c, x, y, w, h, fill=PANEL, stroke=LINE, radius=8):
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(0.8)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1)


def bullet(c, text, x, y, width, accent=GREEN):
    c.setFillColor(accent)
    c.circle(x + 2.5, y + 2.5, 2.2, fill=1, stroke=0)
    return paragraph(c, text, x + 11, y + 6, width - 11, size=7.6, leading=9.4, color=INK)


def flow_box(c, x, y, w, h, title, subtitle, accent):
    rounded_panel(c, x, y, w, h, fill=PANEL_2, stroke=accent, radius=7)
    set_font(c, 8.2, bold=True, color=INK)
    c.drawCentredString(x + w / 2, y + h - 15, title)
    set_font(c, 6.5, color=MUTED)
    c.drawCentredString(x + w / 2, y + 9, subtitle)


def build():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUTPUT), pagesize=letter)
    c.setTitle("Franchise Mobile x NBA 2K - One-Page Teaser")
    c.setAuthor("Marlano Lewis, Founder - Franchise Mobile")
    c.setSubject("Non-confidential connected league companion concept")

    c.setFillColor(DEEP)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    # Header
    c.setFillColor(GREEN)
    c.roundRect(MARGIN, PAGE_H - 58, 30, 4, 2, fill=1, stroke=0)
    label(c, "Non-confidential product overview", MARGIN + 40, PAGE_H - 59, CYAN)
    set_font(c, 25, bold=True, color=INK)
    c.drawString(MARGIN, PAGE_H - 92, "FRANCHISE MOBILE")
    set_font(c, 14.5, bold=True, color=GREEN)
    c.drawString(MARGIN, PAGE_H - 114, "NBA 2K CONNECTED LEAGUE COMPANION")
    paragraph(
        c,
        "A working concept for making MyNBA and MyGM leagues persistent, social, and manageable between console sessions while NBA 2K remains the authoritative gameplay experience.",
        MARGIN,
        PAGE_H - 134,
        PAGE_W - (2 * MARGIN),
        size=9.2,
        leading=12,
        color=MUTED,
    )

    # Opportunity and proposal
    gap_y = PAGE_H - 245
    col_gap = 12
    col_w = (PAGE_W - 2 * MARGIN - col_gap) / 2
    rounded_panel(c, MARGIN, gap_y, col_w, 76)
    label(c, "The gap", MARGIN + 14, gap_y + 58, AMBER)
    paragraph(
        c,
        "Franchise communities coordinate schedules, trades, rules, and conversation through disconnected chats and spreadsheets. Activity slows between console sessions and when teams become vacant.",
        MARGIN + 14,
        gap_y + 43,
        col_w - 28,
        size=7.7,
        leading=9.5,
        color=INK,
    )
    x2 = MARGIN + col_w + col_gap
    rounded_panel(c, x2, gap_y, col_w, 76, stroke=GREEN)
    label(c, "The proposal", x2 + 14, gap_y + 58, GREEN)
    paragraph(
        c,
        "Give the same league a persistent mobile home for management and community activity, then return users to NBA 2K for authoritative playable matchups.",
        x2 + 14,
        gap_y + 43,
        col_w - 28,
        size=7.7,
        leading=9.5,
        color=INK,
    )

    # Flow
    flow_y = gap_y - 91
    label(c, "Proposed connected loop", MARGIN, flow_y + 73, CYAN)
    box_gap = 14
    box_w = (PAGE_W - 2 * MARGIN - 3 * box_gap) / 4
    titles = [
        ("Franchise Mobile", "Manage + connect", GREEN),
        ("2K Online Services", "Secure sync", CYAN),
        ("MyNBA / MyGM", "League authority", AMBER),
        ("Console / PC", "Playable games", GREEN),
    ]
    for i, (title, subtitle, accent) in enumerate(titles):
        bx = MARGIN + i * (box_w + box_gap)
        flow_box(c, bx, flow_y + 18, box_w, 43, title, subtitle, accent)
        if i < 3:
            ax = bx + box_w + 3
            c.setStrokeColor(MUTED)
            c.setFillColor(MUTED)
            c.setLineWidth(1)
            c.line(ax, flow_y + 39, ax + box_gap - 6, flow_y + 39)
            c.line(ax + box_gap - 9, flow_y + 42, ax + box_gap - 6, flow_y + 39)
            c.line(ax + box_gap - 9, flow_y + 36, ax + box_gap - 6, flow_y + 39)
    set_font(c, 6.3, color=MUTED)
    c.drawString(MARGIN, flow_y + 4, "Proposed for evaluation. No public NBA 2K integration API is assumed.")

    # Capabilities and value columns
    body_y = flow_y - 177
    body_h = 164
    rounded_panel(c, MARGIN, body_y, col_w, body_h)
    label(c, "Working prototype demonstrates", MARGIN + 14, body_y + body_h - 19, GREEN)
    items = [
        "Persistent 30-team leagues and schedules",
        "GM Lounge, chat, voting, alerts, and moderation",
        "Trades, commissioner review, and CPU vacancies",
        "Scouting, player evaluation, and development",
        "Strategy, results, box scores, and league statistics",
        "Awards, offseason management, and continuity",
    ]
    by = body_y + body_h - 39
    for item in items:
        by = bullet(c, item, MARGIN + 14, by, col_w - 28, GREEN) - 4

    rounded_panel(c, x2, body_y, col_w, body_h, stroke=CYAN)
    label(c, "Strategic value to 2K", x2 + 14, body_y + body_h - 19, CYAN)
    value_items = [
        "Extends MyNBA/MyGM engagement beyond console sessions",
        "Brings league coordination into the NBA 2K ecosystem",
        "Helps private and public leagues remain active",
        "Creates more reasons to return for scheduled games",
        "Builds toward MyCAREER squads, events, and community",
    ]
    vy = body_y + body_h - 39
    for item in value_items:
        vy = bullet(c, item, x2 + 14, vy, col_w - 28, CYAN) - 5

    # Ask
    ask_y = 178
    rounded_panel(c, MARGIN, ask_y, PAGE_W - 2 * MARGIN, 70, fill=HexColor("#0A2018"), stroke=GREEN)
    label(c, "Initial request", MARGIN + 16, ask_y + 51, GREEN)
    set_font(c, 11.2, bold=True, color=INK)
    c.drawString(MARGIN + 16, ask_y + 33, "A private product and technical evaluation")
    paragraph(
        c,
        "with NBA 2K product leadership, Visual Concepts MyNBA/MyGM development, and the appropriate 2K online, mobile, or strategic partnerships representatives.",
        MARGIN + 16,
        ask_y + 19,
        PAGE_W - 2 * MARGIN - 32,
        size=7.5,
        leading=9,
        color=MUTED,
    )

    # Product boundary
    boundary_y = 84
    rounded_panel(c, MARGIN, boundary_y, PAGE_W - 2 * MARGIN, 76, fill=PANEL, stroke=LINE)
    label(c, "Clear product boundary", MARGIN + 16, boundary_y + 56, AMBER)
    set_font(c, 8.2, bold=True, color=INK)
    c.drawString(MARGIN + 16, boundary_y + 38, "Franchise Mobile contributes")
    set_font(c, 7.2, color=MUTED)
    c.drawString(MARGIN + 16, boundary_y + 23, "Mobile league operations, front-office workflows, social coordination, and community continuity")
    set_font(c, 8.2, bold=True, color=INK)
    c.drawString(MARGIN + 16, boundary_y + 7, "2K remains authoritative for licensed data, accounts, gameplay, anti-cheat, and final results")

    # Footer
    c.setStrokeColor(LINE)
    c.line(MARGIN, 58, PAGE_W - MARGIN, 58)
    set_font(c, 7.2, bold=True, color=INK)
    c.drawString(MARGIN, 42, "MARLANO LEWIS  |  FOUNDER, FRANCHISE MOBILE")
    set_font(c, 6.2, color=MUTED)
    c.drawRightString(PAGE_W - MARGIN, 42, "PRIVATE DISCUSSION  |  NON-CONFIDENTIAL OVERVIEW")
    paragraph(
        c,
        "Independent prototype. Not affiliated with or endorsed by NBA 2K, 2K, Take-Two, Visual Concepts, the NBA, or player associations.",
        MARGIN,
        28,
        PAGE_W - 2 * MARGIN,
        size=5.9,
        leading=7,
        color=MUTED,
    )

    c.showPage()
    c.save()
    print(OUTPUT)


if __name__ == "__main__":
    build()
