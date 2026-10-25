/**
 * Development seed.
 *
 * Creates a skill taxonomy plus a small, coherent community so every page has
 * real data to render: members with reciprocal skills, an exchange in each
 * lifecycle state, sessions, milestones, a conversation, reviews and community
 * posts.
 *
 * Demo accounts all share the password below and are clearly labelled as seed
 * data. Change or delete them before any real deployment.
 *
 *   npm run db:seed
 */
import { PrismaClient, type SkillDirection, type SkillLevel } from '@prisma/client';
import { hashPassword } from '../src/lib/auth';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'SkillSpring#2026';

const CATEGORIES: { name: string; icon: string; color: string; description: string; skills: string[] }[] = [
  {
    name: 'Programming',
    icon: 'Code2',
    color: 'indigo',
    description: 'Languages, frameworks and software craft.',
    skills: ['Python', 'JavaScript', 'TypeScript', 'React', 'Node.js', 'Go', 'Rust', 'Java', 'SQL', 'Git', 'Docker', 'Kubernetes', 'REST API Design', 'GraphQL'],
  },
  {
    name: 'Design',
    icon: 'Palette',
    color: 'violet',
    description: 'Product, visual and interaction design.',
    skills: ['UI Design', 'UX Research', 'Figma', 'Design Systems', 'Typography', 'Accessibility', 'Illustration', 'Motion Design', 'Wireframing', 'Brand Identity'],
  },
  {
    name: 'Data and AI',
    icon: 'Brain',
    color: 'cyan',
    description: 'Data engineering, analysis and applied machine learning.',
    skills: ['Data Analysis', 'Machine Learning', 'Pandas', 'Data Visualization', 'Statistics', 'PostgreSQL', 'Prompt Engineering', 'ETL Pipelines'],
  },
  {
    name: 'Languages',
    icon: 'Languages',
    color: 'emerald',
    description: 'Spoken and written languages.',
    skills: ['English', 'Spanish', 'French', 'German', 'Mandarin', 'Japanese', 'Portuguese', 'Hindi', 'Arabic'],
  },
  {
    name: 'Music and Audio',
    icon: 'Music',
    color: 'amber',
    description: 'Instruments, production and audio engineering.',
    skills: ['Guitar', 'Piano', 'Music Theory', 'Music Production', 'Singing', 'Audio Mixing', 'Songwriting'],
  },
  {
    name: 'Business and Career',
    icon: 'Briefcase',
    color: 'rose',
    description: 'Strategy, operations and professional growth.',
    skills: ['Public Speaking', 'Project Management', 'Product Management', 'Marketing', 'Negotiation', 'Technical Writing', 'Interview Preparation', 'Financial Literacy'],
  },
  {
    name: 'Wellbeing and Craft',
    icon: 'Heart',
    color: 'teal',
    description: 'Hands-on and personal skills.',
    skills: ['Yoga', 'Cooking', 'Photography', 'Gardening', 'Chess', 'Woodworking', 'Bread Baking'],
  },
];

type MemberSeed = {
  username: string;
  email: string;
  displayName: string;
  headline: string;
  bio: string;
  location: string;
  timezone: string;
  languages: string[];
  role?: 'MEMBER' | 'MODERATOR' | 'ADMIN';
  status?: 'ACTIVE' | 'PENDING_VERIFICATION';
  teaches: { name: string; level: SkillLevel; description?: string; portfolioUrl?: string }[];
  wants: { name: string; level: SkillLevel }[];
  availability: { weekday: number; start: number; end: number }[];
};

