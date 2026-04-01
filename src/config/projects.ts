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
    id: 'racecard',
    name: 'Racecard',
    icon: '/project-ico/racecard-icon.png',
    github: 'https://github.com/leakyhose/racecard',
    link: 'https://racecard.io/',
    desc: 'Multiplayer web-based competitive flashcard/trivia app, AI-generated multiple-choice questions.',
    tech: ['Typescript', 'React', 'Socket.IO', 'AWS EC2', 'Docker', 'PostgreSQL', 'LangChain'],
    demoVideo: '/demo-vid/racecard_demo.mp4',
  },
  {
    id: 'nyt',
    name: "NYT's Connections Solver",
    icon: '/project-ico/nyt-icon.png',
    github: 'https://github.com/leakyhose/nyt-connections-ai',
    link: 'https://leakyhose.github.io/nyt-connections-ai/',
    desc: "Semantic algorithm that solves NYT's Connections using word embeddings with 85% accuracy.",
    tech: ['Python', 'FastText', 'Flask', 'DynamoDB', 'pandas', 'NumPy'],
    demoVideo: '/demo-vid/nyt_demo.mp4',
  },
]
