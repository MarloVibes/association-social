# Franchise Mobile Private Pitch Package

This is the internal operating guide for sharing the private Franchise Mobile demo. It is not legal advice and should not be sent as the pitch itself.

## What The Recipient Receives

- A private Expo or TestFlight demo link.
- A named viewer account created only for that recipient.
- A short access window with a stated expiration date.
- A guided walkthrough or a concise list of approved screens to explore.
- A one-page product overview or pitch deck that explains product value without exposing implementation details.

Do not send source code, Firebase Console access, GitHub access, service-account files, environment files, simulation formulas, raw player-rating datasets, or private roadmap documents.

## Approved Demo Story

The pitch should show a complete, deliberate product story in roughly 10 minutes:

1. **Franchise selection** - Show the NBA, NFL, and MLB franchise surfaces, then enter the prepared NBA demo league.
2. **League control** - Show the 30-team league, franchise selection, roster, schedule, and commissioner structure.
3. **Player intelligence** - Open player cards and explain tiers, archetypes, skill grades, potential, and front-office evaluation.
4. **Management workflow** - Visit Command Center, Coaching Room, Trade Center, Player Wire, standings, and league statistics.
5. **Game evidence** - Open one of the seeded completed games and show the final score, quarter scoring, top performers, full box score, and league-wide stat impact.
6. **Multiplayer vision** - Show GM Lounge and explain private leagues, CPU-controlled vacancies, social negotiation, and long-term league continuity.
7. **Close** - Explain that the demo is isolated from production and that deeper formulas, source code, and private roadmap material are available only in a protected diligence process.

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

- `Franchise Mobile - Private Product Overview.pdf`
- `Franchise Mobile - Guided Demo.pdf`
- Private demo link
- Recipient-specific viewer account
- Private access log retained by the founder
- Optional NDA reviewed by counsel for smaller or lower-trust meetings

The product overview and guided demo should contain screenshots and product value only. They must not contain passwords, source paths, Firebase identifiers, API keys, repository links, private formulas, or raw proprietary datasets.
