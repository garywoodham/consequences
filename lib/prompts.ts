export type Prompt = {
  id: string;
  label: string;
  /**
   * How this answer is woven into the final story. Supports placeholders:
   * `{answer}` (this prompt's answer), `{person1}` / `{person2}` (the names
   * filled into the 1st/2nd name prompt). Segments are joined with spaces, so
   * include connector words and end-of-sentence punctuation here.
   */
  segment?: string;
  type: "text" | "name";
  placeholder?: string;
};

export type PromptTemplate = {
  id: string;
  name: string;
  description: string;
  prompts: Prompt[];
};

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: "classic",
    name: "Classic",
    description: "Traditional romantic absurdity (12 prompts)",
    prompts: [
      { id: "p1", label: "An adjective", segment: "{answer}", type: "text", placeholder: "e.g. mediocre" },
      { id: "p2", label: "Person 1's name", segment: "{answer}", type: "name", placeholder: "e.g. Alex" },
      { id: "p3", label: "An adjective", segment: "met {answer}", type: "text", placeholder: "e.g. transparent" },
      { id: "p4", label: "Person 2's name", segment: "{answer}", type: "name", placeholder: "e.g. Sam" },
      { id: "p5", label: "Where they met", segment: "at {answer}", type: "text", placeholder: "e.g. the bowling alley" },
      { id: "p6", label: "What they went there for", segment: "to {answer}.", type: "text", placeholder: "e.g. dig for gold" },
      { id: "p7", label: "What Person 1 wore", segment: "{person1} wore {answer}.", type: "text", placeholder: "e.g. a seafoam green leisure suit" },
      { id: "p8", label: "What Person 2 wore", segment: "{person2} wore {answer}.", type: "text", placeholder: "e.g. a sandwich board" },
      { id: "p9", label: "What Person 1 did", segment: "{person1} {answer}.", type: "text", placeholder: "e.g. poured a martini" },
      { id: "p10", label: "What Person 2 did", segment: "{person2} {answer}.", type: "text", placeholder: "e.g. looked at her watch" },
      { id: "p11", label: "What happened as a result", segment: "And the consequence was {answer}.", type: "text", placeholder: "e.g. the band got back together" },
      { id: "p12", label: "What the world said", segment: "And the world said {answer}.", type: "text", placeholder: 'e.g. "Somehow, I think I saw this coming."' },
    ],
  },
  {
    id: "short",
    name: "Short",
    description: "Faster rounds (7 prompts)",
    prompts: [
      { id: "p1", label: "Person 1's name", segment: "{answer}", type: "name", placeholder: "e.g. Dave" },
      { id: "p2", label: "Person 2's name", segment: "and {answer}", type: "name", placeholder: "e.g. Sarah" },
      { id: "p3", label: "Where they met", segment: "met at {answer}.", type: "text", placeholder: "e.g. a coffee shop" },
      { id: "p4", label: "What Person 1 said to Person 2", segment: "{person1} said {answer}.", type: "text", placeholder: 'e.g. "Nice shoes!"' },
      { id: "p5", label: "What Person 2 said back", segment: "{person2} replied {answer}.", type: "text", placeholder: 'e.g. "Thanks, they\'re crocs."' },
      { id: "p6", label: "What happened next", segment: "Then {answer}.", type: "text", placeholder: "e.g. they eloped to Vegas" },
      { id: "p7", label: "The consequence", segment: "Eventually, {answer}.", type: "text", placeholder: "e.g. they became professional magicians" },
    ],
  },
  {
    id: "adventure",
    name: "Adventure",
    description: "Pixar-style hero's journey (7 prompts)",
    prompts: [
      { id: "p1", label: "The hero's name", segment: "{answer}", type: "name", placeholder: "e.g. Captain Quirk" },
      { id: "p2", label: "Their ordinary world", segment: "lived in {answer}.", type: "text", placeholder: "e.g. a quiet village of cheese makers" },
      { id: "p3", label: "The call to adventure", segment: "One day, {answer}.", type: "text", placeholder: "e.g. a talking goat appeared" },
      { id: "p4", label: "The challenge they faced", segment: "But {person1} faced {answer}.", type: "text", placeholder: "e.g. a dragon allergic to dairy" },
      { id: "p5", label: "How they overcame it", segment: "So {person1} {answer}.", type: "text", placeholder: "e.g. offered it lactose-free brie" },
      { id: "p6", label: "What they learned", segment: "{person1} learned that {answer}.", type: "text", placeholder: "e.g. friendship smells like fondue" },
      { id: "p7", label: "How it ended", segment: "In the end, {answer}.", type: "text", placeholder: "e.g. they opened a goat yoga studio" },
    ],
  },
  {
    id: "neutral",
    name: "Simple",
    description: "Easy prompts for any group (7 prompts)",
    prompts: [
      { id: "p1", label: "Person 1's name", segment: "{answer}", type: "name", placeholder: "e.g. Alex" },
      { id: "p2", label: "Person 2's name", segment: "and {answer}", type: "name", placeholder: "e.g. Jordan" },
      { id: "p3", label: "Where they met", segment: "met at {answer}.", type: "text", placeholder: "e.g. a silent disco" },
      { id: "p4", label: "What Person 1 said", segment: "{person1} said {answer}.", type: "text", placeholder: 'e.g. "Is this music?"' },
      { id: "p5", label: "What Person 2 said", segment: "{person2} said {answer}.", type: "text", placeholder: 'e.g. "I think my ears are broken."' },
      { id: "p6", label: "What they did together", segment: "Together, they {answer}.", type: "text", placeholder: "e.g. started a headphone repair business" },
      { id: "p7", label: "The consequence", segment: "Eventually, {answer}.", type: "text", placeholder: "e.g. they became millionaires" },
    ],
  },
];

export function getTemplateById(id: string): PromptTemplate {
  return PROMPT_TEMPLATES.find((t) => t.id === id) ?? PROMPT_TEMPLATES[0];
}
