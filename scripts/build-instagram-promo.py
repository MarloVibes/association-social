#!/usr/bin/env python3
from __future__ import annotations

import math
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "social-promo"
CAROUSEL = OUT / "carousel"
REEL = OUT / "reel-frames"

W, H = 1080, 1350
RW, RH = 1080, 1920

BG = "#070B0E"
PANEL = "#11181D"
PANEL_2 = "#182229"
LINE = "#2A3942"
WHITE = "#F7FAFC"
MUTED = "#9BAAB3"
GREEN = "#00E59B"
CYAN = "#35C7F0"
AMBER = "#F5B82E"
CORAL = "#FF6175"


def font(size: int, bold: bool = False):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size=size)
    return ImageFont.load_default()


F = {
    "eyebrow": font(28, True),
    "title": font(76, True),
    "title_small": font(60, True),
    "subtitle": font(34),
    "h2": font(35, True),
    "body": font(27),
    "body_bold": font(27, True),
    "small": font(21),
    "metric": font(72, True),
}


def rr(draw, xy, radius=24, fill=None, outline=None, width=2):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def fit_text(draw, text, box_width, start_size, bold=True, min_size=28):
    size = start_size
    while size > min_size:
        candidate = font(size, bold)
        if draw.textbbox((0, 0), text, font=candidate)[2] <= box_width:
            return candidate
        size -= 2
    return font(min_size, bold)


def wrapped(draw, text, xy, width, fnt, fill=WHITE, spacing=10, max_lines=None):
    words = text.split()
    lines, current = [], ""
    for word in words:
        trial = f"{current} {word}".strip()
        if draw.textbbox((0, 0), trial, font=fnt)[2] <= width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    if max_lines:
        lines = lines[:max_lines]
    x, y = xy
    line_h = draw.textbbox((0, 0), "Ag", font=fnt)[3] + spacing
    for line in lines:
        draw.text((x, y), line, font=fnt, fill=fill)
        y += line_h
    return y


def brand(draw, slide, total, width=W):
    draw.text((72, 54), "FRANCHISE", font=font(30, True), fill=WHITE)
    fm_w = draw.textbbox((0, 0), "MOBILE", font=font(30, True))[2]
    draw.text((72, 89), "MOBILE", font=font(30, True), fill=GREEN)
    draw.line((72, 133, 72 + fm_w, 133), fill=GREEN, width=5)
    draw.text((width - 150, 65), f"{slide:02d}/{total:02d}", font=F["small"], fill=MUTED)


def footer(draw, width=W, height=H):
    draw.line((72, height - 87, width - 72, height - 87), fill=LINE, width=2)
    draw.text((72, height - 62), "INDEPENDENT PRODUCT CONCEPT", font=font(17, True), fill=MUTED)
    note = "Not affiliated with any league, publisher, or players association."
    note_w = draw.textbbox((0, 0), note, font=font(16))[2]
    draw.text((width - 72 - note_w, height - 62), note, font=font(16), fill="#65737B")


def court_texture(draw, width=W, height=H, opacity="#101A1F"):
    draw.ellipse((width - 520, 140, width + 160, 820), outline=opacity, width=5)
    draw.ellipse((width - 360, 300, width, 660), outline=opacity, width=4)
    draw.line((width - 180, 140, width - 180, 820), fill=opacity, width=4)
    draw.arc((width - 660, 430, width + 300, 1390), 200, 340, fill=opacity, width=5)


def base(slide, total=7, size=(W, H)):
    image = Image.new("RGB", size, BG)
    draw = ImageDraw.Draw(image)
    court_texture(draw, *size)
    brand(draw, slide, total, size[0])
    footer(draw, size[0], size[1])
    return image, draw


def pill(draw, xy, label, color=GREEN):
    x, y = xy
    fnt = font(22, True)
    tw = draw.textbbox((0, 0), label, font=fnt)[2]
    rr(draw, (x, y, x + tw + 32, y + 45), 12, fill=PANEL_2, outline=color, width=2)
    draw.text((x + 16, y + 9), label, font=fnt, fill=color)


