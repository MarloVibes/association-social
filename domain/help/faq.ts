export type HelpFaqItem = {
  question: string;
  answer: string;
};

export type HelpFaqSection = {
  title: string;
  items: HelpFaqItem[];
};

export function getHelpFaqSections(): HelpFaqSection[] {
  return [
    {
      title: 'Getting Started',
      items: [
        {
          question: 'How do I create a franchise?',
          answer: 'Choose NBA Franchise, NFL Franchise, or MLB Franchise on the main menu, then set up the league from that mode.',
        },
        {
          question: 'Where do I manage my league?',
          answer: 'Open a league from My Leagues. Inside The NBA keeps league news, GM controls, coaching, front office tools, and season management together.',
        },
      ],
    },
    {
      title: 'Gameplay',
      items: [
        {
          question: 'What is Live Mode?',
          answer: 'Live Mode lets you watch a game unfold possession by possession. Final results should only appear after the live sim finishes.',
        },
        {
          question: 'How do player grades work?',
          answer: 'Players are shown through letter grades, tendencies, roles, and basketball context. Raw numbers stay hidden so evaluation feels like scouting.',
        },
      ],
    },
    {
      title: 'Team Building',
      items: [
        {
          question: 'How should trades be checked?',
          answer: 'The Trade Center shows players, salaries, and roster impact so GMs can understand why a deal works or what needs to change.',
        },
        {
          question: 'Where are draft picks and prospects?',
          answer: 'Draft picks and draft classes are separated from normal roster views so players, picks, and prospects stay easier to scan.',
        },
      ],
    },
    {
      title: 'Contact',
      items: [
        {
          question: 'Where do I send business inquiries?',
          answer: 'Email MarloLLC@icloud.com for business inquiries.',
        },
        {
          question: 'Where can I follow or contact Franchise Mobile?',
          answer: 'Reach out on Instagram at FranchiseMobile.',
        },
      ],
    },
  ];
}
