#!/usr/bin/env python3
from __future__ import annotations

import csv
from pathlib import Path

from PIL import Image
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image as RLImage,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pitch-package"
DOCS = OUT / "docs"
RENDERED = OUT / "rendered"
ASSETS = OUT / "assets"

BG = colors.HexColor("#070B0E")
PANEL = colors.HexColor("#10171C")
PANEL2 = colors.HexColor("#151E24")
LINE = colors.HexColor("#26343C")
TEXT = colors.HexColor("#F7FAFC")
MUTED = colors.HexColor("#A8B5BD")
GREEN = colors.HexColor("#00E59B")
CYAN = colors.HexColor("#35C7F0")
AMBER = colors.HexColor("#F5B82E")
RED = colors.HexColor("#FF5D73")


def register_fonts() -> tuple[str, str]:
    regular = Path("/System/Library/Fonts/Supplemental/Arial.ttf")
    bold = Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf")
    if regular.exists() and bold.exists():
        pdfmetrics.registerFont(TTFont("PitchRegular", str(regular)))
        pdfmetrics.registerFont(TTFont("PitchBold", str(bold)))
        return "PitchRegular", "PitchBold"
    return "Helvetica", "Helvetica-Bold"


FONT, FONT_BOLD = register_fonts()


class PitchDoc(BaseDocTemplate):
    def __init__(self, filename: Path, title: str, subtitle: str):
        self.title_text = title
        self.subtitle_text = subtitle
        super().__init__(
            str(filename),
            pagesize=letter,
            leftMargin=0.62 * inch,
            rightMargin=0.62 * inch,
            topMargin=0.68 * inch,
            bottomMargin=0.58 * inch,
            title=title,
            author="Franchise Mobile",
        )
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="main")
        self.addPageTemplates(PageTemplate(id="pitch", frames=[frame], onPage=self._page))

    def _page(self, canvas, doc):
        canvas.saveState()
        canvas.setFillColor(BG)
        canvas.rect(0, 0, letter[0], letter[1], fill=1, stroke=0)
        canvas.setFillColor(GREEN)
        canvas.rect(0, letter[1] - 8, letter[0], 8, fill=1, stroke=0)
        canvas.setFont(FONT_BOLD, 8)
        canvas.setFillColor(colors.HexColor("#6D7B83"))
        canvas.drawString(0.62 * inch, 0.3 * inch, "PRIVATE STRATEGIC DISCUSSION")
        canvas.drawRightString(letter[0] - 0.62 * inch, 0.3 * inch, f"{doc.page}")
        canvas.restoreState()


styles = getSampleStyleSheet()
STYLE = {
    "cover_kicker": ParagraphStyle("cover_kicker", fontName=FONT_BOLD, fontSize=10, leading=13, textColor=GREEN, spaceAfter=12),
    "cover_title": ParagraphStyle("cover_title", fontName=FONT_BOLD, fontSize=30, leading=34, textColor=TEXT, spaceAfter=16),
    "cover_sub": ParagraphStyle("cover_sub", fontName=FONT, fontSize=14, leading=20, textColor=MUTED, spaceAfter=20),
    "h1": ParagraphStyle("h1", fontName=FONT_BOLD, fontSize=22, leading=26, textColor=TEXT, spaceBefore=5, spaceAfter=12),
    "h2": ParagraphStyle("h2", fontName=FONT_BOLD, fontSize=14, leading=18, textColor=GREEN, spaceBefore=12, spaceAfter=7),
    "body": ParagraphStyle("body", fontName=FONT, fontSize=10.5, leading=15, textColor=TEXT, spaceAfter=7),
    "muted": ParagraphStyle("muted", fontName=FONT, fontSize=9, leading=13, textColor=MUTED, spaceAfter=6),
    "bullet": ParagraphStyle("bullet", fontName=FONT, fontSize=10.2, leading=14.5, textColor=TEXT, leftIndent=14, firstLineIndent=-10, bulletIndent=0, spaceAfter=5),
    "callout": ParagraphStyle("callout", fontName=FONT_BOLD, fontSize=12, leading=17, textColor=TEXT, alignment=TA_LEFT),
    "small": ParagraphStyle("small", fontName=FONT, fontSize=8.5, leading=11, textColor=MUTED),
}