def mini_phone(draw, box, accent=GREEN):
    x1, y1, x2, y2 = box
    rr(draw, box, 44, fill="#030506", outline="#52616A", width=4)
    rr(draw, (x1 + 24, y1 + 38, x2 - 24, y2 - 30), 28, fill="#080D10", outline=LINE, width=2)
    rr(draw, ((x1 + x2) / 2 - 72, y1 + 18, (x1 + x2) / 2 + 72, y1 + 44), 14, fill="#000000")
    draw.text((x1 + 48, y1 + 72), "COMMAND CENTER", font=font(19, True), fill=accent)
    draw.text((x1 + 48, y1 + 102), "Metro City Franchise", font=font(29, True), fill=WHITE)
    for i, (name, value, color) in enumerate([
        ("LEAGUE CHAT", "12 new", CYAN),
        ("TRADE CENTER", "3 active", GREEN),
        ("GAME NIGHT", "8:30 PM", AMBER),
        ("PLAYER WIRE", "5 updates", CORAL),
    ]):
        yy = y1 + 160 + i * 96
        rr(draw, (x1 + 44, yy, x2 - 44, yy + 82), 15, fill=PANEL, outline=LINE, width=2)
        draw.text((x1 + 64, yy + 12), name, font=font(19, True), fill=WHITE)
        draw.text((x1 + 64, yy + 47), value, font=font(17, True), fill=color)


def card_1():
    image, draw = base(1)
    pill(draw, (72, 190), "CONNECTED SPORTS CONCEPT", CYAN)
    draw.text((72, 280), "YOUR LEAGUE", font=F["title"], fill=WHITE)
    draw.text((72, 370), "DOESN'T", font=F["title"], fill=WHITE)
    draw.text((72, 460), "CLOCK OUT.", font=F["title"], fill=GREEN)
    wrapped(draw, "A persistent home for the people, decisions, rivalries, and stories that live between game nights.", (72, 575), 570, F["subtitle"], MUTED, 12)
    mini_phone(draw, (680, 205, 1015, 1070), GREEN)
    draw.text((72, 1038), "FRANCHISE MOBILE", font=font(39, True), fill=WHITE)
    draw.text((72, 1090), "More than a schedule. A living league.", font=F["body"], fill=GREEN)
    return image


def card_2():
    image, draw = base(2)
    draw.text((72, 205), "THE GAME ENDS.", font=F["title_small"], fill=WHITE)
    draw.text((72, 275), "THE LEAGUE DOESN'T.", font=F["title_small"], fill=GREEN)
    panels = [
        ("WITHOUT A HOME", "Schedules get buried. Trades scatter across chats. Commissioners chase everyone manually.", CORAL),
        ("WITH FRANCHISE MOBILE", "Every GM returns to one shared league state, one conversation, and one next decision.", CYAN),
    ]
    for i, (title, body, color) in enumerate(panels):
        x = 72 + i * 476
        rr(draw, (x, 430, x + 440, 980), 28, fill=PANEL, outline=color, width=3)
        draw.rectangle((x + 28, 465, x + 82, 519), fill=color)
        draw.text((x + 30, 468), "✓" if i else "!", font=font(40, True), fill=BG)
        draw.text((x + 28, 555), title, font=font(29, True), fill=color)
        wrapped(draw, body, (x + 28, 620), 380, F["body"], WHITE, 14)
        for j, label in enumerate((["CHAT", "SPREADSHEETS", "MANUAL WORK"] if not i else ["ONE LEAGUE", "ONE TIMELINE", "ONE COMMUNITY"])):
            pill(draw, (x + 28, 805 + j * 57), label, color)
    return image


def card_3():
    image, draw = base(3)
    draw.text((72, 205), "THE FRONT OFFICE", font=F["title_small"], fill=WHITE)
    draw.text((72, 275), "IN YOUR POCKET.", font=F["title_small"], fill=GREEN)
    items = [
        ("GM LOUNGE", "Conversation, votes, rules, moderation", CYAN),
        ("TRADE CENTER", "Targets, block listings, negotiation", GREEN),
        ("COACHING ROOM", "Preparation, development, identity", AMBER),
        ("LEAGUE INTEL", "News, standings, stats, player wire", CORAL),
    ]
    for i, (title, body, color) in enumerate(items):
        row, col = divmod(i, 2)
        x, y = 72 + col * 476, 430 + row * 300
        rr(draw, (x, y, x + 440, y + 260), 28, fill=PANEL, outline=LINE, width=2)
        draw.ellipse((x + 30, y + 30, x + 92, y + 92), fill=color)
        draw.text((x + 52, y + 42), str(i + 1), font=font(25, True), fill=BG, anchor="ma")
        draw.text((x + 30, y + 118), title, font=F["h2"], fill=WHITE)
        wrapped(draw, body, (x + 30, y + 165), 375, F["small"], MUTED, 8)
    return image


