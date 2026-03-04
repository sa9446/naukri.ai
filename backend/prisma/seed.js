/**
 * Seed file — creates sample job postings for testing
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding job postings...');

  const jobs = [
    {
      title: 'Senior React Developer',
      company: 'TechCorp India',
      description: 'We are looking for a senior React developer with 5+ years of experience. You will build scalable web applications and lead frontend architecture decisions. Strong knowledge of TypeScript, state management, and testing required.',
      requiredSkills: ['React', 'TypeScript', 'Node.js', 'REST', 'Git', 'TDD'],
      experienceMin: 4,
      experienceMax: 8,
      location: 'Bangalore',
      salary: '₹18-25 LPA',
      jobType: 'full-time',
      domain: 'E-commerce',
      source: 'MANUAL',
    },
    {
      title: 'Data Scientist',
      company: 'FinAnalytics',
      description: 'Join our data science team to build ML models for financial risk analysis. You will work with large datasets, build predictive models, and present insights to business stakeholders.',
      requiredSkills: ['Python', 'Machine Learning', 'SQL', 'Tableau', 'Data Science', 'NLP'],
      experienceMin: 2,
      experienceMax: 6,
      location: 'Mumbai',
      salary: '₹12-20 LPA',
      jobType: 'full-time',
      domain: 'FinTech',
      source: 'MANUAL',
    },
    {
      title: 'Full Stack Engineer',
      company: 'StartupHub',
      description: 'Build end-to-end features for our SaaS platform. You will work on both Node.js backend and React frontend, design APIs, and own features from ideation to production.',
      requiredSkills: ['Node.js', 'React', 'PostgreSQL', 'Docker', 'AWS', 'GraphQL'],
      experienceMin: 2,
      experienceMax: 5,
      location: 'Remote',
      salary: '₹10-18 LPA',
      jobType: 'full-time',
      domain: 'SaaS',
      source: 'MANUAL',
    },
    {
      title: 'DevOps Engineer',
      company: 'CloudSolutions',
      description: 'Manage CI/CD pipelines, Kubernetes clusters, and cloud infrastructure. Work with developers to improve deployment reliability and observability.',
      requiredSkills: ['Kubernetes', 'Docker', 'AWS', 'Terraform', 'CI/CD', 'Linux'],
      experienceMin: 3,
      experienceMax: 7,
      location: 'Hyderabad',
      salary: '₹15-22 LPA',
      jobType: 'full-time',
      domain: 'Cloud',
      source: 'MANUAL',
    },
    {
      title: 'Backend Engineer (Python)',
      company: 'HealthTech',
      description: 'Build robust backend APIs and data pipelines for our healthcare platform. Experience with FastAPI or Django required. Strong understanding of HIPAA compliance preferred.',
      requiredSkills: ['Python', 'FastAPI', 'PostgreSQL', 'Redis', 'Docker', 'REST'],
      experienceMin: 2,
      experienceMax: 6,
      location: 'Delhi',
      salary: '₹10-16 LPA',
      jobType: 'full-time',
      domain: 'Healthcare',
      source: 'MANUAL',
    },
  ];

  for (const job of jobs) {
    await prisma.jobPosting.upsert({
      where: { source_sourceId: { source: 'MANUAL', sourceId: `seed-${job.title.replace(/\s+/g, '-').toLowerCase()}` } },
      update: {},
      create: { ...job, sourceId: `seed-${job.title.replace(/\s+/g, '-').toLowerCase()}` },
    });
  }

  console.log(`Seeded ${jobs.length} job postings.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
