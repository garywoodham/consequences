export type Prompt = {
  id: string;
  label: string;
  prefix?: string;
  suffix?: string;
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
      { id: "p1", label: "An adjective", type: "text", placeholder: "e.g. mediocre" },
      { id: "p2", label: "A man's name", type: "name", placeholder: "e.g. Joe" },
      { id: "p3", label: "An adjective", prefix: "met", type: "text", placeholder: "e.g. transparent" },
      { id: "p4", label: "A woman's name", type: "name", placeholder: "e.g. Kim" },
      { id: "p5", label: "Where they met", prefix: "at", type: "text", placeholder: "e.g. the bowling alley" },
      { id: "p6", label: "What they went there for", prefix: "to", type: "text", placeholder: "e.g. dig for gold" },
      { id: "p7", label: "What he wore", prefix: "He wore", type: "text", placeholder: "e.g. a seafoam green leisure suit" },
      { id: "p8", label: "What she wore", prefix: "She wore", type: "text", placeholder: "e.g. a sandwich board" },
      { id: "p9", label: "What he did", type: "text", placeholder: "e.g. poured a martini" },
      { id: "p10", label: "What she did", type: "text", placeholder: "e.g. looked at her watch" },
      { id: "p11", label: "What happened as a result", prefix: "And the consequence was", type: "text", placeholder: "e.g. the band got back together" },
      { id: "p12", label: "What the world said", prefix: "And the world said", type: "text", placeholder: 'e.g. "Somehow, I think I saw this coming."' },
    ],
  },
  {
    id: "short",
    name: "Short",
    description: "Faster rounds (7 prompts)",
    prompts: [
      { id: "p1", label: "A man's name", type: "name", placeholder: "e.g. Dave" },
      { id: "p2", label: "A woman's name", type: "name", placeholder: "e.g. Sarah" },
      { id: "p3", label: "Where they met", type: "text", placeholder: "e.g. a coffee shop" },
      { id: "p4", label: "What he said to her", type: "text", placeholder: 'e.g. "Nice shoes!"' },
      { id: "p5", label: "What she said to him", type: "text", placeholder: 'e.g. "Thanks, they\'re crocs."' },
      { id: "p6", label: "What happened next", type: "text", placeholder: "e.g. they eloped to Vegas" },
      { id: "p7", label: "The consequence", type: "text", placeholder: "e.g. they became professional magicians" },
    ],
  },
  {
    id: "adventure",
    name: "Adventure",
    description: "Pixar-style hero's journey (7 prompts)",
    prompts: [
      { id: "p1", label: "The hero's name", type: "name", placeholder: "e.g. Captain Quirk" },
      { id: "p2", label: "Their ordinary world", type: "text", placeholder: "e.g. a quiet village of cheese makers" },
      { id: "p3", label: "The call to adventure", type: "text", placeholder: "e.g. a talking goat appeared" },
      { id: "p4", label: "The challenge they faced", type: "text", placeholder: "e.g. a dragon allergic to dairy" },
      { id: "p5", label: "How they overcame it", type: "text", placeholder: "e.g. offered it lactose-free brie" },
      { id: "p6", label: "What they learned", type: "text", placeholder: "e.g. friendship smells like fondue" },
      { id: "p7", label: "How it ended", type: "text", placeholder: "e.g. they opened a goat yoga studio" },
    ],
  },
  {
    id: "neutral",
    name: "Gender-neutral",
    description: "Inclusive groups (8 prompts)",
    prompts: [
      { id: "p1", label: "Name a character", type: "name", placeholder: "e.g. Alex" },
      { id: "p2", label: "Name a second character", type: "name", placeholder: "e.g. Jordan" },
      { id: "p3", label: "Where they met", type: "text", placeholder: "e.g. at a silent disco" },
      { id: "p4", label: "What character 1 said", type: "text", placeholder: 'e.g. "Is this music?"' },
      { id: "p5", label: "What character 2 said", type: "text", placeholder: 'e.g. "I think my ears are broken."' },
      { id: "p6", label: "What they did together", type: "text", placeholder: "e.g. started a headphone repair business" },
      { id: "p7", label: "The consequence", type: "text", placeholder: "e.g. they became millionaires" },
    ],
  },
];

export function getTemplateById(id: string): PromptTemplate {
  return PROMPT_TEMPLATES.find((t) => t.id === id) ?? PROMPT_TEMPLATES[0];
}