def card_4():
    image, draw = base(4)
    draw.text((72, 205), "NO EMPTY TEAM", font=F["title_small"], fill=WHITE)
    draw.text((72, 275), "STOPS THE SEASON.", font=F["title_small"], fill=GREEN)
    wrapped(draw, "CPU-controlled franchises keep the world moving until the next real GM steps in.", (72, 370), 830, F["subtitle"], MUTED, 10)
    teams = [
        ("METRO", "CONTENDING", GREEN, "18-7"),
        ("HARBOR", "RETOOLING", CYAN, "13-12"),
        ("SUMMIT", "REBUILDING", AMBER, "8-17"),
    ]
    for i, (name, identity, color, record) in enumerate(teams):
        x, y = 72, 540 + i * 190
        rr(draw, (x, y, 1008, y + 156), 25, fill=PANEL, outline=LINE, width=2)
        draw.ellipse((x + 24, y + 28, x + 124, y + 128), fill=PANEL_2, outline=color, width=5)
        draw.text((x + 74, y + 78), name[0], font=font(38, True), fill=color, anchor="mm")
        draw.text((x + 155, y + 35), name, font=font(33, True), fill=WHITE)
        draw.text((x + 155, y + 83), identity, font=font(22, True), fill=color)
        draw.text((725, y + 47), "CPU ACTIVE", font=font(20, True), fill=MUTED)
        draw.text((905, y + 42), record, font=font(31, True), fill=WHITE)
    return image


def card_5():
    image, draw = base(5)
    draw.text((72, 205), "ONE CONTINUOUS", font=F["title_small"], fill=WHITE)
    draw.text((72, 275), "BASKETBALL LOOP.", font=F["title_small"], fill=GREEN)
    stages = [
        ("01", "PREPARE", "Lineups, strategy, matchup decisions", CYAN),
        ("02", "PLAY", "Compete when game night arrives", AMBER),
        ("03", "SYNC", "Bring authoritative results home", GREEN),
        ("04", "REACT", "Stats, news, rivalry, next moves", CORAL),
    ]
    cy = 520
    for i, (num, title, body, color) in enumerate(stages):
        cx = 175 + i * 245
        draw.ellipse((cx - 68, cy - 68, cx + 68, cy + 68), fill=PANEL, outline=color, width=5)
        draw.text((cx, cy), num, font=font(34, True), fill=color, anchor="mm")
        if i < len(stages) - 1:
            draw.line((cx + 75, cy, cx + 170, cy), fill=LINE, width=6)
            draw.polygon([(cx + 170, cy), (cx + 146, cy - 14), (cx + 146, cy + 14)], fill=LINE)
        draw.text((cx, 625), title, font=font(28, True), fill=WHITE, anchor="ma")
        wrapped(draw, body, (cx - 93, 675), 186, font(20), MUTED, 7, 3)
    rr(draw, (72, 870, 1008, 1080), 28, fill=PANEL, outline=GREEN, width=3)
    draw.text((110, 912), "THE VISION", font=font(23, True), fill=GREEN)
    wrapped(draw, "Your league stays alive before, during, and after every game night.", (110, 958), 820, font(34, True), WHITE, 10)
    return image


def card_6():
    image, draw = base(6)
    draw.text((72, 205), "BUILT.", font=F["title"], fill=WHITE)
    draw.text((72, 295), "NOT JUST PITCHED.", font=F["title_small"], fill=GREEN)
    metrics = [
        ("30", "FRANCHISES", CYAN),
        ("530", "ROSTERED PLAYERS", GREEN),
        ("1,230", "GAME SCHEDULE", AMBER),
        ("12", "GM MODULES", CORAL),
    ]
    for i, (value, label, color) in enumerate(metrics):
        row, col = divmod(i, 2)
        x, y = 72 + col * 476, 470 + row * 300
        rr(draw, (x, y, x + 440, y + 250), 28, fill=PANEL, outline=color, width=3)
        draw.text((x + 30, y + 38), value, font=fit_text(draw, value, 370, 72), fill=WHITE)
        draw.text((x + 30, y + 142), label, font=font(23, True), fill=color)
        draw.text((x + 30, y + 188), "WORKING DEMO PROOF", font=font(18, True), fill=MUTED)
    return image


