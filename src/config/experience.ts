// Entries printed on the experience paper in the 3D scene
// (drawn by src/drawExperiencePaper.ts). Listed oldest first: the sheet
// reads top-to-bottom with arrows showing progression.
// Logos are square tiles in /public.

export interface ExperienceEntry {
  company: string
  role: string
  /** Optional team, printed small beside the company name. */
  team?: string
  dates: string
  logo: string
  /** Adds a "NOW" marker beside the company name. */
  current?: boolean
}

export const EXPERIENCE: ExperienceEntry[] = [
  {
    company: 'Nokia',
    team: 'Future Tech',
    role: 'Software Engineering Intern',
    dates: 'Jul 2024 – Aug 2024',
    logo: '/nokia_logo.avif',
  },
  {
    company: 'Botpress',
    role: 'Software Engineering Intern',
    dates: 'May 2026 – Aug 2026',
    logo: '/botpress_logo.png',
  },
  {
    company: 'Shopify',
    role: 'Software Engineering Intern',
    dates: 'Sep 2026 – Dec 2026',
    logo: '/shopify_logo.svg',
    current: true,
  },
]
