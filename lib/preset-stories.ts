/**
 * Preset Consequences stories per template — funny through crude — starring
 * well-known celebrities. Used for sample games and the in-game "random"
 * fill buttons so players can skip typing.
 */

export type PresetTone = "funny" | "cheeky" | "rude" | "crude";

export type PresetStory = {
  id: string;
  tone: PresetTone;
  /** Short label for UI / logs. */
  title: string;
  /** promptId → answer text (no segment wrappers). */
  answers: Record<string, string>;
};

/** Complete ready-made stories keyed by template id. */
export const PRESET_STORIES: Record<string, PresetStory[]> = {
  classic: [
    {
      id: "classic-funny",
      tone: "funny",
      title: "Gordon meets Taylor at Costco",
      answers: {
        p1: "slightly unhinged",
        p2: "Gordon Ramsay",
        p3: "aggressively glittery",
        p4: "Taylor Swift",
        p5: "a Costco sample aisle at 9am",
        p6: "argue about whether free pizza counts as a date",
        p7: "a chef's jacket made entirely of oven mitts",
        p8: "a friendship-bracelet ballgown and muddy wellies",
        p9: "screamed THIS SCALLOP IS RAW at a frozen fish display",
        p10: "wrote a 12-minute ballad about the sample lady",
        p11: "Costco hired them both as chaotic brand ambassadors",
        p12: '"Finally, a meet-cute with nutritional labelling."',
      },
    },
    {
      id: "classic-cheeky",
      tone: "cheeky",
      title: "Harry & Emily in the sauna",
      answers: {
        p1: "sweaty and optimistic",
        p2: "Harry Styles",
        p3: "dangerously charming",
        p4: "Emily Ratajkowski",
        p5: "an overcrowded hotel sauna",
        p6: "pretend they were there for the health benefits",
        p7: "nothing but a tiny towel and confidence",
        p8: "a towel that kept mysteriously slipping",
        p9: "offered her a grape like it was a marriage proposal",
        p10: "said the steam was making her philosophical about thirst",
        p11: "they were kicked out for fogging up the CCTV",
        p12: '"Well that escalated in a very moist way."',
      },
    },
    {
      id: "classic-rude",
      tone: "rude",
      title: "Pete & Kim at the afterparty",
      answers: {
        p1: "horny on main",
        p2: "Pete Davidson",
        p3: "unapologetically messy",
        p4: "Kim Kardashian",
        p5: "a bathroom queue at a Met Gala afterparty",
        p6: "escape a boring investor",
        p7: "a leather jacket and almost no shirt",
        p8: "a skintight dress that left nothing to the imagination",
        p9: "asked if she wanted to see his tattoo collection somewhere private",
        p10: "said only if he promised not to cry afterward",
        p11: "they hooked up in a coat closet and lost Kim's earring",
        p12: '"Iconic. Trashy. Content."',
      },
    },
    {
      id: "classic-crude",
      tone: "crude",
      title: "Bad Bunny & Madonna get naked",
      answers: {
        p1: "feral",
        p2: "Bad Bunny",
        p3: "legendary and unhinged",
        p4: "Madonna",
        p5: "the VIP hot tub at Coachella",
        p6: "christen the weekend properly",
        p7: "nothing but body glitter and a gold chain",
        p8: "a cone bra and an evil grin",
        p9: "got completely naked and cannonballed in",
        p10: "stripped, joined him, and rated his form a solid 8",
        p11: "security politely asked them to put on towels for the livestream",
        p12: '"Age is just a number and so is public indecency."',
      },
    },
    {
      id: "classic-crude-2",
      tone: "crude",
      title: "Florence & Timothée in Venice",
      answers: {
        p1: "art-house horny",
        p2: "Florence Pugh",
        p3: "soft-boy chaotic",
        p4: "Timothée Chalamet",
        p5: "a gondola that was definitely not built for two egos",
        p6: "rehearse an awards speech nobody asked for",
        p7: "a slip dress with nothing underneath",
        p8: "a tiny tank top and trousers hanging on for dear life",
        p9: "pulled him into a passionate snog mid-canal",
        p10: "whispered something extremely filthy in French",
        p11: "the gondolier quit on the spot and sold the story",
        p12: '"Cinema is back, baby — and so is public PDA."',
      },
    },
  ],

  short: [
    {
      id: "short-funny",
      tone: "funny",
      title: "Ryan & Zendaya at Pret",
      answers: {
        p1: "Ryan Reynolds",
        p2: "Zendaya",
        p3: "a Pret queue that had emotionally broken everyone",
        p4: '"Is the avocado toast judging me or is that just my face?"',
        p5: '"Both. Sit with it."',
        p6: "they accidentally stole each other's oat-milk lattes and bonded over the crime",
        p7: "they launched a podcast called Soft Boys Hate Hard Foam",
      },
    },
    {
      id: "short-cheeky",
      tone: "cheeky",
      title: "Idris & Margot in first class",
      answers: {
        p1: "Idris Elba",
        p2: "Margot Robbie",
        p3: "the first-class bar on a red-eye to LA",
        p4: '"I don\'t usually do this, but your champagne looks lonely."',
        p5: '"It\'s about to get a roommate."',
        p6: "they shared a blanket and a frankly inappropriate amount of eye contact",
        p7: "the flight attendant asked them to keep the turbulence to themselves",
      },
    },
    {
      id: "short-rude",
      tone: "rude",
      title: "Travis & Sydney backstage",
      answers: {
        p1: "Travis Kelce",
        p2: "Sydney Sweeney",
        p3: "a suspiciously empty backstage corridor",
        p4: '"Nice dress. Shame if someone had to help you out of it."',
        p5: '"Bold of you to assume you\'d be invited."',
        p6: "they made out against a flight case until a roadie coughed loudly",
        p7: "TMZ ran the headline and their agents both sighed in unison",
      },
    },
    {
      id: "short-crude",
      tone: "crude",
      title: "Post Malone & Dua get filthy",
      answers: {
        p1: "Post Malone",
        p2: "Dua Lipa",
        p3: "a sticky VIP bathroom at a festival",
        p4: '"Wanna do something we\'ll both deny tomorrow?"',
        p5: '"Lock the door and don\'t be gentle."',
        p6: "they had a very loud, very vertical encounter against the sink",
        p7: "someone filmed the locked-door soundtrack and it went platinum in group chats",
      },
    },
    {
      id: "short-crude-2",
      tone: "crude",
      title: "Pedro & Aubrey gone wild",
      answers: {
        p1: "Pedro Pascal",
        p2: "Aubrey Plaza",
        p3: "an Airbnb with one bed and zero shame",
        p4: '"I brought wine and bad intentions."',
        p5: '"Good. I\'m already halfway undressed."',
        p6: "they got naked, ordered pizza mid-romp, and tipped the driver without opening the door",
        p7: "the neighbours filed a noise complaint titled 'enthusiastic Spanish'",
      },
    },
  ],

  adventure: [
    {
      id: "adventure-funny",
      tone: "funny",
      title: "Keanu vs the Wi-Fi dragon",
      answers: {
        p1: "Keanu Reeves",
        p2: "a quiet suburb where the Wi-Fi was sentient and petty",
        p3: "the router whispered his true name and challenged him to a duel",
        p4: "a dragon made of buffering circles and unpaid invoices",
        p5: "politely said 'whoa' and unplugged it with honour",
        p6: "even legends need a password reset sometimes",
        p7: "he opened a dojo for emotionally supportive IT support",
      },
    },
    {
      id: "adventure-cheeky",
      tone: "cheeky",
      title: "Rihanna's treasure hunt",
      answers: {
        p1: "Rihanna",
        p2: "a yacht so expensive it had its own therapist",
        p3: "a treasure map tattooed on a very attractive stranger",
        p4: "pirates who demanded she sing for safe passage — and then tip",
        p5: "sang one verse, winked, and stole their ship anyway",
        p6: "power looks better with a little theft",
        p7: "she launched a perfume called Plunder Me",
      },
    },
    {
      id: "adventure-rude",
      tone: "rude",
      title: "The Rock's cursed underwear",
      answers: {
        p1: "Dwayne Johnson",
        p2: "a gym that only opened at 3am for the spiritually jacked",
        p3: "a cursed pair of underwear promised eternal gains",
        p4: "a jealousy demon living in the squat rack",
        p5: "bench-pressed the demon while flexing emotionally",
        p6: "gains mean nothing if you can't clap your cheeks in victory",
        p7: "he filmed a masterclass called 'Smashing Evil (and Personal Bests)'",
      },
    },
    {
      id: "adventure-crude",
      tone: "crude",
      title: "Billie vs the horny oracle",
      answers: {
        p1: "Billie Eilish",
        p2: "a misty valley where everyone's secrets were sticky",
        p3: "an oracle demanded a kiss… and then slightly more",
        p4: "a monster that fed exclusively on repressed thirst",
        p5: "got naked under the moonlight and starved it with radical honesty",
        p6: "shame is just horniness wearing a hoodie",
        p7: "the valley became a clothing-optional wellness retreat",
      },
    },
    {
      id: "adventure-crude-2",
      tone: "crude",
      title: "Michael B. Jordan's wet quest",
      answers: {
        p1: "Michael B. Jordan",
        p2: "a coastal village obsessed with shirtless prophecy",
        p3: "the sea goddess demanded he prove his 'heroic stamina'",
        p4: "a kraken with wandering tentacles and worse manners",
        p5: "wrestled it into submission in the surf, mostly undressed",
        p6: "destiny looks better wet",
        p7: "the village erected a statue that needed a parental advisory plaque",
      },
    },
  ],

  neutral: [
    {
      id: "neutral-funny",
      tone: "funny",
      title: "Tom & Selena at silent disco",
      answers: {
        p1: "Tom Holland",
        p2: "Selena Gomez",
        p3: "a silent disco where nobody was on the same song",
        p4: '"Are you dancing to ABBA or having a medical event?"',
        p5: '"Both. Commit."',
        p6: "started a headphone swap cult called Beat Blind Dating",
        p7: "they became millionaires selling earplugs as 'relationship tools'",
      },
    },
    {
      id: "neutral-cheeky",
      tone: "cheeky",
      title: "Chris & Gal at the museum",
      answers: {
        p1: "Chris Hemsworth",
        p2: "Gal Gadot",
        p3: "a museum after-hours party with too much champagne",
        p4: '"I could lift that statue. Or you. Your call."',
        p5: '"Put the statue down and buy me another drink."',
        p6: "sneaked into the coat check for a very classical makeout",
        p7: "security banned gods from the antiquities wing",
      },
    },
    {
      id: "neutral-rude",
      tone: "rude",
      title: "Doja & The Weeknd texting",
      answers: {
        p1: "Doja Cat",
        p2: "The Weeknd",
        p3: "a rooftop bar where the Wi-Fi password was 'thirsty'",
        p4: '"Your playlist is mid but your face is doing overtime."',
        p5: '"Come closer and say that again."',
        p6: "left early to continue the argument horizontally",
        p7: "their group chat named the night 'professional misconduct'",
      },
    },
    {
      id: "neutral-crude",
      tone: "crude",
      title: "Megan & Machine Gun Kelly uncensored",
      answers: {
        p1: "Megan Thee Stallion",
        p2: "Machine Gun Kelly",
        p3: "a karaoke booth that should have had soundproofing",
        p4: '"Sing less. Touch more."',
        p5: '"Say please and take your jeans off."',
        p6: "got naked between songs and somehow still finished Bohemian Rhapsody",
        p7: "the booth was retired and sold as an NFT called 'Echoes of Bad Decisions'",
      },
    },
    {
      id: "neutral-crude-2",
      tone: "crude",
      title: "Sabrina & Shawn after hours",
      answers: {
        p1: "Sabrina Carpenter",
        p2: "Shawn Mendes",
        p3: "a recording studio at 2am with one working couch",
        p4: '"This track needs more tension. Or less clothing."',
        p5: '"I vote less clothing. Immediately."',
        p6: "scrapped the song, got undressed, and made a much better memory",
        p7: "the engineer pretended not to hear and asked for hazard pay",
      },
    },
  ],
};

function pickIndex(length: number): number {
  return Math.floor(Math.random() * length);
}

/** All preset stories for a template (falls back to classic). */
export function getPresetsForTemplate(templateId: string): PresetStory[] {
  return PRESET_STORIES[templateId] ?? PRESET_STORIES.classic;
}

/** Pick one full preset story at random for a template. */
export function pickRandomPresetStory(templateId: string): PresetStory {
  const presets = getPresetsForTemplate(templateId);
  return presets[pickIndex(presets.length)];
}

/**
 * Pick a random answer for a single prompt from across that template's
 * presets (so fields stay thematically consistent with the library).
 */
export function pickRandomPresetAnswer(
  templateId: string,
  promptId: string
): string | null {
  const options = getPresetsForTemplate(templateId)
    .map((s) => s.answers[promptId]?.trim())
    .filter((a): a is string => Boolean(a));
  if (options.length === 0) return null;
  return options[pickIndex(options.length)];
}

/** Fill every prompt from one randomly chosen preset story. */
export function pickRandomPresetAnswers(
  templateId: string
): Record<string, string> {
  return { ...pickRandomPresetStory(templateId).answers };
}