def card_7():
    image, draw = base(7)
    pill(draw, (72, 200), "THE BUILD IS ACTIVE", GREEN)
    draw.text((72, 300), "SPORTS COMMUNITIES", font=font(57, True), fill=WHITE)
    draw.text((72, 370), "DESERVE MORE.", font=font(57, True), fill=GREEN)
    wrapped(draw, "More connection. More strategy. More reasons to care between games.", (72, 485), 760, F["subtitle"], MUTED, 12)
    rr(draw, (72, 690, 1008, 960), 34, fill=PANEL, outline=GREEN, width=4)
    draw.text((112, 742), "FOLLOW THE BUILD", font=font(27, True), fill=GREEN)
    wrapped(draw, "Franchise Mobile is building a persistent home for competitive sports communities.", (112, 800), 820, font(40, True), WHITE, 12)
    draw.text((72, 1040), "COMMENT: What would keep your league active every day?", font=font(26, True), fill=CYAN)
    return image


def reel_frame(title, accent_line, body, number, accent=GREEN):
    image = Image.new("RGB", (RW, RH), BG)
    draw = ImageDraw.Draw(image)
    court_texture(draw, RW, RH, "#111D22")
    brand(draw, number, 6, RW)
    pill(draw, (72, 260), "FRANCHISE MOBILE", accent)
    y = 385
    for line in title:
        draw.text((72, y), line, font=font(78, True), fill=WHITE)
        y += 92
    draw.text((72, y + 10), accent_line, font=font(78, True), fill=accent)
    rr(draw, (72, y + 155, 1008, y + 500), 34, fill=PANEL, outline=accent, width=4)
    wrapped(draw, body, (112, y + 210), 820, font(38, True), WHITE, 14)
    draw.text((72, RH - 210), "THE CONNECTED HOME FOR SERIOUS SPORTS LEAGUES", font=font(21, True), fill=MUTED)
    footer(draw, RW, RH)
    return image


def story_asset():
    image = Image.new("RGB", (RW, RH), BG)
    draw = ImageDraw.Draw(image)
    court_texture(draw, RW, RH, "#111D22")
    brand(draw, 1, 1, RW)
    pill(draw, (72, 250), "TODAY'S QUESTION", CYAN)
    draw.text((72, 380), "WHAT KEEPS", font=font(78, True), fill=WHITE)
    draw.text((72, 472), "YOUR LEAGUE", font=font(78, True), fill=WHITE)
    draw.text((72, 564), "ACTIVE?", font=font(78, True), fill=GREEN)
    wrapped(
        draw,
        "Franchise Mobile is designed to keep the competition alive between game nights.",
        (72, 690),
        880,
        font(35),
        MUTED,
        12,
    )
    rr(draw, (72, 905, 1008, 1305), 34, fill=PANEL, outline=CYAN, width=4)
    draw.text((112, 955), "ADD INSTAGRAM POLL", font=font(24, True), fill=CYAN)
    rr(draw, (112, 1035, 968, 1130), 18, fill=PANEL_2, outline=GREEN, width=3)
    draw.text((540, 1082), "TRADES + RIVALRIES", font=font(29, True), fill=WHITE, anchor="mm")
    rr(draw, (112, 1160, 968, 1255), 18, fill=PANEL_2, outline=AMBER, width=3)
    draw.text((540, 1207), "STATS + GAME NIGHTS", font=font(29, True), fill=WHITE, anchor="mm")
    draw.text((72, 1435), "YOUR ANSWER MAY SHAPE THE BUILD.", font=font(29, True), fill=GREEN)
    wrapped(draw, "Follow the concept. Join the conversation.", (72, 1490), 820, font(31, True), WHITE, 10)
    footer(draw, RW, RH)
    return image


