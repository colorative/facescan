export type Category = 'attendee' | 'speaker' | 'vip' | 'staff'

export type Attendee = {
  id: string
  badgeNo: string
  name: string
  company: string
  role: string
  category: Category
}

/** Colour band per category — the one place badge colour is decided. */
export const CATEGORY_STYLE: Record<Category, { label: string; color: string }> = {
  attendee: { label: 'Attendee', color: 'var(--color-accent)' },
  speaker: { label: 'Speaker', color: 'var(--color-violet)' },
  vip: { label: 'VIP', color: 'var(--color-amber)' },
  staff: { label: 'Staff', color: 'var(--color-green)' },
}

export const MOCK_ATTENDEES: Attendee[] = [
  {
    id: 'a1',
    badgeNo: 'A-1042',
    name: 'Shaun Alam',
    company: 'TEKS Systems',
    role: 'Head of Product',
    category: 'speaker',
  },
  {
    id: 'a2',
    badgeNo: 'A-2318',
    name: 'Priya Raghunathan',
    company: 'Northwind Analytics',
    role: 'Data Scientist',
    category: 'attendee',
  },
  {
    id: 'a3',
    badgeNo: 'A-0007',
    name: 'Marcus Oyelaran',
    company: 'Vertex Capital',
    role: 'Managing Partner',
    category: 'vip',
  },
  {
    id: 'a4',
    badgeNo: 'A-3901',
    name: 'Yuki Tanaka',
    company: 'Eventify',
    role: 'Floor Lead',
    category: 'staff',
  },
]
