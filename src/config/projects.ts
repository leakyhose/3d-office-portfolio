export interface ProjectData {
  id: string
  name: string
  icon: string
  github: string
  link: string
  desc: string
  tech: string[]
  demoVideo: string
}

export const PROJECTS: ProjectData[] = [
  {
    id: 'divergence',
    name: 'Divergence',
    icon: '/project-ico/divergence-icon.png',
    github: 'https://github.com/leakyhose/alternate-history',
    link: 'https://alternate-history-seven.vercel.app/',
    desc: 'Agentic alternate history simulator.',
    tech: ['Python', 'Typescript', 'FastAPI', 'LangChain', 'LangGraph', 'Gemini API'],
    demoVideo: '/demo-vid/divergence_demo.mp4',
  },
  {
    id: 'racecard',
    name: 'Racecard',
    icon: '/project-ico/racecard-icon.png',
    github: 'https://github.com/leakyhose/racecard',
    link: 'https://racecard.io/',
    desc: 'Multiplayer trivia game with AI-generated questions.',
    tech: ['Typescript', 'React', 'Socket.IO', 'AWS EC2', 'Docker', 'PostgreSQL', 'LangChain'],
    demoVideo: '/demo-vid/racecard_demo.mp4',
  },
  {
    id: 'nyt',
    name: "NYT's Connections Solver",
    icon: '/project-ico/nyt-icon.png',
    github: 'https://github.com/leakyhose/nyt-connections-ai',
    link: 'https://leakyhose.github.io/nyt-connections-ai/',
    desc: "Semantic Connections solver using word embeddings.",
    tech: ['Python', 'FastText', 'Flask', 'DynamoDB', 'pandas', 'NumPy'],
    demoVideo: '/demo-vid/nyt_demo.mp4',
  },
]
