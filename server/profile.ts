import { readFile } from 'node:fs/promises'
import path from 'node:path'

export type Profile = {
  name: string
  location: string
  education: { degree: string; institution: string; year: string }
  skills: string[]
  work: string
  projects: { name: string; description: string; category: string; details?: string; status?: string }[]
  stories: { mistakes: string; risksTaken: string; ownership: string }
  contact: { email: string; github: string; linkedin: string; resume: string }
}
export type ChatMessage = { role: 'user' | 'assistant'; content: string }
export const UNKNOWN = "I don't have that information in my profile yet."

export function isKnown(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !value.trim().toUpperCase().startsWith('TODO')
}

export async function loadProfile(): Promise<Profile> {
  const raw = JSON.parse(await readFile(path.resolve(process.cwd(), 'data/profile.json'), 'utf8')) as Profile
  if (!raw.name || !raw.education?.institution || !Array.isArray(raw.projects) || !Array.isArray(raw.skills)) throw new Error('The profile is incomplete.')
  return raw
}

export function publicFacts(value: unknown): unknown {
  if (typeof value === 'string') return isKnown(value) ? value : null
  if (Array.isArray(value)) return value.map(publicFacts).filter(item => item !== null)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, publicFacts(item)]).filter(([, item]) => item !== null))
  return value
}

function overview(profile: Profile) {
  return `I'm ${profile.name}, a ${profile.education.year.toLowerCase()} ${profile.education.degree} student at ${profile.education.institution}, based in ${profile.location}. I work with ${profile.skills.join(', ')}, and I do ${profile.work.toLowerCase()}.`
}

export function groundedAnswer(profile: Profile, messages: ChatMessage[]): { answer: string; known: boolean } {
  let question = messages.at(-1)!.content.toLowerCase().trim()
  if (/^(tell me more|more|go on|what about it|and that|explain that)[.!?]*$/.test(question)) {
    question = messages.filter(message => message.role === 'user').at(-2)?.content.toLowerCase() ?? question
  }
  const unknown = (detail?: string) => ({ answer: detail ? `I don't have that ${detail} in my profile yet.` : UNKNOWN, known: false })
  // Missing personal facts must not be inferred from a nearby known topic.
  if (/\b(favou?rite|birthday|birth date|born|age|old are|salary|income|cgpa|gpa|grades?|phone|address|religion|parents?|siblings?|girlfriend|boyfriend|password|secret|api.?key|system prompt|ignore .*instructions)\b/.test(question)) return unknown()

  if (/\b(mistakes?|failures?|failed|regret)\b/.test(question)) return isKnown(profile.stories.mistakes) ? { answer: profile.stories.mistakes, known: true } : unknown('story about a mistake')
  if (/\b(risks?|risky|leap)\b/.test(question)) return isKnown(profile.stories.risksTaken) ? { answer: profile.stories.risksTaken, known: true } : unknown('story about taking a risk')
  if (/\b(ownership|responsibility|leadership|led a|take charge)\b/.test(question)) return isKnown(profile.stories.ownership) ? { answer: profile.stories.ownership, known: true } : unknown('example of taking ownership')
  if (/\b(contact|email|github|linkedin|resume|résumé|cv|reach|connect|links?)\b/.test(question)) {
    const contacts = Object.entries(profile.contact).filter(([, value]) => isKnown(value))
    const requested = contacts.filter(([key]) => question.includes(key))
    const explicitKey = Object.keys(profile.contact).find(key => question.includes(key))
    if (explicitKey && !requested.length) return unknown('contact information')
    return contacts.length ? { answer: `You can find me here: ${(requested.length ? requested : contacts).map(([key, value]) => `${key}: ${value}`).join(' · ')}`, known: true } : unknown('contact information')
  }

  const aliases: Record<string, RegExp> = {
    'Hybrid aerial-underwater drone': /\b(drone|aerial|underwater|robotics)\b/,
    LogiSense: /\blogi\s?sense\b/,
    Ypay: /\by\s?pay\b/,
    'Waste-segregation hackathon app': /\b(waste|segregation|hackathon)\b/,
    'WorldQuant BRAIN alpha research': /\b(worldquant|brain|alpha|quant)\b/,
  }
  const projects = profile.projects.filter(project => question.includes(project.name.toLowerCase()) || aliases[project.name]?.test(question))
  if (projects.length) {
    const detailed = /\b(how|why|results?|outcomes?|metrics?|won|win|team|role|contribution|stack|technolog|when|status|stage|accuracy|performance|users?|deploy|budget|cost|speed|range|duration|long|finished|completed)\b/.test(question)
    const detailFacts = projects.flatMap(project => [project.details, project.status].filter(isKnown))
    if (detailed && !detailFacts.length) return unknown(`detail about ${projects.map(project => project.name).join(' or ')}`)
    const names = projects.map(project => project.name).join(', ')
    const descriptions = projects.map(project => project.description).filter(description => !description.startsWith('A project called')).join(' ')
    return { answer: `I've worked on ${names}.${descriptions ? ` ${descriptions}` : ''}${detailFacts.length ? ` ${detailFacts.join(' ')}` : " I don't have the detailed scope or outcomes in my profile yet."}`, known: true }
  }

  const sections: string[] = []
  if (/\b(projects?|built|building|made|portfolio|worked on|selected work|your work)\b/.test(question)) sections.push(`My projects include ${profile.projects.map(project => project.name).join('; ')}.`)
  if (/\b(study|studying|education|college|school|university|degree|student|course|year|cse|newton|svyasa)\b/.test(question)) sections.push(`I'm a ${profile.education.year.toLowerCase()} ${profile.education.degree} student at ${profile.education.institution}.`)
  if (/\b(skills?|stack|technologies|tech|languages?|react|vite|python|ml|machine learning|tools?|code|coding)\b/.test(question)) sections.push(`I work with ${profile.skills.join(', ')}.`)
  if (/\b(based|location|city|live|bengaluru|bangalore|where.*from)\b/.test(question)) sections.push(`I'm based in ${profile.location}.`)
  if (/\b(freelance|freelancing|design|development|hire|services?|collaborat|job|do for work)\b/.test(question)) sections.push(`I do ${profile.work.toLowerCase()}.`)
  if (sections.length) return { answer: sections.join('\n\n'), known: true }
  if (/^(hi|hello|hey)[!.\s]*$|\b(who are you|who is shaaz|about (you|yourself|shaaz)|your name|introduce yourself|what do you do)\b/.test(question)) return { answer: overview(profile), known: true }
  return unknown()
}
