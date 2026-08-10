import fs from "node:fs/promises";
import path from "node:path";
import { Presentation, PresentationFile } from "/Users/marlovibes/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "output/pitch-package");
const RENDERED = path.join(OUT, "rendered");
const ASSETS = path.join(OUT, "assets");

const C = {
  bg: "#070B0E",
  panel: "#10171C",
  panel2: "#151E24",
  line: "#26343C",
  text: "#F7FAFC",
  muted: "#A8B5BD",
  green: "#00E59B",
  cyan: "#35C7F0",
  amber: "#F5B82E",
  red: "#FF5D73",
};

async function writeBlob(filePath, blob) {
  await fs.writeFile(filePath, new Uint8Array(await blob.arrayBuffer()));
}

function addText(slide, text, x, y, w, h, size = 24, color = C.text, bold = false, align = "left") {
  const shape = slide.shapes.add({
    geometry: "textbox",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  shape.text = text;
  shape.text.style = {
    fontSize: size,
    bold,
    color,
    typeface: "Aptos",
    alignment: align,
    verticalAlignment: "middle",
    autoFit: "shrinkText",
    insets: { left: 0, right: 0, top: 0, bottom: 0 },
  };
  return shape;
}

function addRect(slide, x, y, w, h, fill = C.panel, stroke = C.line, radius = "rounded-xl") {
  return slide.shapes.add({
    geometry: radius ? "roundRect" : "rect",
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { style: "solid", fill: stroke, width: 1.25 },
    ...(radius ? { borderRadius: radius } : {}),
  });
}

function addRule(slide, x, y, w, color = C.green, h = 4) {
  return addRect(slide, x, y, w, h, color, color, null);
}

function addHeader(slide, eyebrow, title, subtitle = "") {
  addText(slide, eyebrow.toUpperCase(), 64, 38, 520, 26, 16, C.green, true);
  addText(slide, title, 64, 72, 1135, 64, 38, C.text, true);
  if (subtitle) addText(slide, subtitle, 64, 138, 1100, 48, 20, C.muted, false);
  addRule(slide, 64, 196, 1152, C.line, 2);
}

function addFooter(slide, number, label = "PRIVATE STRATEGIC DISCUSSION") {
  addText(slide, label, 64, 682, 500, 18, 12, "#6D7B83", true);
  addText(slide, String(number).padStart(2, "0"), 1160, 682, 56, 18, 12, "#6D7B83", true, "right");
}

function addBullet(slide, text, x, y, w, color = C.text, accent = C.green, size = 22) {
  addRect(slide, x, y + 9, 9, 9, accent, accent, "rounded-full");
  addText(slide, text, x + 22, y, w - 22, 54, size, color, false);
}

function addMetric(slide, value, label, x, y, w, accent) {
  addRect(slide, x, y, w, 132, C.panel2, accent, "rounded-xl");
  addText(slide, value, x + 18, y + 18, w - 36, 54, 38, accent, true);
  addText(slide, label.toUpperCase(), x + 18, y + 78, w - 36, 28, 15, C.muted, true);
}

function addPill(slide, label, x, y, w, accent = C.green) {
  addRect(slide, x, y, w, 36, "#0B1514", accent, "rounded-full");
  addText(slide, label, x + 10, y + 2, w - 20, 30, 14, accent, true, "center");
}

async function addImage(slide, filename, x, y, w, h, alt) {
  const bytes = await fs.readFile(path.join(ASSETS, filename));
  return slide.images.add({
    blob: bytes,
    contentType: "image/png",
    alt,
    fit: "cover",
    geometry: "roundRect",
    borderRadius: "rounded-xl",
    position: { left: x, top: y, width: w, height: h },
  });
}

function notes(slide, body, sources = []) {
  const sourceBlock = sources.length
    ? `\n\n[Sources]\n${sources.map((source) => `- ${source}`).join("\n")}\n[/Sources]`
    : "";
  slide.speakerNotes.textFrame.setText(`${body}${sourceBlock}`);
}

async function main() {
  await fs.mkdir(RENDERED, { recursive: true });
  const deck = Presentation.create({ slideSize: { width: 1280, height: 720 } });

  // 1. Title
  {
    const s = deck.slides.add();
    s.background.fill = C.bg;
    addRule(s, 0, 0, 1280, C.green, 10);
    addText(s, "FRANCHISE MOBILE x NBA 2K", 68, 76, 760, 34, 18, C.green, true);
    addText(s, "Keep the league alive\nafter the console turns off.", 68, 134, 760, 170, 54, C.text, true);
    addText(s, "A persistent mobile community and front-office companion for MyNBA and MyGM.", 68, 330, 650, 72, 25, C.muted);
    addPill(s, "WORKING PROTOTYPE", 68, 448, 190, C.cyan);
    addPill(s, "PROPOSED 2K INTEGRATION", 274, 448, 232, C.amber);
    addRect(s, 838, 82, 350, 542, C.panel, C.green, "rounded-2xl");
    await addImage(s, "command-center.png", 875, 110, 276, 490, "Franchise Mobile Command Center prototype");
    addText(s, "Private strategic discussion", 68, 635, 500, 24, 14, "#71808A", true);
    notes(s, "Open with one sentence: Franchise Mobile extends a MyNBA or MyGM league into the hours when players are away from console or PC. Clarify immediately that NBA 2K remains the authoritative gameplay experience.", ["Internal Franchise Mobile prototype screenshot, captured 2026-07-06."]);
  }

  // 2. Problem
  {
    const s = deck.slides.add();
    s.background.fill = C.bg;
    addHeader(s, "The gap", "The game ends. The league should not.", "Franchise communities lose momentum when essential activity moves into disconnected tools.");
    const rows = [
      ["01", "Coordination fragments", "Schedules, rules, trades, and availability move into third-party chats and spreadsheets."],
      ["02", "Vacancies stall the league", "A missing GM can block matchups, negotiations, and season progression."],
      ["03", "Management waits for console time", "Routine front-office decisions compete with the time required to launch and play the full game."],
    ];
    rows.forEach((row, i) => {
      const y = 236 + i * 132;
      addText(s, row[0], 74, y, 62, 52, 30, i === 1 ? C.amber : C.green, true);
      addText(s, row[1], 156, y, 340, 46, 25, C.text, true);
      addText(s, row[2], 510, y - 2, 660, 62, 20, C.muted);
      if (i < 2) addRule(s, 156, y + 92, 1010, C.line, 1);
    });
    addFooter(s, 2);
    notes(s, "Frame the problem as league continuity, not as a complaint about NBA 2K. The opportunity is to consolidate activity that already occurs outside the game and route it back toward scheduled NBA 2K play.");
  }

  // 3. Connected loop
  {
    const s = deck.slides.add();
    s.background.fill = C.bg;
    addHeader(s, "Product thesis", "One league. Two surfaces. Continuous engagement.", "Mobile handles asynchronous management and community; NBA 2K owns the playable basketball experience.");
    const nodes = [
      { x: 75, title: "PREPARE", body: "Roster, trades, scouting, strategy", color: C.cyan },
      { x: 372, title: "PLAY", body: "Authoritative game on console or PC", color: C.green },
      { x: 669, title: "SYNC", body: "Results, box scores, standings, injuries", color: C.amber },
      { x: 966, title: "REACT", body: "News, chat, votes, next decisions", color: C.red },
    ];
    nodes.forEach((n, i) => {
      addRect(s, n.x, 288, 235, 190, C.panel2, n.color, "rounded-xl");
      addText(s, n.title, n.x + 20, 314, 195, 38, 24, n.color, true);
      addText(s, n.body, n.x + 20, 364, 195, 76, 19, C.text);
      if (i < nodes.length - 1) {
        addRule(s, n.x + 235, 380, 62, C.line, 3);
        addText(s, "›", n.x + 251, 354, 28, 48, 34, C.muted, true, "center");
      }
    });
    addText(s, "The next console session begins before the previous league conversation ends.", 160, 540, 960, 56, 28, C.text, true, "center");
    addFooter(s, 3);
    notes(s, "Walk left to right. This is a proposed product loop, not a claim that a public NBA 2K integration API exists. The exact account linking, synchronization contract, and server authority would be determined with 2K and Visual Concepts.");
  }

  // 4. Working proof
  {
    const s = deck.slides.add();
    s.background.fill = C.bg;
    addHeader(s, "Working proof", "The league operating layer already exists.", "The pitch demo is isolated, seeded, and designed to show a complete franchise-management loop.");
    addMetric(s, "30", "CPU-ready franchises", 72, 240, 248, C.green);
    addMetric(s, "530", "Rostered players", 338, 240, 248, C.cyan);
    addMetric(s, "1,230", "Game schedule", 604, 240, 248, C.amber);
    addMetric(s, "12", "Seeded showcase games", 870, 240, 338, C.red);
    addText(s, "Prototype systems demonstrated", 72, 420, 440, 38, 22, C.text, true);
    const pills = [
      ["Commissioner tools", 72, 474, 190], ["CPU vacancies", 274, 474, 158], ["Trade rooms", 444, 474, 140],
      ["Player intelligence", 596, 474, 190], ["League stats", 798, 474, 146], ["Social moderation", 956, 474, 202],
      ["Schedules + standings", 72, 526, 218], ["Game results", 302, 526, 148], ["Coaching prep", 462, 526, 164],
      ["Offseason flow", 638, 526, 154], ["Alerts + news", 804, 526, 154], ["Viewer-safe demo", 970, 526, 188],
    ];
    pills.forEach(([label, x, y, w], i) => addPill(s, label, x, y, w, i % 3 === 0 ? C.green : i % 3 === 1 ? C.cyan : C.amber));
    addFooter(s, 4);
    notes(s, "These figures describe the current isolated pitch-demo dataset, not market traction. State plainly that the prototype demonstrates product depth and workflow feasibility; it does not yet represent a live NBA 2K integration.", ["Internal pitch-demo verification and seeded Firestore dataset, verified 2026-08-04."]);
  }

  // 5. Experience
  {
    const s = deck.slides.add();
    s.background.fill = C.bg;
    addHeader(s, "Mobile GM experience", "A front office that travels with the player.", "Designed for quick decisions, sustained league activity, and a direct return path to NBA 2K.");
    await addImage(s, "trade-center.png", 70, 220, 300, 420, "Trade Center prototype");
    await addImage(s, "command-center.png", 490, 220, 300, 420, "Command Center prototype");
    await addImage(s, "league-chat.png", 910, 220, 300, 420, "League Chat prototype");
    addText(s, "NEGOTIATE", 105, 608, 230, 28, 16, C.cyan, true, "center");
    addText(s, "OPERATE", 525, 608, 230, 28, 16, C.green, true, "center");
    addText(s, "CONNECT", 945, 608, 230, 28, 16, C.amber, true, "center");
    addFooter(s, 5);
    notes(s, "Show that the product is not only a stat viewer. It combines front-office operations, commissioner control, social coordination, moderation, and league-wide continuity in one mobile workflow.", ["Internal Franchise Mobile prototype screenshots, captured 2026-07-06."]);
  }

  // 6. Handoff
  {
    const s = deck.slides.add();
    s.background.fill = C.bg;
    addHeader(s, "The handoff", "Mobile decisions create reasons to return to NBA 2K.", "The console or PC game remains the moment of truth; the companion makes that moment easier to reach.");
    addRect(s, 72, 236, 480, 350, C.panel, C.cyan, "rounded-2xl");
    await addImage(s, "season.png", 95, 258, 210, 304, "Season calendar prototype");
    addText(s, "AWAY FROM CONSOLE", 334, 270, 190, 26, 15, C.cyan, true);
    addBullet(s, "Review schedule and standings", 334, 318, 190, C.text, C.cyan, 18);
    addBullet(s, "Prepare matchup strategy", 334, 382, 190, C.text, C.cyan, 18);
    addBullet(s, "Coordinate availability", 334, 446, 190, C.text, C.cyan, 18);
    addBullet(s, "Resolve league business", 334, 510, 190, C.text, C.cyan, 18);
    addText(s, "→", 579, 365, 90, 78, 58, C.green, true, "center");
    addRect(s, 698, 236, 510, 350, C.panel2, C.green, "rounded-2xl");
    addText(s, "ON NBA 2K", 730, 268, 220, 28, 15, C.green, true);
    addText(s, "Play the scheduled matchup", 730, 315, 430, 54, 30, C.text, true);
    addText(s, "NBA 2K remains authoritative for gameplay outcomes, licensed content, player data, anti-cheat, and platform services.", 730, 392, 420, 110, 22, C.muted);
    addPill(s, "RESULTS RETURN TO THE LEAGUE", 730, 526, 320, C.amber);
    addFooter(s, 6);
    notes(s, "This slide protects the product boundary. Franchise Mobile contributes the mobile operating layer; NBA 2K remains responsible for licensed presentation, playable basketball, authoritative outcomes, identity, entitlements, anti-cheat, and final synchronization contracts.", ["Internal Franchise Mobile season screenshot, captured 2026-07-13."]);
  }

  // 7. Strategic value
  {
    const s = deck.slides.add();
    s.background.fill = C.bg;
    addHeader(s, "Strategic value", "More league life. More reasons to return.", "The opportunity is not more screen time for its own sake; it is healthier, more persistent communities around NBA 2K.");
    const cols = [
      ["ENGAGEMENT", "Create useful daily touchpoints between full game sessions.", C.green],
      ["RETENTION", "Reduce league drop-off by keeping schedules, vacancies, and decisions moving.", C.cyan],
      ["COMMUNITY", "Bring coordination and conversation into a first-party connected ecosystem.", C.amber],
      ["DIFFERENTIATION", "Give MyNBA and MyGM a persistent identity beyond the console session.", C.red],
    ];
    cols.forEach((col, i) => {
      const x = 70 + i * 298;
      addRule(s, x, 242, 240, col[2], 7);
      addText(s, col[0], x, 274, 240, 34, 18, col[2], true);
      addText(s, col[1], x, 326, 240, 144, 22, C.text);
    });
    addRect(s, 70, 520, 1138, 84, "#0B1514", C.green, "rounded-xl");
    addText(s, "Precedent exists for connected console/mobile progression. Franchise Mobile applies that direction to franchise and community continuity.", 96, 536, 1086, 54, 22, C.text, true, "center");
    addFooter(s, 7);
    notes(s, "Present these as strategic hypotheses for evaluation, not guaranteed business outcomes. 2K already supports shared progress between MyTEAM Mobile and supported console accounts, and recent NBA 2K releases have continued investing in MyNBA and MyGM. Franchise Mobile's fit is an inference from those published directions.", ["https://support.2k.com/hc/en-us/articles/26105260862867-NBA-2K-General-Info-MyTEAM-Mobile-FAQ", "https://newsroom.2k.com/news/endless-possibilities-await-as-mynba-levels-up-in-nbar-2k26", "https://newsroom.2k.com/news/nbar-2k25-showcases-all-new-stephen-curry-mynba-era-and-introduces-mygm-on-playstationr5-xbox-series-xs-and-pc"]);
  }

  // 8. Expansion
  {
    const s = deck.slides.add();
    s.background.fill = C.bg;
    addHeader(s, "Expansion roadmap", "Start with franchise. Grow into the broader community.", "MyNBA and MyGM provide the focused first integration; MyCAREER community is the strategic upside.");
    const phases = [
      ["01", "CONNECTED FRANCHISE", "MyNBA / MyGM league management, commissioner tools, schedules, trades, results, and social activity.", C.green],
      ["02", "ORGANIZED PLAY", "Creator leagues, community events, availability, matchup scheduling, groups, and persistent rivalry history.", C.cyan],
      ["03", "MyCAREER COMMUNITY", "Teammate discovery, squads, player identity, scheduled sessions, and community coordination outside console.", C.amber],
    ];
    phases.forEach((p, i) => {
      const y = 228 + i * 132;
      addText(s, p[0], 76, y, 62, 48, 30, p[3], true);
      addRect(s, 148, y - 4, 1030, 98, C.panel, p[3], "rounded-xl");
      addText(s, p[1], 174, y + 8, 320, 34, 22, p[3], true);
      addText(s, p[2], 510, y + 4, 630, 62, 19, C.text);
    });
    addText(s, "Roadmap only — not represented as current functionality.", 760, 626, 420, 24, 15, C.muted, true, "right");
    addFooter(s, 8);
    notes(s, "Keep this section brief. The focused ask is MyNBA and MyGM. MyCAREER community should be presented as a later expansion after the connected franchise loop proves product and technical fit.", ["Strategic roadmap developed from the Franchise Mobile product concept; no claim of announced 2K functionality."]);
  }

  // 9. Pilot
  {
    const s = deck.slides.add();
    s.background.fill = C.bg;
    addHeader(s, "Focused pilot", "Prove the connected loop before scaling it.", "A narrow evaluation can answer product, technical, security, and community questions without exposing proprietary implementation.");
    const steps = [
      ["1", "PRODUCT WORKSHOP", "Align on one target league workflow and success criteria."],
      ["2", "TECHNICAL DISCOVERY", "Define account linking, permissions, event sync, and server authority."],
      ["3", "SANDBOX PROTOTYPE", "Connect a limited test league with controlled data and participants."],
      ["4", "EVALUATION", "Measure league activity, reliability, return-to-game behavior, and user value."],
    ];
    steps.forEach((step, i) => {
      const x = 70 + i * 298;
      addRect(s, x, 238, 250, 310, C.panel, i === 3 ? C.green : C.line, "rounded-xl");
      addText(s, step[0], x + 20, 260, 46, 46, 28, i === 3 ? C.green : C.cyan, true);
      addText(s, step[1], x + 20, 324, 210, 52, 20, C.text, true);
      addText(s, step[2], x + 20, 392, 210, 118, 19, C.muted);
    });
    addPill(s, "NO SOURCE-CODE ACCESS REQUIRED FOR INITIAL EVALUATION", 355, 584, 570, C.amber);
    addFooter(s, 9);
    notes(s, "The objective is a product and technical evaluation, not an immediate commercial demand. Source code, simulation formulas, raw player-rating datasets, credentials, private security architecture, and unreleased roadmap details remain reserved for a separately protected diligence stage.");
  }

  // 10. Ask
  {
    const s = deck.slides.add();
    s.background.fill = C.bg;
    addRule(s, 0, 0, 1280, C.green, 10);
    addText(s, "THE INITIAL ASK", 72, 76, 300, 28, 16, C.green, true);
    addText(s, "Evaluate a connected\nMyNBA / MyGM prototype.", 72, 128, 700, 142, 48, C.text, true);
    addText(s, "Bring the right product and technical owners into one focused conversation.", 72, 292, 650, 60, 24, C.muted);
    const stakeholders = [
      ["NBA 2K PRODUCT", "Roadmap and player value"],
      ["VISUAL CONCEPTS", "MyNBA / MyGM workflow and feasibility"],
      ["2K ONLINE + MOBILE", "Identity, services, permissions, synchronization"],
      ["TAKE-TWO STRATEGY", "Partnership and commercial structure"],
    ];
    stakeholders.forEach((st, i) => {
      const x = 72 + (i % 2) * 340;
      const y = 402 + Math.floor(i / 2) * 94;
      addRect(s, x, y, 320, 76, C.panel, i === 0 ? C.green : C.line, "rounded-xl");
      addText(s, st[0], x + 16, y + 10, 288, 24, 15, i === 0 ? C.green : C.cyan, true);
      addText(s, st[1], x + 16, y + 36, 288, 26, 16, C.text);
    });
    addRect(s, 846, 116, 350, 462, "#0B1514", C.green, "rounded-2xl");
    addText(s, "DESIRED OUTCOME", 878, 152, 286, 28, 16, C.green, true);
    addText(s, "Agreement on whether to explore a sandbox pilot, licensing path, strategic partnership, acquisition discussion, or another mutually appropriate structure.", 878, 210, 286, 218, 26, C.text, true);
    addText(s, "Franchise Mobile keeps the league connected. NBA 2K remains where basketball is played.", 878, 466, 286, 80, 20, C.muted);
    addText(s, "Non-confidential overview • No affiliation with Take-Two, 2K, Visual Concepts, NBA, NBPA, NFL, or MLB is claimed.", 72, 660, 1110, 24, 12, "#6D7B83");
    notes(s, "Close with the product and technical evaluation request. Do not negotiate detailed commercial terms in the first meeting. Capture requested follow-up and move sensitive material into a separate diligence process only after scope and recipients are confirmed.");
  }

  for (const [index, slide] of deck.slides.items.entries()) {
    const stem = `slide-${String(index + 1).padStart(2, "0")}`;
    await writeBlob(path.join(RENDERED, `${stem}.png`), await deck.export({ slide, format: "png", scale: 1 }));
    const layout = await slide.export({ format: "layout" });
    await fs.writeFile(path.join(RENDERED, `${stem}.layout.json`), await layout.text());
  }
  await writeBlob(path.join(RENDERED, "deck-montage.webp"), await deck.export({ format: "webp", montage: true, scale: 1 }));
  const pptx = await PresentationFile.exportPptx(deck);
  await pptx.save(path.join(OUT, "Franchise_Mobile_x_NBA_2K_Strategic_Integration_Deck.pptx"));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