const MEMBERS: MemberSeed[] = [
  {
    username: 'admin',
    email: 'admin@skillspring.local',
    displayName: 'Platform Administrator',
    headline: 'Keeping SkillSpring safe and healthy',
    bio: 'Platform administrator account used for moderation and operations. This is seed data for local development.',
    location: 'Remote',
    timezone: 'UTC',
    languages: ['English'],
    role: 'ADMIN',
    teaches: [],
    wants: [],
    availability: [],
  },
  {
    username: 'moderator',
    email: 'moderator@skillspring.local',
    displayName: 'Community Moderator',
    headline: 'Community safety',
    bio: 'Moderator account for reviewing reports and keeping discussions constructive. Seed data for local development.',
    location: 'Remote',
    timezone: 'UTC',
    languages: ['English'],
    role: 'MODERATOR',
    teaches: [{ name: 'Accessibility', level: 'ADVANCED' }],
    wants: [{ name: 'Public Speaking', level: 'INTERMEDIATE' }],
    availability: [{ weekday: 2, start: 600, end: 780 }],
  },
  {
    username: 'amara',
    email: 'amara@example.com',
    displayName: 'Amara Okafor',
    headline: 'Backend engineer who wants to design things people love',
    bio: 'I have spent six years building Python services and data pipelines. I would like to move closer to product design, so I am looking for someone patient to teach me UI and UX foundations. Happy to trade deep Python and SQL coaching in return.',
    location: 'Lagos, Nigeria',
    timezone: 'Africa/Lagos',
    languages: ['English', 'Yoruba'],
    teaches: [
      { name: 'Python', level: 'EXPERT', description: 'Six years of production Python: FastAPI, Django, async workers and testing.', portfolioUrl: 'https://github.com/example/amara-python-notes' },
      { name: 'SQL', level: 'ADVANCED', description: 'Query tuning, indexing strategy and schema design on PostgreSQL.' },
      { name: 'PostgreSQL', level: 'ADVANCED' },
      { name: 'Data Analysis', level: 'ADVANCED' },
    ],
    wants: [
      { name: 'UI Design', level: 'BEGINNER' },
      { name: 'UX Research', level: 'BEGINNER' },
      { name: 'Figma', level: 'BEGINNER' },
    ],
    availability: [
      { weekday: 1, start: 1080, end: 1260 },
      { weekday: 3, start: 1080, end: 1260 },
      { weekday: 6, start: 600, end: 840 },
    ],
  },
  {
    username: 'lucas',
    email: 'lucas@example.com',
    displayName: 'Lucas Ferreira',
    headline: 'Product designer learning to build what I design',
    bio: 'Designer for eight years, mostly design systems and accessibility. I can teach you how to structure a UI and why accessibility is not optional. In exchange I want to learn enough Python and SQL to prototype my own ideas.',
    location: 'Lisbon, Portugal',
    timezone: 'Europe/Lisbon',
    languages: ['Portuguese', 'English', 'Spanish'],
    teaches: [
      { name: 'UI Design', level: 'EXPERT', description: 'Design systems, component libraries and visual hierarchy.', portfolioUrl: 'https://example.com/lucas-portfolio' },
      { name: 'Design Systems', level: 'EXPERT' },
      { name: 'Figma', level: 'ADVANCED' },
      { name: 'Accessibility', level: 'ADVANCED', description: 'WCAG 2.2 AA audits and remediation.' },
      { name: 'Typography', level: 'ADVANCED' },
    ],
    wants: [
      { name: 'Python', level: 'BEGINNER' },
      { name: 'SQL', level: 'BEGINNER' },
      { name: 'JavaScript', level: 'BEGINNER' },
    ],
    availability: [
      { weekday: 1, start: 1020, end: 1200 },
      { weekday: 2, start: 1020, end: 1200 },
      { weekday: 4, start: 900, end: 1080 },
    ],
  },
  {
    username: 'yuki',
    email: 'yuki@example.com',
    displayName: 'Yuki Tanaka',
    headline: 'Data scientist and reluctant guitarist',
    bio: 'I build forecasting models by day and have been learning guitar for two years without much progress. I can teach statistics, pandas and machine learning fundamentals properly, with real datasets.',
    location: 'Osaka, Japan',
    timezone: 'Asia/Tokyo',
    languages: ['Japanese', 'English'],
    teaches: [
      { name: 'Machine Learning', level: 'ADVANCED', description: 'Supervised learning, evaluation and avoiding leakage.' },
      { name: 'Statistics', level: 'EXPERT' },
      { name: 'Pandas', level: 'ADVANCED' },
      { name: 'Data Visualization', level: 'ADVANCED' },
    ],
    wants: [
      { name: 'Guitar', level: 'BEGINNER' },
      { name: 'Music Theory', level: 'BEGINNER' },
    ],
    availability: [
      { weekday: 2, start: 660, end: 780 },
      { weekday: 5, start: 660, end: 900 },
    ],
  },
  {
    username: 'sofia',
    email: 'sofia@example.com',
    displayName: 'Sofía Márquez',
    headline: 'Guitarist and music teacher who wants to understand data',
    bio: 'I teach guitar and music theory to all ages, and I play professionally at weekends. I would like to learn enough data analysis to understand my students progress and my own practice patterns.',
    location: 'Mexico City, Mexico',
    timezone: 'America/Mexico_City',
    languages: ['Spanish', 'English'],
    teaches: [
      { name: 'Guitar', level: 'EXPERT', description: 'Classical and acoustic, from first chords to sight reading.' },
      { name: 'Music Theory', level: 'ADVANCED' },
      { name: 'Songwriting', level: 'ADVANCED' },
    ],
    wants: [
      { name: 'Data Analysis', level: 'BEGINNER' },
      { name: 'Statistics', level: 'BEGINNER' },
      { name: 'Python', level: 'BEGINNER' },
    ],
    availability: [
      { weekday: 2, start: 660, end: 780 },
      { weekday: 4, start: 720, end: 840 },
      { weekday: 6, start: 540, end: 720 },
    ],
  },
  {
    username: 'priya',
    email: 'priya@example.com',
    displayName: 'Priya Raman',
    headline: 'Frontend engineer, TypeScript enthusiast, terrible at public speaking',
    bio: 'I write TypeScript and React for a living and enjoy teaching it. My weak spot is standing up in front of people, so I am looking for someone to coach me on public speaking and presentation structure.',
    location: 'Bengaluru, India',
    timezone: 'Asia/Kolkata',
    languages: ['English', 'Hindi', 'Tamil'],
    teaches: [
      { name: 'TypeScript', level: 'EXPERT', description: 'Types, generics, narrowing and large-codebase refactors.' },
      { name: 'React', level: 'EXPERT' },
      { name: 'JavaScript', level: 'ADVANCED' },
      { name: 'Accessibility', level: 'INTERMEDIATE' },
    ],
    wants: [
      { name: 'Public Speaking', level: 'BEGINNER' },
      { name: 'Interview Preparation', level: 'INTERMEDIATE' },
    ],
    availability: [
      { weekday: 1, start: 840, end: 1020 },
      { weekday: 3, start: 840, end: 1020 },
      { weekday: 5, start: 900, end: 1020 },
    ],
  },
  {
    username: 'tom',
    email: 'tom@example.com',
    displayName: 'Tom Whitfield',
    headline: 'Communications coach trading speaking skills for code',
    bio: 'Fifteen years in communications and training. I coach public speaking, negotiation and interview technique. I would like to learn Go and Docker so I can build small tools for my workshops.',
    location: 'Manchester, United Kingdom',
    timezone: 'Europe/London',
    languages: ['English'],
    teaches: [
      { name: 'Public Speaking', level: 'EXPERT', description: 'Structure, delivery and managing nerves, with recorded practice.' },
      { name: 'Negotiation', level: 'ADVANCED' },
      { name: 'Interview Preparation', level: 'ADVANCED' },
      { name: 'Technical Writing', level: 'ADVANCED' },
    ],
    wants: [
      { name: 'Go', level: 'BEGINNER' },
      { name: 'Docker', level: 'BEGINNER' },
      { name: 'TypeScript', level: 'BEGINNER' },
    ],
    availability: [
      { weekday: 1, start: 1080, end: 1260 },
      { weekday: 3, start: 1080, end: 1260 },
      { weekday: 5, start: 1020, end: 1200 },
    ],
  },
  {
    username: 'nadia',
    email: 'nadia@example.com',
    displayName: 'Nadia Haddad',
    headline: 'Arabic teacher and aspiring product manager',
    bio: 'I teach Arabic to adults, including business Arabic. I am moving towards product management and want help with product discovery, roadmaps and stakeholder communication.',
    location: 'Amman, Jordan',
    timezone: 'Asia/Amman',
    languages: ['Arabic', 'English', 'French'],
    teaches: [
      { name: 'Arabic', level: 'EXPERT', description: 'Modern Standard Arabic and Levantine dialect, all levels.' },
      { name: 'French', level: 'ADVANCED' },
      { name: 'English', level: 'ADVANCED' },
    ],
    wants: [
      { name: 'Product Management', level: 'BEGINNER' },
      { name: 'Marketing', level: 'BEGINNER' },
    ],
    availability: [
      { weekday: 0, start: 600, end: 780 },
      { weekday: 2, start: 1020, end: 1140 },
      { weekday: 4, start: 1020, end: 1140 },
    ],
  },
  {
    username: 'marco',
    email: 'marco@example.com',
    displayName: 'Marco Bellini',
    headline: 'Product manager trading roadmaps for design craft',
    bio: 'I run product for a mid-sized SaaS company. I can teach discovery, prioritisation and how to run a roadmap conversation that does not turn into a fight. I want to get better at visual design and illustration.',
    location: 'Milan, Italy',
    timezone: 'Europe/Rome',
    languages: ['Italian', 'English'],
    teaches: [
      { name: 'Product Management', level: 'EXPERT', description: 'Discovery, prioritisation frameworks and stakeholder alignment.' },
      { name: 'Project Management', level: 'ADVANCED' },
      { name: 'Negotiation', level: 'INTERMEDIATE' },
    ],
    wants: [
      { name: 'Illustration', level: 'BEGINNER' },
      { name: 'UI Design', level: 'INTERMEDIATE' },
      { name: 'Motion Design', level: 'BEGINNER' },
    ],
    availability: [
      { weekday: 1, start: 1020, end: 1140 },
      { weekday: 3, start: 1020, end: 1140 },
    ],
  },
  {
    username: 'helena',
    email: 'helena@example.com',
    displayName: 'Helena Nowak',
    headline: 'Photographer who finally wants to learn to cook properly',
    bio: 'Documentary photographer. I teach composition, lighting and editing, and I am happy to do portfolio reviews. I would like to learn to cook something beyond pasta and to keep a garden alive.',
    location: 'Kraków, Poland',
    timezone: 'Europe/Warsaw',
    languages: ['Polish', 'English'],
    teaches: [
      { name: 'Photography', level: 'EXPERT', description: 'Composition, natural light and a repeatable editing workflow.', portfolioUrl: 'https://example.com/helena-photos' },
      { name: 'Illustration', level: 'INTERMEDIATE' },
      { name: 'Design Systems', level: 'BEGINNER' },
    ],
    wants: [
      { name: 'Cooking', level: 'BEGINNER' },
      { name: 'Gardening', level: 'BEGINNER' },
    ],
    availability: [
      { weekday: 2, start: 960, end: 1140 },
      { weekday: 5, start: 900, end: 1080 },
      { weekday: 6, start: 540, end: 720 },
    ],
  },
  {
    username: 'diego',
    email: 'diego@example.com',
    displayName: 'Diego Ruiz',
    headline: 'Chef and gardener, learning to speak in public',
    bio: 'I run a small restaurant and grow most of our herbs. I can teach practical cooking and how to keep a vegetable garden productive. I want to get comfortable speaking at events and writing about food.',
    location: 'Seville, Spain',
    timezone: 'Europe/Madrid',
    languages: ['Spanish', 'English'],
    teaches: [
      { name: 'Cooking', level: 'EXPERT', description: 'Knife skills, seasoning, and building a weekly menu.' },
      { name: 'Gardening', level: 'ADVANCED' },
      { name: 'Bread Baking', level: 'ADVANCED' },
    ],
    wants: [
      { name: 'Public Speaking', level: 'BEGINNER' },
      { name: 'Technical Writing', level: 'BEGINNER' },
      { name: 'Photography', level: 'INTERMEDIATE' },
    ],
    availability: [
      { weekday: 1, start: 1020, end: 1140 },
      { weekday: 4, start: 1020, end: 1140 },
    ],
  },
  {
    username: 'chloe',
    email: 'chloe@example.com',
    displayName: 'Chloé Dubois',
    headline: 'Yoga teacher and accessibility advocate',
    bio: 'I teach yoga and movement, and I care a lot about making spaces usable for everyone. I want to learn frontend development so I can build a better booking experience for my students.',
    location: 'Lyon, France',
    timezone: 'Europe/Paris',
    languages: ['French', 'English'],
    teaches: [
      { name: 'Yoga', level: 'EXPERT', description: 'Breath-led vinyasa and gentle classes for beginners.' },
      { name: 'Accessibility', level: 'ADVANCED' },
      { name: 'Cooking', level: 'INTERMEDIATE' },
    ],
    wants: [
      { name: 'React', level: 'BEGINNER' },
      { name: 'JavaScript', level: 'BEGINNER' },
      { name: 'UI Design', level: 'BEGINNER' },
    ],
    availability: [
      { weekday: 2, start: 420, end: 600 },
      { weekday: 4, start: 420, end: 600 },
      { weekday: 0, start: 600, end: 780 },
    ],
  },
  {
    username: 'kwame',
    email: 'kwame@example.com',
    displayName: 'Kwame Mensah',
    headline: 'DevOps engineer trading infrastructure for chess',
    bio: 'I look after Kubernetes clusters and CI pipelines. I can teach Docker, Kubernetes and Go from the ground up. I would like to get seriously better at chess and at bread baking.',
    location: 'Accra, Ghana',
    timezone: 'Africa/Accra',
    languages: ['English', 'Twi'],
    teaches: [
      { name: 'Docker', level: 'EXPERT', description: 'Images, compose, and debugging containers in production.' },
      { name: 'Kubernetes', level: 'ADVANCED' },
      { name: 'Go', level: 'ADVANCED' },
      { name: 'Git', level: 'ADVANCED' },
    ],
    wants: [
      { name: 'Chess', level: 'BEGINNER' },
      { name: 'Bread Baking', level: 'BEGINNER' },
    ],
    availability: [
      { weekday: 1, start: 1080, end: 1200 },
      { weekday: 3, start: 1080, end: 1200 },
      { weekday: 6, start: 600, end: 780 },
    ],
  },
  {
    username: 'isabel',
    email: 'isabel@example.com',
    displayName: 'Isabel Santos',
    headline: 'Technical writer trading docs for music',
    bio: 'I write developer documentation and API references. I can teach technical writing, API design and how to make documentation people actually read. I want to learn piano and music theory.',
    location: 'São Paulo, Brazil',
    timezone: 'America/Sao_Paulo',
    languages: ['Portuguese', 'English', 'Spanish'],
    teaches: [
      { name: 'Technical Writing', level: 'EXPERT', description: 'Structure, API references and writing for skimming.' },
      { name: 'REST API Design', level: 'ADVANCED' },
      { name: 'Git', level: 'ADVANCED' },
    ],
    wants: [
      { name: 'Piano', level: 'BEGINNER' },
      { name: 'Music Theory', level: 'BEGINNER' },
    ],
    availability: [
      { weekday: 1, start: 1020, end: 1140 },
      { weekday: 2, start: 1020, end: 1140 },
      { weekday: 4, start: 1020, end: 1140 },
    ],
  },
  {
    username: 'hans',
    email: 'hans@example.com',
    displayName: 'Hans Müller',
    headline: 'Piano teacher and retired engineer',
    bio: 'I taught piano for twenty years after a career in engineering. I can teach piano and music theory to adult beginners. I am curious about machine learning and would like a patient introduction.',
    location: 'Vienna, Austria',
    timezone: 'Europe/Vienna',
    languages: ['German', 'English'],
    teaches: [
      { name: 'Piano', level: 'EXPERT', description: 'Adult beginners, technique and reading music.' },
      { name: 'Music Theory', level: 'EXPERT' },
      { name: 'Audio Mixing', level: 'INTERMEDIATE' },
    ],
    wants: [
      { name: 'Machine Learning', level: 'BEGINNER' },
      { name: 'Python', level: 'BEGINNER' },
    ],
    availability: [
      { weekday: 1, start: 900, end: 1020 },
      { weekday: 3, start: 900, end: 1020 },
      { weekday: 5, start: 900, end: 1020 },
    ],
  },
];