def p(text: str, style: str = "body") -> Paragraph:
    return Paragraph(text, STYLE[style])


def bullet(text: str) -> Paragraph:
    return Paragraph(f"• {text}", STYLE["bullet"])


def section(title: str, body: list[str], accent=GREEN):
    head = ParagraphStyle(
        f"section-{title}", parent=STYLE["h2"], textColor=accent
    )
    return [Paragraph(title, head), *[bullet(item) for item in body]]


def callout(text: str, accent=GREEN):
    table = Table([[Paragraph(text, STYLE["callout"])]], colWidths=[7.0 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PANEL2),
        ("BOX", (0, 0), (-1, -1), 1.2, accent),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING", (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
    ]))
    return table


def cover(title: str, subtitle: str, tag: str):
    return [
        Spacer(1, 0.75 * inch),
        p(tag.upper(), "cover_kicker"),
        p(title, "cover_title"),
        p(subtitle, "cover_sub"),
        Spacer(1, 0.18 * inch),
        callout("Franchise Mobile keeps the league connected. NBA 2K remains where basketball is played.", GREEN),
        Spacer(1, 2.5 * inch),
        p("Prepared for a private product and technical evaluation with Take-Two Interactive, 2K, and Visual Concepts.", "muted"),
        p("Non-confidential presentation layer. No source code, credentials, private formulas, raw datasets, or repository access included.", "small"),
    ]