def write_copy():
    (OUT / "INSTAGRAM_CAPTION.txt").write_text(
        "The game can end for the night. The league should not.\n\n"
        "Franchise Mobile is an independent connected-sports concept built to keep competitive leagues active between game nights — with schedules, trades, league chat, commissioner tools, player intelligence, CPU-controlled vacancies, stats, and the next decision all living in one place.\n\n"
        "The working demo currently supports 30 franchises, 530 rostered players, a 1,230-game schedule, and 12 GM-focused modules.\n\n"
        "This is the beginning of a bigger idea: one persistent home for the people, rivalries, and stories around the game.\n\n"
        "What feature would keep your league active every day?\n\n"
        "#FranchiseMobile #SportsGaming #GameDev #BasketballGaming #OnlineLeague #SportsCommunity #IndieDev #MobileGaming\n\n"
        "Disclosure: Independent product concept. Not affiliated with any league, publisher, or players association.\n",
        encoding="utf-8",
    )
    (OUT / "POSTING_GUIDE.txt").write_text(
        "FRANCHISE MOBILE INSTAGRAM PROMO\n\n"
        "CAROUSEL\n"
        "- Upload slides 01 through 07 in order.\n"
        "- Use the supplied caption and add image alt text that summarizes each slide.\n"
        "- Pin a comment asking which league-management feature matters most.\n\n"
        "REEL\n"
        "- 1080x1920, approximately 16 seconds, silent master.\n"
        "- Add original audio or royalty-free music inside Instagram. Avoid copyrighted music if the post may be boosted.\n"
        "- Use the supplied Reel cover and keep the disclosure in the caption.\n\n"
        "STORY\n"
        "- Upload the supplied 1080x1920 Story image.\n"
        "- Place Instagram's native poll sticker over the two suggested answers.\n"
        "- Share the result in the next day's Story to keep the conversation moving.\n\n"
        "PUBLIC-SAFETY RULES\n"
        "- Do not add official league, team, publisher, or player branding.\n"
        "- Do not expose demo logins, Firebase screens, formulas, source code, or private pitch documents.\n"
        "- Describe console synchronization as a vision or proposed integration until an agreement exists.\n",
        encoding="utf-8",
    )
    (OUT / "ALT_TEXT.txt").write_text(
        "FRANCHISE MOBILE ACCESSIBILITY COPY\n\n"
        "CAROUSEL 01\n"
        "Franchise Mobile concept cover with a dark command-center interface and the headline: Your league doesn't clock out.\n\n"
        "CAROUSEL 02\n"
        "Comparison of a scattered league workflow with one connected Franchise Mobile league home.\n\n"
        "CAROUSEL 03\n"
        "Four Franchise Mobile front-office areas: GM Lounge, Trade Center, Coaching Room, and League Intel.\n\n"
        "CAROUSEL 04\n"
        "Three fictional franchises showing CPU-controlled contender, retooling, and rebuilding identities.\n\n"
        "CAROUSEL 05\n"
        "A four-stage sports loop: prepare, play, sync, and react.\n\n"
        "CAROUSEL 06\n"
        "Working demo proof points: 30 franchises, 530 rostered players, 1,230 scheduled games, and 12 GM modules.\n\n"
        "CAROUSEL 07\n"
        "Franchise Mobile call to action asking what would keep an online league active every day.\n\n"
        "REEL\n"
        "Animated Franchise Mobile concept reel presenting a connected home for league chat, trades, scheduling, strategy, stats, and CPU-managed franchises.\n\n"
        "STORY\n"
        "Franchise Mobile Story asking what keeps an online league active, with suggested poll answers: trades and rivalries, or stats and game nights.\n",
        encoding="utf-8",
    )


def main():
    CAROUSEL.mkdir(parents=True, exist_ok=True)
    REEL.mkdir(parents=True, exist_ok=True)
    cards = [card_1(), card_2(), card_3(), card_4(), card_5(), card_6(), card_7()]
    for idx, image in enumerate(cards, 1):
        image.save(CAROUSEL / f"{idx:02d}-franchise-mobile.png", quality=96)
    frames = [
        reel_frame(["YOUR LEAGUE"], "DOESN'T CLOCK OUT.", "A persistent home for every decision, rivalry, and story between game nights.", 1, GREEN),
        reel_frame(["THE FRONT OFFICE"], "IN YOUR POCKET.", "League chat. Trades. Scheduling. Strategy. Stats. One connected command center.", 2, CYAN),
        reel_frame(["EVERY TEAM"], "STAYS ALIVE.", "CPU-controlled vacancies keep the season moving until the next real GM arrives.", 3, AMBER),
        reel_frame(["PREPARE. PLAY."], "SYNC. REACT.", "A continuous sports loop designed to connect game night with everything around it.", 4, GREEN),
        reel_frame(["30 FRANCHISES."], "1,230 GAMES.", "A working demo with 530 rostered players and 12 GM-focused modules.", 5, CORAL),
        reel_frame(["FOLLOW"], "THE BUILD.", "Franchise Mobile is building a living home for serious competitive sports communities.", 6, GREEN),
    ]
    for idx, image in enumerate(frames, 1):
        image.save(REEL / f"frame-{idx:02d}.png", quality=96)
    frames[0].save(OUT / "Franchise_Mobile_Instagram_Reel_Cover.png", quality=96)
    story_asset().save(OUT / "Franchise_Mobile_Instagram_Story.png", quality=96)
    write_copy()
    print(OUT)


if __name__ == "__main__":
    main()