/** Writes the members' skill rows, resolving names to taxonomy ids. */
async function seedSkills(
  userId: string,
  teach: MemberSeed['teaches'],
  want: MemberSeed['wants'],
  skillByName: Map<string, string>,
) {
  const rows: {
    userId: string;
    skillId: string;
    direction: SkillDirection;
    level: SkillLevel;
    description?: string | null;
    portfolioUrl?: string | null;
  }[] = [];

  for (const t of teach) {
    const skillId = skillByName.get(t.name);
    if (!skillId) throw new Error(`Seed error: unknown skill "${t.name}"`);
    rows.push({
      userId,
      skillId,
      direction: 'TEACH',
      level: t.level,
      description: t.description ?? null,
      portfolioUrl: t.portfolioUrl ?? null,
    });
  }

  for (const w of want) {
    const skillId = skillByName.get(w.name);
    if (!skillId) throw new Error(`Seed error: unknown skill "${w.name}"`);
    rows.push({ userId, skillId, direction: 'LEARN', level: w.level });
  }

  await prisma.userSkill.createMany({ data: rows });
}

async function main() {
  console.log('Seeding SkillSpring…');

  // ---- idempotent reset of seed-owned data
  const seedUsernames = [...MEMBERS.map((m) => m.username), 'demo'];
  const existing = await prisma.user.findMany({
    where: { username: { in: seedUsernames } },
    select: { id: true },
  });
  if (existing.length > 0) {
    console.log(`  removing ${existing.length} existing seed account(s)…`);
    await prisma.user.deleteMany({ where: { id: { in: existing.map((e) => e.id) } } });
  }

  // ---- taxonomy
  const skillByName = new Map<string, string>();

  for (const [index, category] of CATEGORIES.entries()) {
    const slug = category.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const row = await prisma.skillCategory.upsert({
      where: { slug },
      create: {
        slug,
        name: category.name,
        description: category.description,
        icon: category.icon,
        color: category.color,
        sortOrder: index,
      },
      update: {
        description: category.description,
        icon: category.icon,
        color: category.color,
        sortOrder: index,
      },
    });

    for (const skillName of category.skills) {
      const skillSlug = skillName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const skill = await prisma.skill.upsert({
        where: { slug: skillSlug },
        create: { slug: skillSlug, name: skillName, categoryId: row.id },
        update: { categoryId: row.id },
      });
      skillByName.set(skillName, skill.id);
    }
  }
  console.log(`  taxonomy: ${CATEGORIES.length} categories, ${skillByName.size} skills`);

  // ---- members
  // Hashed through the same helper the API uses, so the pepper is applied and
  // these accounts can actually sign in.
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const userIdByUsername = new Map<string, string>();

  for (const member of MEMBERS) {
    const user = await prisma.user.create({
      data: {
        email: member.email,
        username: member.username,
        passwordHash,
        role: member.role ?? 'MEMBER',
        status: member.status ?? 'ACTIVE',
        emailVerifiedAt: (member.status ?? 'ACTIVE') === 'ACTIVE' ? new Date() : null,
        profile: {
          create: {
            displayName: member.displayName,
            headline: member.headline,
            bio: member.bio,
            location: member.location,
            timezone: member.timezone,
            languages: member.languages,
            preferredFormat: 'ONLINE',
            learningGoals: `Seeded learning goals for ${member.displayName}.`,
            onboardingCompletedAt: new Date(),
            onboardingStep: 5,
          },
        },
        preference: { create: {} },
      },
      select: { id: true },
    });

    userIdByUsername.set(member.username, user.id);

    await seedSkills(user.id, member.teaches, member.wants, skillByName);

    if (member.availability.length > 0) {
      await prisma.availability.createMany({
        data: member.availability.map((a) => ({
          userId: user.id,
          weekday: a.weekday,
          startMinute: a.start,
          endMinute: a.end,
          format: 'ONLINE' as const,
        })),
      });
    }
  }
  console.log(`  members: ${MEMBERS.length}`);

  const id = (username: string) => {
    const found = userIdByUsername.get(username);
    if (!found) throw new Error(`Seed error: missing user ${username}`);
    return found;
  };
  const skill = (name: string) => {
    const found = skillByName.get(name);
    if (!found) throw new Error(`Seed error: missing skill ${name}`);
    return found;
  };

  // ---- follows
  const followPairs: [string, string][] = [
    ['lucas', 'amara'], ['amara', 'lucas'], ['priya', 'tom'], ['tom', 'priya'],
    ['yuki', 'sofia'], ['sofia', 'yuki'], ['chloe', 'priya'], ['marco', 'lucas'],
    ['helena', 'diego'], ['kwame', 'isabel'], ['nadia', 'marco'], ['isabel', 'hans'],
    ['hans', 'isabel'], ['diego', 'helena'],
  ];
  await prisma.follow.createMany({
    data: followPairs.map(([follower, following]) => ({
      followerId: id(follower),
      followingId: id(following),
    })),
    skipDuplicates: true,
  });

  // ---- exchange requests across every status, plus exchanges to match
  const now = Date.now();
  const days = (n: number) => new Date(now + n * 24 * 60 * 60 * 1000);

  // 1. PENDING: Amara → Lucas (the canonical Python ↔ UI Design swap)
  await prisma.exchangeRequest.create({
    data: {
      initiatorId: id('amara'),
      recipientId: id('lucas'),
      offeredSkillId: skill('Python'),
      requestedSkillId: skill('UI Design'),
      message: 'I saw your design systems work — I would love to trade Python coaching for UI fundamentals.',
      goals: 'Build a small design system and learn how to critique my own layouts.',
      sessionMinutes: 60,
      sessionsPerWeek: 2,
      totalSessions: 8,
      preferredFormat: 'ONLINE',
      status: 'PENDING',
    },
  });

  // 2. ACTIVE: Priya ↔ Tom (TypeScript ↔ Public Speaking) with sessions, milestones, notes
  const priyaTom = await prisma.exchangeRequest.create({
    data: {
      initiatorId: id('priya'),
      recipientId: id('tom'),
      offeredSkillId: skill('TypeScript'),
      requestedSkillId: skill('Public Speaking'),
      message: 'Deal: I make you dangerous with TypeScript, you make me survive a conference stage.',
      goals: 'Deliver a 10-minute conference talk by the end of the exchange.',
      sessionMinutes: 60,
      sessionsPerWeek: 1,
      totalSessions: 6,
      preferredFormat: 'ONLINE',
      status: 'ACCEPTED',
      respondedAt: days(-20),
    },
  });

  const priyaTomExchange = await prisma.exchange.create({
    data: {
      title: 'priya ↔ tom',
      createdById: id('tom'),
      status: 'ACTIVE',
      goals: 'Deliver a 10-minute conference talk by the end of the exchange.',
      sessionMinutes: 60,
      totalSessions: 6,
      preferredFormat: 'ONLINE',
      startedAt: days(-18),
      participants: {
        create: [
          { userId: id('priya'), role: 'INITIATOR', status: 'AGREED', teachesSkillId: skill('TypeScript'), learnsSkillId: skill('Public Speaking'), agreedAt: days(-19) },
          { userId: id('tom'), role: 'RECIPIENT', status: 'AGREED', teachesSkillId: skill('Public Speaking'), learnsSkillId: skill('TypeScript'), agreedAt: days(-19) },
        ],
      },
      events: {
        create: [
          { actorId: id('tom'), type: 'exchange.created', summary: 'Exchange accepted and workspace created', createdAt: days(-19) },
          { actorId: id('priya'), type: 'exchange.start', summary: 'Exchange marked as active', createdAt: days(-18) },
        ],
      },
    },
    select: { id: true },
  });

  await prisma.exchangeRequest.update({
    where: { id: priyaTom.id },
    data: { exchangeId: priyaTomExchange.id },
  });

  await prisma.session.createMany({
    data: [
      { exchangeId: priyaTomExchange.id, hostId: id('priya'), title: 'TypeScript generics from scratch', startsAt: days(-14), endsAt: days(-14 + 1 / 24), status: 'COMPLETED', completedAt: days(-14), timezone: 'Asia/Kolkata' },
      { exchangeId: priyaTomExchange.id, hostId: id('tom'), title: 'Talk structure and opening', startsAt: days(-7), endsAt: days(-7 + 1 / 24), status: 'COMPLETED', completedAt: days(-7), timezone: 'Europe/London' },
      { exchangeId: priyaTomExchange.id, hostId: id('priya'), title: 'Live coding without panicking', startsAt: days(3), endsAt: days(3 + 1 / 24), status: 'SCHEDULED', timezone: 'Asia/Kolkata' },
    ],
  });

  await prisma.milestone.createMany({
    data: [
      { exchangeId: priyaTomExchange.id, authorId: id('priya'), title: 'Understand generics and narrowing', status: 'DONE', completedAt: days(-13), sortOrder: 0 },
      { exchangeId: priyaTomExchange.id, authorId: id('tom'), title: 'Draft the talk outline', status: 'DONE', completedAt: days(-6), sortOrder: 1 },
      { exchangeId: priyaTomExchange.id, authorId: id('priya'), title: 'Rehearse the full talk twice', status: 'IN_PROGRESS', dueAt: days(7), sortOrder: 2 },
      { exchangeId: priyaTomExchange.id, authorId: id('tom'), title: 'Record a dry run and review it', status: 'PENDING', dueAt: days(12), sortOrder: 3 },
    ],
  });

  await prisma.exchangeNote.createMany({
    data: [
      { exchangeId: priyaTomExchange.id, authorId: id('priya'), body: 'Generics cheatsheet for next time: start from the call site and work backwards. Practice with a generic API client.', resourceUrl: 'https://www.typescriptlang.org/docs/handbook/2/generics.html' },
      { exchangeId: priyaTomExchange.id, authorId: id('tom'), body: 'Talk outline v2 attached in the shared doc. The opening needs a concrete story, not a definition.' },
    ],
  });

  // 3. COMPLETED: Yuki ↔ Sofía (Machine Learning ↔ Guitar), with reviews
  const yukiSofia = await prisma.exchangeRequest.create({
    data: {
      initiatorId: id('yuki'),
      recipientId: id('sofia'),
      offeredSkillId: skill('Machine Learning'),
      requestedSkillId: skill('Guitar'),
      message: 'Statistics for barre chords? Seems fair to me.',
      goals: 'Play three songs end to end and understand supervised learning basics.',
      sessionMinutes: 45,
      sessionsPerWeek: 1,
      totalSessions: 8,
      preferredFormat: 'ONLINE',
      status: 'ACCEPTED',
      respondedAt: days(-70),
    },
  });

  const yukiSofiaExchange = await prisma.exchange.create({
    data: {
      title: 'yuki ↔ sofia',
      createdById: id('sofia'),
      status: 'COMPLETED',
      goals: 'Play three songs end to end and understand supervised learning basics.',
      sessionMinutes: 45,
      totalSessions: 8,
      preferredFormat: 'ONLINE',
      startedAt: days(-65),
      completedAt: days(-10),
      participants: {
        create: [
          { userId: id('yuki'), role: 'INITIATOR', status: 'COMPLETED', teachesSkillId: skill('Machine Learning'), learnsSkillId: skill('Guitar'), agreedAt: days(-66), completedAt: days(-10) },
          { userId: id('sofia'), role: 'RECIPIENT', status: 'COMPLETED', teachesSkillId: skill('Guitar'), learnsSkillId: skill('Machine Learning'), agreedAt: days(-66), completedAt: days(-10) },
        ],
      },
      events: {
        create: [
          { actorId: id('sofia'), type: 'exchange.created', summary: 'Exchange accepted and workspace created', createdAt: days(-66) },
          { actorId: id('yuki'), type: 'exchange.start', summary: 'Exchange marked as active', createdAt: days(-65) },
          { actorId: id('yuki'), type: 'exchange.complete', summary: 'Exchange marked as completed', createdAt: days(-10) },
        ],
      },
    },
    select: { id: true },
  });

  await prisma.exchangeRequest.update({ where: { id: yukiSofia.id }, data: { exchangeId: yukiSofiaExchange.id } });

  await prisma.session.createMany({
    data: Array.from({ length: 8 }).map((_, i) => ({
      exchangeId: yukiSofiaExchange.id,
      hostId: i % 2 === 0 ? id('yuki') : id('sofia'),
      title: i % 2 === 0 ? 'Supervised learning basics' : 'Chords and strumming',
      startsAt: days(-60 + i * 6),
      endsAt: days(-60 + i * 6 + 45 / (60 * 24)),
      status: 'COMPLETED' as const,
      completedAt: days(-60 + i * 6),
      timezone: 'Asia/Tokyo',
    })),
  });

  await prisma.milestone.createMany({
    data: [
      { exchangeId: yukiSofiaExchange.id, authorId: id('yuki'), title: 'Understand train/test splits', status: 'DONE', completedAt: days(-55), sortOrder: 0 },
      { exchangeId: yukiSofiaExchange.id, authorId: id('sofia'), title: 'Play a full song without stopping', status: 'DONE', completedAt: days(-30), sortOrder: 1 },
      { exchangeId: yukiSofiaExchange.id, authorId: id('yuki'), title: 'Explain precision vs recall out loud', status: 'DONE', completedAt: days(-18), sortOrder: 2 },
    ],
  });

  await prisma.review.createMany({
    data: [
      {
        exchangeId: yukiSofiaExchange.id,
        authorId: id('yuki'),
        subjectId: id('sofia'),
        rating: 5,
        teachingRating: 5,
        communicationRating: 5,
        reliabilityRating: 5,
        comment: 'Sofía is an outstanding teacher. She broke barre chords into something I could actually practise, and she never once made me feel behind.',
      },
      {
        exchangeId: yukiSofiaExchange.id,
        authorId: id('sofia'),
        subjectId: id('yuki'),
        rating: 5,
        teachingRating: 5,
        communicationRating: 4,
        reliabilityRating: 5,
        comment: 'Yuki explained statistics with real datasets and checked my understanding constantly. I finally understand what a test set is for.',
      },
    ],
  });

  // 4. ACCEPTED (not started): Kwame ↔ Isabel (Docker ↔ Piano)
  const kwameIsabel = await prisma.exchangeRequest.create({
    data: {
      initiatorId: id('kwame'),
      recipientId: id('isabel'),
      offeredSkillId: skill('Docker'),
      requestedSkillId: skill('Piano'),
      message: 'I will teach you containers if you teach me the left hand.',
      goals: 'Ship a containerised side project and play one piece with both hands.',
      sessionMinutes: 60,
      sessionsPerWeek: 1,
      totalSessions: 6,
      preferredFormat: 'ONLINE',
      status: 'ACCEPTED',
      respondedAt: days(-3),
    },
  });

  const kwameIsabelExchange = await prisma.exchange.create({
    data: {
      title: 'kwame ↔ isabel',
      createdById: id('isabel'),
      status: 'ACCEPTED',
      goals: 'Ship a containerised side project and play one piece with both hands.',
      sessionMinutes: 60,
      totalSessions: 6,
      preferredFormat: 'ONLINE',
      participants: {
        create: [
          { userId: id('kwame'), role: 'INITIATOR', status: 'AGREED', teachesSkillId: skill('Docker'), learnsSkillId: skill('Piano'), agreedAt: days(-3) },
          { userId: id('isabel'), role: 'RECIPIENT', status: 'AGREED', teachesSkillId: skill('Piano'), learnsSkillId: skill('Docker'), agreedAt: days(-3) },
        ],
      },
      events: { create: [{ actorId: id('isabel'), type: 'exchange.created', summary: 'Exchange accepted and workspace created', createdAt: days(-3) }] },
    },
    select: { id: true },
  });

  await prisma.exchangeRequest.update({ where: { id: kwameIsabel.id }, data: { exchangeId: kwameIsabelExchange.id } });

  // 5. PENDING incoming for Amara (so the dashboard has something to act on)
  await prisma.exchangeRequest.create({
    data: {
      initiatorId: id('chloe'),
      recipientId: id('amara'),
      offeredSkillId: skill('Yoga'),
      requestedSkillId: skill('Python'),
      message: 'I would like to automate my class bookings. Could we swap?',
      goals: 'Write a small script that manages my waiting list.',
      sessionMinutes: 60,
      sessionsPerWeek: 1,
      totalSessions: 4,
      preferredFormat: 'EITHER',
      status: 'PENDING',
    },
  });

  // 6. DECLINED and WITHDRAWN examples for the request list states
  await prisma.exchangeRequest.create({
    data: {
      initiatorId: id('marco'),
      recipientId: id('helena'),
      offeredSkillId: skill('Product Management'),
      requestedSkillId: skill('Illustration'),
      message: 'Would you swap illustration coaching for product discovery?',
      sessionMinutes: 60,
      sessionsPerWeek: 1,
      totalSessions: 4,
      status: 'DECLINED',
      respondedAt: days(-25),
      preferredFormat: 'ONLINE',
    },
  });

  await prisma.exchangeRequest.create({
    data: {
      initiatorId: id('hans'),
      recipientId: id('yuki'),
      offeredSkillId: skill('Music Theory'),
      requestedSkillId: skill('Machine Learning'),
      message: 'I would like a gentle introduction to machine learning.',
      sessionMinutes: 45,
      sessionsPerWeek: 1,
      totalSessions: 4,
      status: 'WITHDRAWN',
      respondedAt: days(-40),
      preferredFormat: 'ONLINE',
    },
  });

  // 7. PAUSED exchange: Marco ↔ Helena
  const marcoHelenaExchange = await prisma.exchange.create({
    data: {
      title: 'marco ↔ helena',
      createdById: id('marco'),
      status: 'PAUSED',
      goals: 'Produce one illustrated case study together.',
      sessionMinutes: 60,
      totalSessions: 5,
      preferredFormat: 'ONLINE',
      startedAt: days(-30),
      pausedAt: days(-4),
      participants: {
        create: [
          { userId: id('marco'), role: 'INITIATOR', status: 'AGREED', teachesSkillId: skill('Product Management'), learnsSkillId: skill('Illustration'), agreedAt: days(-31) },
          { userId: id('helena'), role: 'RECIPIENT', status: 'AGREED', teachesSkillId: skill('Illustration'), learnsSkillId: skill('Product Management'), agreedAt: days(-31) },
        ],
      },
      events: {
        create: [
          { actorId: id('marco'), type: 'exchange.created', summary: 'Exchange accepted and workspace created', createdAt: days(-31) },
          { actorId: id('marco'), type: 'exchange.start', summary: 'Exchange marked as active', createdAt: days(-30) },
          { actorId: id('helena'), type: 'exchange.pause', summary: 'Exchange marked as paused', createdAt: days(-4) },
        ],
      },
    },
    select: { id: true },
  });

  await prisma.session.create({
    data: {
      exchangeId: marcoHelenaExchange.id,
      hostId: id('marco'),
      title: 'Sketching for non-artists',
      startsAt: days(-12),
      endsAt: days(-12 + 1 / 24),
      status: 'COMPLETED',
      completedAt: days(-12),
      timezone: 'Europe/Rome',
    },
  });

  // ---- conversation between Amara and Lucas, tied to the pending request
  const conversation = await prisma.conversation.create({
    data: {
      directKey: [id('amara'), id('lucas')].sort().join(':'),
      isGroup: false,
      lastMessageAt: days(-1),
      participants: { create: [{ userId: id('amara') }, { userId: id('lucas') }] },
    },
    select: { id: true },
  });

  await prisma.message.createMany({
    data: [
      { conversationId: conversation.id, senderId: id('amara'), body: 'Hi Lucas — I sent you an exchange request. Python for UI design, if you are interested.', createdAt: days(-2) },
      { conversationId: conversation.id, senderId: id('lucas'), body: 'Interested. What would you want to build first?', createdAt: days(-2) },
      { conversationId: conversation.id, senderId: id('amara'), body: 'A small dashboard. I can make it work, I just cannot make it look like anything.', createdAt: days(-1) },
    ],
  });

  // ---- community posts
  const programmingCategory = await prisma.skillCategory.findUnique({ where: { slug: 'programming' }, select: { id: true } });
  const designCategory = await prisma.skillCategory.findUnique({ where: { slug: 'design' }, select: { id: true } });
  const careerCategory = await prisma.skillCategory.findUnique({ where: { slug: 'business-and-career' }, select: { id: true } });

  const post1 = await prisma.communityPost.create({
    data: {
      authorId: id('amara'),
      title: 'How do you teach debugging without just fixing the bug yourself?',
      body: 'I keep catching myself grabbing the keyboard during sessions. The person learns less and I end up doing the work. What has actually worked for you when teaching someone to debug their own code?',
      postType: 'QUESTION',
      categoryId: programmingCategory?.id,
      skillId: skill('Python'),
      voteCount: 7,
    },
    select: { id: true },
  });

  await prisma.communityComment.createMany({
    data: [
      { postId: post1.id, authorId: id('priya'), body: 'Ask them to explain what they expect each line to do before running it. Nine times out of ten they find it themselves. It also slows you down enough that you stop reaching for the keyboard.', voteCount: 5 },
      { postId: post1.id, authorId: id('kwame'), body: 'I make them drive for the whole session, including typing. It is slower for two weeks and then much faster afterwards.', voteCount: 3 },
    ],
  });
  await prisma.communityPost.update({ where: { id: post1.id }, data: { commentCount: 2 } });

  const post2 = await prisma.communityPost.create({
    data: {
      authorId: id('lucas'),
      title: 'A short reading list for developers who want to learn design',
      body: 'I get asked this constantly, so here is the honest version. Read about spacing and hierarchy before you touch a colour picker. Then copy three interfaces you admire, exactly, and notice what you got wrong. The reproduction is where the learning is.',
      postType: 'RESOURCE',
      categoryId: designCategory?.id,
      skillId: skill('UI Design'),
      resourceUrl: 'https://www.refactoringui.com/',
      voteCount: 12,
    },
    select: { id: true },
  });

  await prisma.communityComment.createMany({
    data: [
      { postId: post2.id, authorId: id('chloe'), body: 'The "copy three interfaces exactly" advice is the one that finally made it click for me. Accessible contrast is also worth reading early.', voteCount: 4, isAnswer: false },
      { postId: post2.id, authorId: id('amara'), body: 'Saving this. Starting with spacing feels much less intimidating than learning a whole tool.', voteCount: 2, isAnswer: false },
    ],
  });
  await prisma.communityPost.update({ where: { id: post2.id }, data: { commentCount: 2 } });

  const post3 = await prisma.communityPost.create({
    data: {
      authorId: id('tom'),
      title: 'What actually makes someone good at public speaking?',
      body: 'It is not confidence, and it is not charisma. It is having something specific to say and having said it out loud enough times that you stop reading your own slides. Everything else is decoration.',
      postType: 'DISCUSSION',
      categoryId: careerCategory?.id,
      skillId: skill('Public Speaking'),
      voteCount: 9,
      pinned: true,
    },
    select: { id: true },
  });

  await prisma.communityComment.createMany({
    data: [
      { postId: post3.id, authorId: id('priya'), body: 'The "said it out loud enough times" part is what I am discovering. I know my material cold in my head and then lose it on stage.', voteCount: 3, isAnswer: false },
      { postId: post3.id, authorId: id('nadia'), body: 'Recording yourself is brutal and effective. I started doing one take per week and it changed how I prepare.', voteCount: 2, isAnswer: false },
    ],
  });
  await prisma.communityPost.update({ where: { id: post3.id }, data: { commentCount: 2 } });

  // ---- a notification and an audit entry so the admin/notification pages have data
  await prisma.notification.createMany({
    data: [
      { userId: id('amara'), type: 'EXCHANGE_REQUEST', title: 'New exchange request', body: '@chloe would like to exchange skills with you.', link: '/exchanges/requests' },
      { userId: id('lucas'), type: 'EXCHANGE_REQUEST', title: 'New exchange request', body: '@amara would like to exchange skills with you.', link: '/exchanges/requests' },
      // Mirror the wording the reminder service produces so seeded demo data is
      // not misleading: it quotes the session's real start time.
      { userId: id('priya'), type: 'SESSION_REMINDER', title: 'Session starting soon', body: `"Live coding without panicking" starts at ${days(3).toISOString()}.`, link: '/calendar' },
    ],
  });

  await prisma.auditLog.create({
    data: {
      actorId: id('admin'),
      action: 'seed.completed',
      entityType: 'Platform',
      summary: 'Development seed data created',
      metadata: { members: MEMBERS.length, categories: CATEGORIES.length, skills: skillByName.size },
    },
  });

  console.log('Seed complete.\n');
  console.log('Demo accounts (all use the same password):');
  console.log(`  password: ${DEMO_PASSWORD}`);
  console.log('  admin@skillspring.local     (ADMIN)');
  console.log('  moderator@skillspring.local (MODERATOR)');
  console.log('  amara@example.com           (member, pending request to Lucas)');
  console.log('  lucas@example.com           (member, design ↔ Python)');
  console.log('  priya@example.com           (member, active exchange)');
  console.log('  tom@example.com             (member, active exchange)');
  console.log('  yuki@example.com            (member, completed exchange with reviews)');
  console.log('  sofia@example.com           (member, completed exchange with reviews)');
  console.log('\nThese are development credentials. Remove or rotate them before deploying.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