def build_guided_demo():
    target = DOCS / "Franchise_Mobile_x_NBA_2K_Guided_Demo.pdf"
    doc = PitchDoc(target, "Franchise Mobile x NBA 2K Guided Demo", "10-minute owner-led walkthrough")
    story = cover(
        "Franchise Mobile x NBA 2K<br/>Guided Product Demo",
        "A ten-minute walkthrough designed to prove the mobile league operating layer while clearly separating the working prototype from the proposed NBA 2K integration.",
        "Presenter runbook",
    )
    story += [PageBreak(), p("Before the meeting", "h1")]
    story += section("Environment check", [
        "Confirm the app is using the isolated demo environment, never the production Firebase project.",
        "Use the founder account only for the owner-led presentation. Outside recipients receive viewer access only.",
        "Open the prepared pitch league and verify the roster, schedule, showcase box scores, league stats, Command Center, Trade Center, and League Chat.",
        "Close Firebase Console, terminals, source code, password managers, debug overlays, and unrelated browser tabs.",
        "Keep the strategic deck and a backup visual reel ready in case the live demo becomes unavailable.",
    ])
    story += section("Language discipline", [
        "Say 'working prototype' for features visible in the app.",
        "Say 'proposed integration' for synchronization with NBA 2K services, console, or PC.",
        "Never imply that 2K has approved the concept or that a public integration API exists.",
        "Do not explain simulation formulas, rating methodology, credentials, or implementation internals.",
    ], CYAN)
    story += [Spacer(1, 8), callout("Demo objective: earn a focused product and technical evaluation, not close every commercial question in the first meeting.", AMBER)]

    segments = [
        ("0:00–0:45", "Open with the thesis", "Show the league home or Command Center.", [
            "Say: 'Franchise Mobile keeps the same MyNBA or MyGM league active while users are away from console or PC.'",
            "Clarify that NBA 2K remains the authoritative place for playable basketball and licensed content.",
            "Set the problem: coordination currently spills into disconnected chats, spreadsheets, and manual commissioner work.",
        ]),
        ("0:45–1:45", "Enter the connected league", "Open the prepared 30-team pitch league.", [
            "Point out human ownership and CPU-controlled vacancies.",
            "Explain that vacant franchises continue operating until a human GM takes over.",
            "Show that the schedule and roster survive an ownership transfer.",
        ]),
        ("1:45–3:00", "Show the Command Center", "Open GM Lounge and the league operations modules.", [
            "Show league chat, voting, rules, moderation, game resets, news, stats, Player Wire, and Coaching Room.",
            "Emphasize that this is the shared operating layer for the league, not a passive companion feed.",
            "Mention reactions, GIFs, photos, block, and report controls without dwelling on every button.",
        ]),
        ("3:00–4:15", "Show player and roster intelligence", "Open a roster and one polished player card.", [
            "Explain tier, archetype, skill grades, potential, and development outlook as separate concepts.",
            "Show how a GM can evaluate fit and value without launching the full game.",
            "Avoid discussing private rating formulas or raw source datasets.",
        ]),
        ("4:15–5:30", "Show trade operations", "Open Trade Center, block feed, or a prepared trade room.", [
            "Show shopping, targets, protected players, team-grouped block listings, and structured negotiation.",
            "Explain that CPU teams consider direction, roster needs, and value when a human GM is absent.",
            "Do not initiate an untested server-backed action during the pitch.",
        ]),
        ("5:30–6:45", "Show schedule and preparation", "Open Calendar and a scheduled matchup.", [
            "Show the league schedule, matchup request flow, and pregame coaching preparation.",
            "Explain the proposed handoff: prepare on mobile, play on NBA 2K, synchronize authoritative results back.",
            "Keep the current prototype flow distinct from the future service integration.",
        ]),
        ("6:45–8:00", "Show returned game evidence", "Open a seeded completed game and league stats.", [
            "Show final score, quarter scoring, top performers, full box score, standings impact, and league-wide player statistics.",
            "State that the pitch demo uses seeded/sample results so the walkthrough remains reliable without paid demo services.",
            "Connect the result to the next social and front-office decisions.",
        ]),
        ("8:00–9:10", "Explain the continuous loop", "Return to Command Center.", [
            "Summarize: prepare, play, sync, react, repeat.",
            "Explain how alerts, negotiations, league news, CPU continuity, and offseason decisions create reasons to return.",
            "Briefly introduce MyCAREER community as a later roadmap: squads, teammate discovery, scheduling, events, and persistent identity.",
        ]),
        ("9:10–10:00", "Close with the ask", "Return to the final deck slide.", [
            "Ask for a product and technical evaluation with NBA 2K product leadership, Visual Concepts, and 2K online/mobile services.",
            "Propose a narrow sandbox pilot before deeper commercial or source-code diligence.",
            "Confirm the next owner, requested materials, and a specific follow-up date.",
        ]),
    ]
    story += [PageBreak(), p("Ten-minute walkthrough", "h1")]
    for idx, (timing, title, screen, bullets) in enumerate(segments):
        block = [p(f"{timing}  |  {title}", "h2"), p(f"<b>Screen:</b> {screen}", "muted"), *[bullet(b) for b in bullets]]
        story.append(KeepTogether(block))
        if idx in (2, 5):
            story.append(PageBreak())
            story.append(p("Ten-minute walkthrough (continued)", "h1"))

    story += [PageBreak(), p("Fallback routes", "h1")]
    fallback_rows = [
        ["Live app unavailable", "Use the strategic deck and backup visual reel. Keep the meeting focused on the product loop and working proof."],
        ["A page loads slowly", "Move to the next approved screen. Do not open developer tools or Firebase during the meeting."],
        ["Seeded game is missing", "Use the approved screenshot in the deck. Record the issue for a post-meeting follow-up."],
        ["Viewer cannot enter", "Present from the founder account through screen share. Do not share founder credentials."],
        ["Technical question exceeds scope", "Say the exact service contract must be defined with 2K and Visual Concepts; offer a written follow-up."],
    ]
    table = Table([[p("Situation", "small"), p("Response", "small")]] + [[p(a, "body"), p(b, "body")] for a, b in fallback_rows], colWidths=[1.65 * inch, 5.35 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), PANEL2), ("TEXTCOLOR", (0, 0), (-1, -1), TEXT),
        ("GRID", (0, 0), (-1, -1), 0.6, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 9), ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(table)
    story += [Spacer(1, 14), callout("Never troubleshoot by exposing credentials, source code, Firebase identifiers, private formulas, or repository access.", RED)]
    doc.build(story)
    return target


