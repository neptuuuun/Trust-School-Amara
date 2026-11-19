/**
 * Public Home page — «معرض الصور» visibility.
 *
 * The gallery is PUBLIC content: it must render identically for anonymous
 * visitors and for signed-in students, admins and owners. Nothing about the
 * section is auth-dependent, and these tests exist to keep it that way.
 *
 * They also pin the failure mode that actually hid it in production: the
 * section is driven by `GET /api/public/website`, so any failed read (a 429
 * from the shared /api rate-limit bucket, a cold backend, a network blip) used
 * to collapse the gallery to `[]` and silently delete the section from the page
 * — for exactly the users who make enough API calls to trip it, i.e. signed-in
 * ones.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import HomePage from './HomePage';
import Header from '../components/Header';
import { WebsiteSettingsProvider } from '../contexts/WebsiteSettingsContext';
import { fetchPublicWebsite } from '../services/publicWebsiteService';
import { useBranch } from '../contexts/BranchContext';
import { useAuth } from '../contexts/AuthContext';

jest.mock('../services/publicWebsiteService', () => ({ fetchPublicWebsite: jest.fn() }));
jest.mock('../contexts/BranchContext', () => ({ useBranch: jest.fn() }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
// The bell is the one component the public header mounts ONLY for signed-in
// users; stub it so these tests exercise the gallery, not Firestore.
jest.mock('../components/notifications/NotificationBell', () => () => null);

const GALLERY = [
  { id: 'g1', url: 'https://example.test/1.webp', caption: 'حفل التخرج', order: 1 },
  { id: 'g2', url: 'https://example.test/2.webp', caption: 'مسابقة', order: 2 },
];

const SETTINGS = {
  hero: { title: 'مرحباً', subtitle: 'الثقة في التعليم', buttonText: 'تواصل معنا', buttonLink: '/contact' },
  contact: {},
  social: {},
  branches: [],
  gallery: GALLERY,
  faq: [],
};

/** Auth shapes the public header can be rendered under. */
const AUTH_STATES = {
  'logged-out visitor': { user: null, role: null, loading: false },
  'signed-in student': { user: { uid: 'u1' }, role: 'student', loading: false },
  'signed-in admin': { user: { uid: 'a1' }, role: 'admin', loading: false },
  'signed-in owner': { user: { uid: 'o1' }, role: 'owner', loading: false },
};

const renderHome = () =>
  render(
    <MemoryRouter initialEntries={['/home']}>
      <WebsiteSettingsProvider>
        <Header />
        <HomePage />
      </WebsiteSettingsProvider>
    </MemoryRouter>
  );

beforeEach(() => {
  jest.clearAllMocks();
  useBranch.mockReturnValue({ selectedBranchId: 'boumerdes', selectBranch: jest.fn() });
  useAuth.mockReturnValue(AUTH_STATES['logged-out visitor']);
  fetchPublicWebsite.mockResolvedValue({ settings: SETTINGS });
});

describe('Home page gallery visibility', () => {
  Object.entries(AUTH_STATES).forEach(([label, auth]) => {
    it(`renders «معرض الصور» with every image for a ${label}`, async () => {
      useAuth.mockReturnValue({ ...auth, logout: jest.fn() });
      renderHome();

      expect(await screen.findByRole('heading', { name: 'معرض الصور' })).toBeInTheDocument();

      // Same content for everyone — not a reduced or separate gallery.
      const images = await screen.findAllByRole('img', { name: /حفل التخرج|مسابقة/ });
      expect(images).toHaveLength(GALLERY.length);
      expect(images.map((img) => img.getAttribute('src'))).toEqual(GALLERY.map((g) => g.url));
    });
  });

  // The pre-fix behaviour, pinned so it cannot come back: an empty read removes
  // the section outright. That is why a transient failure was indistinguishable
  // from "the owner deleted every photo", and why the read must now retry
  // (see publicWebsiteService) rather than give up after one attempt.
  it('renders no gallery section when the settings read yields nothing', async () => {
    fetchPublicWebsite.mockResolvedValue({ settings: { ...SETTINGS, gallery: [] } });
    useAuth.mockReturnValue({ ...AUTH_STATES['signed-in student'], logout: jest.fn() });
    renderHome();

    await screen.findByRole('heading', { name: 'خدماتنا التعليمية' });
    expect(screen.queryByRole('heading', { name: 'معرض الصور' })).not.toBeInTheDocument();
  });
});
