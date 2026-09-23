import { defineNotisApp } from '@notis/sdk/config';

export default defineNotisApp({
  name: 'calories',
  title: 'Calories',
  description:
    'A conversational macro tracker for meals captured with Notis. Complete a guided onboarding to calculate a starting calorie, protein, carbohydrate, and fat target; send meal photos to Notis for structured estimates; then review daily progress and week, month, and year trends.',
  icon: 'phosphor:fork-knife',
  accent: 'emerald',
  author: { name: 'Notis' },
  categories: ['Personal', 'Productivity'],
  tagline: 'Photograph your meals. See your macros add up.',
  screenshots: [
    {
      path: 'metadata/screenshot-1.png',
      alt: 'Calories daily dashboard with macro progress on the left and meal photo entries on the right.',
      route: 'day',
      scenario: 'calories-day',
      focus: '[data-store-screenshot="day"]',
      theme: 'light',
    },
    {
      path: 'metadata/screenshot-2.png',
      alt: 'Calories daily macro dashboard and meal list in dark mode.',
      route: 'day',
      scenario: 'calories-day',
      focus: '[data-store-screenshot="day"]',
      theme: 'dark',
    },
    {
      path: 'metadata/screenshot-3.png',
      alt: 'Calories weekly dashboard with daily calories and average macro balance.',
      route: 'week',
      scenario: 'calories-period',
      focus: '[data-store-screenshot="week"]',
      theme: 'light',
    },
    {
      path: 'metadata/screenshot-4.png',
      alt: 'Calories monthly dashboard showing intake consistency throughout the month.',
      route: 'month',
      scenario: 'calories-period',
      focus: '[data-store-screenshot="month"]',
      theme: 'light',
    },
    {
      path: 'metadata/screenshot-5.png',
      alt: 'Calories yearly dashboard showing monthly intake and long-term macro balance.',
      route: 'year',
      scenario: 'calories-period',
      focus: '[data-store-screenshot="year"]',
      theme: 'dark',
    },
  ],
  databases: [{ slug: 'macro_meals', seedDocuments: true }, { slug: 'macro_goals', seedDocuments: true }],
  skills: [
    {
      key: 'calories',
      path: './skills/calories/',
      name: 'calories',
      description:
        'Calculate personal macro targets during onboarding and turn meal photos or descriptions into structured macro entries.',
    },
  ],
  onboarding: {
    skill: 'calories',
    prompt: 'Help me figure out how many calories, protein, carbs, and fat I should aim for each day.',
  },
  routes: [
    {
      path: '/',
      slug: 'day',
      name: 'Day',
      icon: 'phosphor:sun',
      default: true,
      resourceDeepLinks: true,
    },
    {
      path: '/week',
      slug: 'week',
      name: 'Week',
      icon: 'phosphor:calendar-dots',
      resourceDeepLinks: true,
    },
    {
      path: '/month',
      slug: 'month',
      name: 'Month',
      icon: 'phosphor:calendar',
      resourceDeepLinks: true,
    },
    {
      path: '/year',
      slug: 'year',
      name: 'Year',
      icon: 'phosphor:chart-line-up',
      resourceDeepLinks: true,
    },
  ],
  tools: ['LOCAL_NOTIS_DATABASE_QUERY'],
});
