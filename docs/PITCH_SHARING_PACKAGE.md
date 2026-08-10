# Franchise Mobile x NBA 2K Private Integration Pitch

This is the internal operating guide for presenting Franchise Mobile as a strategic NBA 2K integration concept. It is not a generic standalone-app investor pitch, and it is not legal advice.

## The Proposal

Franchise Mobile becomes the persistent social and front-office companion for NBA 2K MyNBA and MyGM.

- The console or PC game remains the home of full NBA 2K gameplay.
- The mobile app keeps the same league active away from the gaming system.
- League rosters, schedules, standings, trades, coaching decisions, commissioner settings, alerts, and social activity stay synchronized.
- A GM can prepare on mobile, play the scheduled game in NBA 2K, and return to mobile for results, box scores, league reaction, and the next decision.
- Human vacancies remain viable through CPU control until another GM joins.

The product should be positioned as an extension of MyNBA/MyGM engagement, not a replacement for NBA 2K gameplay.

The north-star vision is broader: bring the NBA 2K community closer through a persistent mobile home. MyNBA/MyGM is the focused first integration; a later phase could extend the same identity, scheduling, social, group, and competition infrastructure into the MyCAREER community.

## Who The Pitch Is For

- **Take-Two strategy or corporate development** - strategic value, ownership or partnership structure, portfolio fit, engagement, and commercial opportunity.
- **2K product and publishing leadership** - NBA 2K roadmap fit, player retention, community growth, live engagement, and product differentiation.
- **Visual Concepts NBA 2K development leadership** - MyNBA/MyGM workflow, online league continuity, data synchronization, game-result handoff, and implementation feasibility.

The first request is a product and technical evaluation meeting. Detailed formulas, source code, and private data are reserved for a protected diligence stage.

## Why The Concept Fits

- 2K has already established console-to-mobile continuity through MyTEAM Mobile, where console and mobile activity share progress and collections.
- NBA 2K26 expanded MyNBA/MyGM with public online playoffs, adjustable simulations, deeper scenarios, and continued franchise-mode investment.
- Franchise Mobile applies that connected-device model to the underserved franchise, commissioner, and social GM experience.

## What The Recipient Receives

- A private Expo or TestFlight demo link.
- A named viewer account created only for that recipient.
- A short access window with a stated expiration date.
- A guided walkthrough or a concise list of approved screens to explore.
- A one-page product overview or pitch deck that explains product value without exposing implementation details.

Do not send source code, Firebase Console access, GitHub access, service-account files, environment files, simulation formulas, raw player-rating datasets, or private roadmap documents.

## Approved Demo Story

The pitch should show a deliberate NBA 2K integration story in roughly 10 minutes:

1. **Open with the connected league** - Explain that this is the same MyNBA league continuing on mobile while the user is away from the console or PC.
2. **Show persistent league control** - Enter the prepared 30-team league and show franchise ownership, CPU-controlled vacancies, rosters, schedule, standings, and commissioner structure.
3. **Show mobile GM depth** - Open player cards and explain tiers, archetypes, grades, potential, scouting, player development, and front-office evaluation.
4. **Show the social management loop** - Visit Command Center, GM Lounge, Trade Center, Coaching Room, Player Wire, league news, alerts, and statistics.
5. **Show the NBA 2K handoff** - Select a scheduled matchup and explain that the game can be played in NBA 2K on console or PC, with the result and authoritative statistics synchronized back to the league.
6. **Show returned game evidence** - Open a seeded completed game and show the final score, quarter scoring, top performers, full box score, standings effect, and league-wide stat impact.
7. **Show continuous engagement** - Explain trade negotiations, matchup requests, preparation, notifications, commissioner tools, offseason flow, and CPU continuity between console sessions.
8. **Present the expansion vision** - Briefly show how the same connected-community foundation could later support MyCAREER teammates, squads, organized competition, creator communities, and persistent player identity.
9. **Close with the integration request** - Ask for a product and technical evaluation of a focused MyNBA/MyGM-connected prototype, with commercial structure, MyCAREER expansion, and deeper diligence to follow.

The demo uses seeded/sample results and bundled assets. Do not attempt unavailable server-backed actions during the pitch.

## Founder And Viewer Access

- Use the founder account only for an owner-led presentation.
- Give outside recipients viewer accounts, never the founder account.
- Create a unique viewer account per recipient when practical.
- Send the demo link and password through separate channels.
- Never paste `pitch-demo-credentials.json` into email, chat, a deck, or a shared folder.
- Record the recipient, account, date shared, and expiration date in a private access log.

## Before Sharing

From the project folder, run:

```bash
npm run demo:pitch:verify
npm run test:security
npm run security:pitch
```

Then manually confirm:

- The app identifies the Firebase target as the isolated demo environment.
- The founder can enter the prepared league and open the approved walkthrough screens.
- The viewer can browse but cannot claim a team or use destructive/admin controls.
- At least one seeded final game shows players in both box scores.
- League stats include players from the seeded completed games.
- No secret, debug, Firebase, or source-code information appears on screen.
- The private demo link opens on the target device.

## Sharing Message Checklist

The message sent to a recipient should include only:

- Why they are receiving the demo.
- The private demo link.
- Their viewer email or account identifier.
- The access expiration date.
- A request not to forward, record, reproduce, or distribute the demo.
- A contact method for access problems.

Send the temporary password separately.

## During The Pitch

- Present from the founder account while screen sharing.
- Keep Firebase Console, terminal windows, source code, and credentials closed.
- Follow the approved demo story instead of exploring untested screens live.
- Discuss outcomes and product differentiation, not exact formulas or implementation details.
- Note questions that require follow-up instead of opening private technical material.

## After The Pitch

- Disable or delete the recipient's viewer account when access expires.
- Rotate any credential that may have been exposed.
- Review Firebase activity for unexpected access.
- Record who attended, what was shown, what was requested, and the agreed follow-up.
- Share deeper material only through a separately approved diligence process.

## Package Contents To Prepare

- `Franchise Mobile x NBA 2K - Strategic Integration Overview.pdf`
- `Franchise Mobile x NBA 2K - Guided Product Demo.pdf`
- `Franchise Mobile x NBA 2K - Integration Flow.pdf`
- Private demo link
- Recipient-specific viewer account
- Private access log retained by the founder
- Optional NDA reviewed by counsel for smaller or lower-trust meetings

The product overview and guided demo should contain screenshots and product value only. They must not contain passwords, source paths, Firebase identifiers, API keys, repository links, private formulas, or raw proprietary datasets.

## Official Product Context

- 2K Support: MyTEAM Mobile shares progress and collection activity with supported console accounts: https://support.2k.com/hc/en-us/articles/26105260862867-NBA-2K-General-Info-MyTEAM-Mobile-FAQ
- 2K Newsroom: NBA 2K26 expanded MyNBA/MyGM with online playoffs, adjustable simulations, and deeper franchise features: https://newsroom.2k.com/news/endless-possibilities-await-as-mynba-levels-up-in-nbar-2k26
- 2K Newsroom: NBA 2K25 described MyGM as a full general-manager role-playing experience developed by Visual Concepts: https://newsroom.2k.com/news/nbar-2k25-showcases-all-new-stephen-curry-mynba-era-and-introduces-mygm-on-playstationr5-xbox-series-xs-and-pc