def build_qa():
    target = DOCS / "Franchise_Mobile_x_NBA_2K_Meeting_and_QA_Runbook.pdf"
    doc = PitchDoc(target, "Franchise Mobile x NBA 2K Meeting and Q&A Runbook", "Prepared answers and follow-up discipline")
    story = cover(
        "Franchise Mobile x NBA 2K<br/>Meeting + Q&amp;A Runbook",
        "A private preparation guide for product, development, online-services, strategy, commercial, security, and diligence conversations.",
        "Founder preparation",
    )
    story += [PageBreak(), p("Meeting posture", "h1")]
    story += section("Lead with", [
        "A clear product problem: franchise leagues lose continuity between console sessions.",
        "A focused proposal: a mobile social and front-office companion for MyNBA and MyGM.",
        "Working evidence: a seeded multi-team prototype with league operations, social systems, schedules, game evidence, and CPU continuity.",
        "A narrow next step: a product and technical evaluation followed by a sandbox pilot if fit is confirmed.",
    ])
    story += section("Do not volunteer", [
        "Source code, repository access, service-account keys, passwords, Firebase Console access, environment files, or production data.",
        "Simulation formulas, CPU decision weights, rating methodology, raw player datasets, unreleased modes, or monetization experiments.",
        "Unverified traction, revenue, retention, market-size, or user-count claims.",
        "A claim that the product is licensed, affiliated, approved, or technically integrated with 2K today.",
    ], RED)
    story += [Spacer(1, 8), callout("Answer what is known. Label assumptions. Offer written follow-up when the exact answer requires 2K-owned technical context.", AMBER)]

    qa = [
        ("What exactly are you asking us to evaluate?", "A focused MyNBA/MyGM companion concept: mobile league management, community, commissioner operations, and matchup preparation synchronized with NBA 2K, while console or PC remains authoritative for playable games and results."),
        ("Is this already integrated with NBA 2K?", "No. The current app is a working standalone prototype and isolated pitch demo. The NBA 2K service connection is the proposed integration that requires product and technical evaluation with 2K and Visual Concepts."),
        ("Are you affiliated with the NBA, NBPA, 2K, or Take-Two?", "No affiliation or license is claimed. Licensed names, assets, official data, and commercial use would require the appropriate agreements. The pitch is a strategic integration proposal, not a claim of existing authorization."),
        ("Why should this live inside the 2K ecosystem?", "The value is strongest when mobile decisions, community activity, and scheduled matchups return users to the authoritative NBA 2K experience. A first-party connected layer can reduce fragmentation and give franchise leagues a persistent identity."),
        ("Why not just use Discord and spreadsheets?", "Those tools handle isolated pieces but do not understand league state, permissions, teams, schedules, trades, results, player evaluation, commissioner workflows, or the return-to-game loop as one product."),
        ("Does a public NBA 2K API exist for this?", "This proposal does not assume one exists. The exact account-linking, permission, event, and synchronization contract must be defined with 2K and Visual Concepts through a controlled service interface."),
        ("What does Franchise Mobile contribute?", "The mobile operating layer: league dashboard, schedule, communication, moderation, trades, player intelligence, coaching preparation, CPU vacancy continuity, alerts, voting, standings, stats, awards, and offseason management."),
        ("What stays under 2K control?", "Licensed content, authoritative rosters and ratings, playable basketball, gameplay outcomes, account identity, entitlements, anti-cheat, platform services, and the final synchronization and conflict-resolution contract."),
        ("How would you prevent conflicting changes?", "The proposed architecture uses server-authoritative state, scoped permissions, event-based synchronization, idempotent operations, version checks, and 2K-controlled conflict resolution. The exact design would be part of technical discovery."),
        ("What happens when a GM is absent?", "The prototype supports CPU-controlled vacancies so schedules and league activity can continue. A commissioner can control whether CPU simulation or CPU trading is permitted."),
        ("How do you keep CPU trades fair?", "CPU identity considers team direction, roster needs, competitive window, roster balance, contract context, and value. The proprietary weights are reserved for protected technical diligence rather than first-meeting disclosure."),
        ("What is working today?", "The isolated demo contains 30 franchises, 530 rostered players, a locked 1,230-game schedule, seeded completed games, box scores, league statistics, social and moderation flows, trade operations, commissioner tools, and founder/viewer roles."),
        ("How many users or how much revenue do you have?", "This pitch is currently based on product proof and strategic fit. I will not present unverified traction. Any validated usage or commercial data can be supplied separately when it is ready."),
        ("What is the business model?", "The initial goal is to establish product and technical fit. Licensing, partnership, acquisition, platform inclusion, premium connected features, or another structure should be evaluated with Take-Two and 2K after the integration opportunity is validated."),
        ("Why start with MyNBA and MyGM?", "The prototype already demonstrates the league, commissioner, front-office, social, and CPU-continuity systems those modes need. That creates the clearest and lowest-ambiguity starting point."),
        ("Where does MyCAREER fit?", "As a later roadmap. The same community infrastructure could support teammate discovery, squads, availability, scheduled sessions, organized competition, events, and persistent social identity after the franchise loop proves itself."),
        ("How will you handle harassment and moderation?", "The prototype includes reporting, blocking, league moderation, and commissioner controls. A production integration would align with 2K policy, platform safety requirements, auditability, escalation, and account enforcement."),
        ("How is the demo secured?", "It uses a separate Firebase project, separate founder and viewer roles, read-only external access, seeded sample data, no production credentials, no repository access, and revocable recipient-specific accounts."),
        ("Can our engineers inspect the repository now?", "Not during initial evaluation. I can provide architecture summaries and answer product questions. Source access should occur only in a separately authorized diligence stage with confirmed recipients and appropriate protections."),
        ("What would a pilot look like?", "A product workshop, technical discovery, one limited sandbox league, controlled participant access, a narrow synchronization loop, and agreed measures for reliability, league activity, return-to-game behavior, and user value."),
        ("What do you need from us next?", "A meeting with NBA 2K product leadership, Visual Concepts MyNBA/MyGM ownership, and 2K online or mobile services to determine fit, technical constraints, and whether a sandbox prototype should be explored."),
    ]
    story += [PageBreak(), p("Prepared questions and answers", "h1")]
    for idx, (question, answer) in enumerate(qa, start=1):
        story.append(KeepTogether([
            p(f"{idx}. {question}", "h2"),
            p(answer, "body"),
        ]))
        if idx in (7, 14):
            story.append(PageBreak())
            story.append(p("Prepared questions and answers (continued)", "h1"))

    story += [PageBreak(), p("Meeting close and follow-up", "h1")]
    story += section("Before ending the call", [
        "Restate the proposed first integration in one sentence.",
        "Confirm whether the opportunity belongs with product, development, online services, strategy, or another internal owner.",
        "Ask what information is needed for the next evaluation step.",
        "Agree on one owner and a specific follow-up date.",
        "Do not send additional files until recipients and purpose are confirmed.",
    ])
    story += section("After the call", [
        "Record attendees, roles, questions, materials requested, commitments, and next action.",
        "Send a concise recap within 24 hours.",
        "Create or extend viewer access only for named recipients and record an expiration date.",
        "Revoke access after the window closes and review activity for unexpected use.",
        "Move sensitive requests into a separately approved diligence lane.",
    ], CYAN)
    story += [Spacer(1, 12), callout("A good first meeting ends with the right internal owner and a defined evaluation step — not with unrestricted access to the product's protected internals.", GREEN)]
    doc.build(story)
    return target


def build_access_checklist():
    target = DOCS / "Franchise_Mobile_Private_Pitch_Access_Checklist.pdf"
    doc = PitchDoc(target, "Franchise Mobile Private Pitch Access Checklist", "Controlled demo sharing")
    story = cover(
        "Private Pitch Access<br/>Checklist",
        "A repeatable process for sharing the Franchise Mobile demo without exposing production data, owner privileges, credentials, source code, or proprietary systems.",
        "Security and access",
    )
    story += [PageBreak(), p("Recipient approval", "h1")]
    story += section("Confirm before granting access", [
        "Recipient's full name, employer, title, business email, LinkedIn profile, and reason for access.",
        "Who referred the recipient and who internally expects the demo.",
        "Exactly which materials are approved: teaser, deck, guided demo, visual reel, or viewer account.",
        "Access start date, expiration date, and the person responsible for revocation.",
        "Whether legal review or an NDA is appropriate for the next stage.",
    ])
    story += section("Account rules", [
        "Founder account is for owner-led screen sharing only.",
        "Each external recipient receives a unique viewer account whenever practical.",
        "Viewer accounts remain read-only and cannot claim teams, edit league state, or use destructive/admin controls.",
        "Send the demo link and temporary password through separate channels.",
        "Never paste local credential files into email, LinkedIn, decks, shared drives, or meeting chat.",
    ], CYAN)
    story += [Spacer(1, 10), callout("Production project: never shared. Demo project: isolated, seeded, revocable, and intentionally limited.", AMBER)]
    story += [PageBreak(), p("Pre-share verification", "h1")]
    checks = [
        "Demo environment indicator is correct.",
        "Founder can enter the prepared league and complete the approved walkthrough.",
        "Viewer can browse but cannot claim a team or use destructive/admin actions.",
        "At least one seeded final game shows players for both teams in the full box score.",
        "League stats include players from seeded completed games.",
        "No debug, Firebase, repository, source-path, credential, or secret information appears on screen.",
        "Private demo link opens on the target device and account.",
        "Deck, demo guide, and backup visual reel open offline.",
        "Access entry is recorded in the private tracker.",
        "Revocation reminder is scheduled for the expiration date.",
    ]
    rows = [[p("Done", "small"), p("Verification item", "small")]] + [[p("□", "body"), p(item, "body")] for item in checks]
    table = Table(rows, colWidths=[0.55 * inch, 6.45 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), PANEL2), ("GRID", (0, 0), (-1, -1), 0.6, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.append(table)
    story += [PageBreak(), p("After the pitch", "h1")]
    story += section("Close the loop", [
        "Record who attended, what was shown, what was requested, and the agreed next step.",
        "Send only the approved follow-up material to confirmed recipients.",
        "Disable or delete viewer access when it expires.",
        "Rotate any credential that may have been exposed.",
        "Review demo activity for unexpected access or forwarding.",
        "Preserve meeting notes and material versions as a private diligence record.",
    ])
    story += [Spacer(1, 12), callout("The demo is evidence of product thinking. It is not permission to distribute the app, copy protected systems, or access production infrastructure.", RED)]
    doc.build(story)
    return target


def build_response_templates():
    target = DOCS / "Franchise_Mobile_x_NBA_2K_Response_Templates.pdf"
    doc = PitchDoc(target, "Franchise Mobile x NBA 2K Response Templates", "Approved outreach and follow-up language")
    story = cover(
        "Franchise Mobile x NBA 2K<br/>Response Templates",
        "Ready-to-use language for accepted connections, referrals, meeting requests, demo access, technical questions, licensing questions, and follow-up.",
        "Private outreach toolkit",
    )
    story += [PageBreak(), p("First responses", "h1")]
    templates = [
        ("Connection accepted", "Thanks for connecting. I built Franchise Mobile as a persistent social and front-office companion concept for NBA 2K MyNBA and MyGM. It keeps league management, community, trades, scheduling, and preparation active away from console or PC. I would value the chance to share a concise non-confidential overview and learn who on the NBA 2K product team would be best suited to evaluate it."),
        ("They ask for more information", "Thank you for the interest. I can send a one-page non-confidential overview first. The concept positions NBA 2K as the authoritative playable experience while Franchise Mobile extends the same league through mobile management, social coordination, commissioner tools, and game preparation. If the direction is relevant, I would welcome a short product and technical evaluation call."),
        ("They offer a referral", "I appreciate the referral. An introduction to the NBA 2K product, MyNBA/MyGM, online services, mobile, or Visual Concepts team would be ideal. I can provide a short non-confidential overview for context and will keep the initial request focused on product fit and technical feasibility."),
        ("They request a meeting", "Thank you. I would be glad to walk through the concept. I can keep the meeting to 20-30 minutes: the product problem, a ten-minute guided prototype demonstration, the proposed NBA 2K integration loop, and a focused discussion of next-step feasibility. Please let me know the preferred time and attendees."),
    ]
    for title, body in templates:
        story.append(KeepTogether([p(title, "h2"), callout(body, CYAN), Spacer(1, 8)]))

    story += [PageBreak(), p("Protected evaluation responses", "h1")]
    protected = [
        ("They request demo access", "I can provide a time-limited viewer account in an isolated demo environment. The viewer experience is read-only and uses seeded sample data; it does not expose production data, source code, credentials, private formulas, or administrator controls. Please send the recipient's business email and intended review window so I can prepare access."),
        ("They ask a technical integration question", "The working app is currently a standalone prototype. The console/mobile synchronization layer is the proposed integration and would need to be defined with 2K and Visual Concepts. My recommended next step is a controlled technical discovery session covering account linking, authoritative state, permissions, events, conflict resolution, and sandbox access."),
        ("They ask about licensing", "The prototype is being presented as a strategic integration proposal. I am not claiming an existing NBA, NBPA, 2K, or Take-Two license or affiliation. Licensed content, official data, commercial rights, and brand use would be addressed through the appropriate partnership and legal process if the product evaluation advances."),
        ("They ask for source code or formulas", "I can provide architecture, product behavior, security boundaries, and a controlled technical walkthrough at this stage. Source code, simulation formulas, CPU decision weights, raw player datasets, and credentials are reserved for an approved diligence process with the appropriate protections and scope."),
        ("They request an NDA", "I am open to reviewing an NDA through counsel before sharing protected implementation material. The current teaser, deck, and guided prototype are intentionally non-confidential and can be evaluated first while the appropriate diligence path is established."),
    ]
    for title, body in protected:
        story.append(KeepTogether([p(title, "h2"), callout(body, AMBER), Spacer(1, 8)]))

    story += [Spacer(1, 10), p("Follow-up cadence", "h1")]
    story += section("Within 24 hours after a meeting", [
        "Thank every attendee by name and restate the product thesis in one sentence.",
        "List the specific questions or requested materials and identify which are safe to send now.",
        "Confirm the internal owner, next evaluation step, and a proposed follow-up date.",
        "Do not attach the full private package unless its recipients and purpose are confirmed.",
    ])
    story += [p("Five-business-day follow-up", "h2"), callout(
        "I wanted to follow up on Franchise Mobile and the proposed NBA 2K MyNBA/MyGM companion. The clearest next step would be a focused product and technical evaluation of the mobile-to-console league loop. I am happy to provide the one-page overview, guided demo, or a protected viewer session to the appropriate team. Please let me know who should own the next conversation.",
        GREEN,
    )]
    story += [Spacer(1, 14), callout("Send the smallest useful artifact first. Expand access only when the recipient, purpose, and next step are confirmed.", RED)]
    doc.build(story)
    return target


def build_deck_pdf():
    target = OUT / "Franchise_Mobile_x_NBA_2K_Strategic_Integration_Deck.pdf"
    pages = sorted(RENDERED.glob("slide-*.png"))
    doc = BaseDocTemplate(str(target), pagesize=landscape(letter), leftMargin=0, rightMargin=0, topMargin=0, bottomMargin=0)
    frame = Frame(0, 0, landscape(letter)[0], landscape(letter)[1], leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates(PageTemplate(id="slides", frames=[frame]))
    story = []
    for idx, page in enumerate(pages):
        story.append(RLImage(str(page), width=landscape(letter)[0], height=landscape(letter)[1]))
        if idx < len(pages) - 1:
            story.append(PageBreak())
    doc.build(story)
    return target


def build_tracker():
    target = OUT / "Franchise_Mobile_Private_Pitch_Access_Tracker.csv"
    headers = [
        "Recipient", "Company", "Role", "Business Email", "LinkedIn URL", "Referral / Source",
        "First Contact", "Current Stage", "Materials Sent", "Viewer Account ID", "Access Starts",
        "Access Expires", "Revoked", "NDA / Legal Status", "Next Action", "Next Action Date",
        "Owner", "Meeting Notes / Requests",
    ]
    with target.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(headers)
        writer.writerow(["", "", "", "", "", "", "", "Connection note sent", "None", "", "", "", "No", "Not required yet", "Wait for response", "", "Marlano Lewis", ""])
    return target


def build_readme():
    target = OUT / "README_PRIVATE_PITCH_PACKAGE.txt"
    target.write_text(
        "FRANCHISE MOBILE x NBA 2K — PRIVATE PITCH PACKAGE\n\n"
        "FIRST CONTACT\n"
        "- Send the LinkedIn connection note only.\n"
        "- If they respond with interest, send the one-page teaser.\n"
        "- Send this full package only after a meeting or protected evaluation is confirmed.\n\n"
        "MEETING MATERIALS\n"
        "- One Page Teaser.pdf: approved non-confidential first attachment.\n"
        "- Strategic Integration Deck.pptx: editable presenter deck.\n"
        "- Strategic Integration Deck.pdf: fixed-layout sharing copy.\n"
        "- Guided Demo.pdf: ten-minute live walkthrough and fallbacks.\n"
        "- Meeting and QA Runbook.pdf: prepared answers and follow-up discipline.\n"
        "- Response Templates.pdf: approved language for outreach and protected follow-up.\n"
        "- Private Pitch Access Checklist.pdf: recipient and revocation process.\n"
        "- Private Pitch Access Tracker.csv: private access log.\n"
        "- Backup Visual Reel.mp4: silent visual fallback when live demo is unavailable.\n\n"
        "DO NOT SHARE\n"
        "- Founder credentials or local credential files.\n"
        "- Firebase Console or production project access.\n"
        "- GitHub or repository access.\n"
        "- Source code, simulation formulas, CPU decision weights, raw player datasets, or unreleased roadmap material.\n\n"
        "POSITIONING\n"
        "- Working app screens are prototype evidence.\n"
        "- Console/mobile synchronization is a proposed NBA 2K integration.\n"
        "- No affiliation, license, approval, or public API is claimed.\n",
        encoding="utf-8",
    )
    return target


def main():
    DOCS.mkdir(parents=True, exist_ok=True)
    outputs = [
        build_deck_pdf(),
        build_guided_demo(),
        build_qa(),
        build_access_checklist(),
        build_response_templates(),
        build_tracker(),
        build_readme(),
    ]
    for output in outputs:
        print(output)


if __name__ == "__main__":
    main()
